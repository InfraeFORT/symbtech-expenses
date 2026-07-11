// routes/simulations.js — simulations d'impôt : CRUD, barèmes par défaut, pré-remplissage.
const express = require('express');
const { connectDB } = require('../lib/db');
const Simulation = require('../models/Simulation');
const { defaultBrackets, defaultFairShare, computeSim, round } = require('../lib/tax');

const router = express.Router();

async function ensureDB(res) {
  try { await connectDB(); return true; }
  catch (err) { res.status(503).json({ error: 'Base de données indisponible', detail: err.message }); return false; }
}

function monthsBetween(a, b) {
  if (!a || !b) return 0;
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return Math.max(0, (by - ay) * 12 + (bm - am) + 1);
}

function applyBody(doc, b) {
  const top = ['kind', 'title', 'country', 'company', 'person', 'supplierId', 'currency',
    'fiscalYearLabel', 'periodFrom', 'periodTo', 'notes', 'parts', 'withheld',
    'fairShareEnabled', 'fairShareThreshold', 'fairShareRate', 'status'];
  for (const f of top) if (b[f] !== undefined) doc[f] = b[f];
  if (b.lines !== undefined) doc.lines = b.lines;
  if (b.brackets !== undefined) doc.brackets = b.brackets;
  Object.assign(doc, computeSim(doc));
}

// utilitaires période
function monthsBetween2(a, b) { return monthsBetween(a, b); }
function prorataValue(cStart, cEnd, pFrom, pTo, value) {
  if (!cStart || !cEnd) return value; // pas de dates : valeur pleine
  const cs = new Date(cStart), ce = new Date(cEnd);
  const ps = pFrom ? new Date(pFrom) : cs;
  const pe = pTo ? new Date(pTo) : ce;
  const s = new Date(Math.max(cs, ps));
  const e = new Date(Math.min(ce, pe));
  const dur = (ce - cs) / 86400000;
  const ov = (e - s) / 86400000;
  if (!(dur > 0) || !(ov > 0)) return 0;
  return round(value * Math.min(1, ov / dur));
}

// POST /simulations/defaults — barème + Fair Share par défaut pour un pays + type.
router.post('/defaults', (req, res) => {
  const { country, kind } = req.body || {};
  res.json({ brackets: defaultBrackets(country || 'MU', kind || 'employee'), fairShare: defaultFairShare(country || 'MU', kind || 'employee') });
});

// POST /simulations/prefill — agrège le réel (factures/charges/bulletins) et les prévisions (contrats/salaire).
router.post('/prefill', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const b = req.body || {};
  const { kind, country, company, person, supplierId, periodFrom, periodTo } = b;
  const lines = [];
  let withheld = 0;
  let currency = b.currency || null;
  try {
    if (kind === 'employee') {
      const Payslip = require('../models/Payslip');
      const from7 = (periodFrom || '').slice(0, 7);
      const to7 = (periodTo || '').slice(0, 7);
      const q = {};
      if (person) q['employee.name'] = person;
      const slips = await Payslip.find(q).limit(500);
      const inPeriod = slips.filter((s) => s.month && (!from7 || s.month >= from7) && (!to7 || s.month <= to7));
      const gross = inPeriod.reduce((s, x) => s + (Number(x.grossTotal) || 0), 0);
      withheld = inPeriod.reduce((s, x) => s + (Number(x.taxAmount) || 0), 0);
      if (inPeriod[0] && inPeriod[0].currency) currency = currency || inPeriod[0].currency;
      if (gross) lines.push({ label: `Rémunérations versées (réel, ${inPeriod.length} bulletin(s))`, type: 'income', nature: 'real', amount: round(gross) });
      if (supplierId) {
        const Supplier = require('../models/Supplier');
        const sup = await Supplier.findById(supplierId).catch(() => null);
        const emp = sup && sup.employment ? sup.employment : null;
        if (emp && emp.monthlyGross) {
          const totalMonths = monthsBetween(from7, to7);
          const remainingMonths = Math.max(0, totalMonths - inPeriod.length);
          if (remainingMonths > 0) lines.push({ label: `Rémunérations à verser (prévision, ${remainingMonths} mois)`, type: 'income', nature: 'forecast', amount: round(emp.monthlyGross * remainingMonths) });
          if (!currency && emp.currency) currency = emp.currency;
        }
      }
    } else if (kind === 'company') {
      const Invoice = require('../models/Invoice');
      const inv = await Invoice.find({ issuerCompany: company }).limit(2000);
      const invIn = inv.filter((i) => i.date && (!periodFrom || i.date >= periodFrom) && (!periodTo || i.date <= periodTo) && ['issued', 'paid'].includes(i.status));
      const ca = invIn.reduce((s, i) => s + (Number(i.total) || 0), 0);
      if (ca) lines.push({ label: `Chiffre d'affaires réalisé (${invIn.length} facture(s))`, type: 'income', nature: 'real', amount: round(ca) });
      try {
        const Expense = require('../models/Expense');
        const exp = await Expense.find({ company }).limit(3000);
        const expIn = exp.filter((e) => e.date && (!periodFrom || e.date >= periodFrom) && (!periodTo || e.date <= periodTo));
        const ch = expIn.reduce((s, e) => s + (Number(e.amount) || Number(e.subtotal) || 0), 0);
        if (ch) lines.push({ label: `Charges réalisées (${expIn.length} dépense(s))`, type: 'charge', nature: 'real', amount: round(ch) });
      } catch (e) { /* modèle absent */ }
      try {
        const Contract = require('../models/Contract');
        const con = await Contract.find({ company, active: true }).limit(500);
        let val = 0;
        for (const c of con) val += prorataValue(c.startDate, c.endDate, periodFrom, periodTo, Number(c.value) || 0);
        if (val) lines.push({ label: `Prévision contrats clients (${con.length}, prorata période)`, type: 'income', nature: 'forecast', amount: round(val) });
      } catch (e) { /* */ }
      try {
        const Supplier = require('../models/Supplier');
        const emps = (await Supplier.find({ isEmployee: true }).limit(500)).filter((x) => x.employment && Number(x.employment.monthlyGross) > 0);
        if (emps.length) {
          const from7 = (periodFrom || '').slice(0, 7);
          const to7 = (periodTo || '').slice(0, 7);
          const months = monthsBetween(from7, to7) || 12;
          const mass = emps.reduce((s, x) => s + (Number(x.employment.monthlyGross) || 0), 0) * months;
          if (mass) lines.push({ label: `Masse salariale prévisionnelle (${emps.length} salarié(s), ${months} mois)`, type: 'charge', nature: 'forecast', amount: round(mass), note: 'Tous salariés — à ajuster selon la société' });
        }
      } catch (e) { /* */ }
    }
    res.json({ lines, withheld: round(withheld), currency, brackets: defaultBrackets(country || 'MU', kind || 'employee'), fairShare: defaultFairShare(country || 'MU', kind || 'employee') });
  } catch (err) { res.status(400).json({ error: 'Pré-remplissage échoué', detail: err.message }); }
});

router.get('/', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { kind, company, person } = req.query;
  const filter = {};
  if (kind) filter.kind = kind;
  if (company) filter.company = company;
  if (person) filter.person = person;
  try {
    const items = await Simulation.find(filter).sort({ updatedAt: -1 }).limit(500);
    res.json({ items });
  } catch (err) { res.status(500).json({ error: 'Lecture échouée', detail: err.message }); }
});

router.get('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const s = await Simulation.findById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Introuvable' });
    res.json(s);
  } catch (err) { res.status(400).json({ error: 'Lecture échouée', detail: err.message }); }
});

router.post('/', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const s = new Simulation();
    applyBody(s, req.body || {});
    await s.save();
    res.status(201).json(s);
  } catch (err) { res.status(400).json({ error: 'Création échouée', detail: err.message }); }
});

router.patch('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const s = await Simulation.findById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Introuvable' });
    applyBody(s, req.body || {});
    await s.save();
    res.json(s);
  } catch (err) { res.status(400).json({ error: 'Mise à jour échouée', detail: err.message }); }
});

router.delete('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const s = await Simulation.findByIdAndDelete(req.params.id);
    if (!s) return res.status(404).json({ error: 'Introuvable' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) { res.status(400).json({ error: 'Suppression échouée', detail: err.message }); }
});

module.exports = router;
