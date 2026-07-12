// routes/payslips.js — bulletins de paie : CRUD, cotisations par défaut, recalcul des totaux.
const express = require('express');
const { connectDB } = require('../lib/db');
const Payslip = require('../models/Payslip');
const { defaultContributions, defaultContributionsMU, computeTotals, computePayeMU, PMSS_DEFAULT } = require('../lib/payroll');

const router = express.Router();

async function ensureDB(res) {
  try { await connectDB(); return true; }
  catch (err) { res.status(503).json({ error: 'Base de données indisponible', detail: err.message }); return false; }
}

function applyBody(doc, b) {
  const top = ['company', 'country', 'currency', 'month', 'periodLabel', 'periodFrom', 'periodTo', 'paymentDate',
    'baseSalary', 'workedHours', 'hourlyRate', 'pmss', 'nsfCeiling', 'csgThreshold', 'taxRate',
    'taxMode', 'taxFixedAmount', 'edfReliefs', 'monthsPerYear', 'expenseReimbursement', 'notes'];
  for (const f of top) if (b[f] !== undefined) doc[f] = b[f];
  if (b.employer !== undefined) doc.employer = b.employer;
  if (b.employee !== undefined) doc.employee = b.employee;
  if (b.gains !== undefined) doc.gains = b.gains;
  if (b.contributions !== undefined) doc.contributions = b.contributions;
  const t = computeTotals(doc);
  Object.assign(doc, t);
}

// POST /payslips/default-contributions — modèle de cotisations (non persistant), France ou Maurice.
// POST /payslips/compute-paye — PAYE mauricien calculé depuis le barème MRA.
router.post('/compute-paye', (req, res) => {
  const { monthlyGross, monthsPerYear, reliefs, brackets } = req.body || {};
  try {
    res.json(computePayeMU({ monthlyGross, monthsPerYear, reliefs, brackets }));
  } catch (err) { res.status(400).json({ error: 'Calcul PAYE échoué', detail: err.message }); }
});

router.post('/default-contributions', async (req, res) => {
  const { brut, pmss, isCadre, country, nsfCeiling, csgThreshold } = req.body || {};
  const b = Number(brut) || 0;
  try {
    if (country === 'MU') {
      return res.json({ contributions: defaultContributionsMU(b, { nsfCeiling, csgThreshold }), country: 'MU' });
    }
    const p = Number(pmss) || PMSS_DEFAULT;
    res.json({ contributions: defaultContributions(b, p, !!isCadre), pmss: p, country: 'FR' });
  } catch (err) { res.status(400).json({ error: 'Génération échouée', detail: err.message }); }
});

router.get('/', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { company, month, status } = req.query;
  const filter = {};
  if (company) filter.company = company;
  if (month) filter.month = month;
  if (status) filter.status = status;
  try {
    const items = await Payslip.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json({ items });
  } catch (err) { res.status(500).json({ error: 'Lecture échouée', detail: err.message }); }
});

router.get('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const p = await Payslip.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Introuvable' });
    res.json(p);
  } catch (err) { res.status(400).json({ error: 'Lecture échouée', detail: err.message }); }
});

router.post('/', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const p = new Payslip();
    applyBody(p, req.body || {});
    await p.save();
    res.status(201).json(p);
  } catch (err) { res.status(400).json({ error: 'Création échouée', detail: err.message }); }
});

router.patch('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const p = await Payslip.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Introuvable' });
    if (p.status === 'finalized' && req.body.status !== 'draft') {
      return res.status(409).json({ error: 'Bulletin finalisé : rouvrez-le (statut brouillon) pour le modifier.' });
    }
    applyBody(p, req.body || {});
    if (req.body.status !== undefined) p.status = req.body.status;
    await p.save();
    res.json(p);
  } catch (err) { res.status(400).json({ error: 'Mise à jour échouée', detail: err.message }); }
});

router.post('/:id/finalize', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const p = await Payslip.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Introuvable' });
    p.status = 'finalized';
    await p.save();
    res.json(p);
  } catch (err) { res.status(400).json({ error: 'Finalisation échouée', detail: err.message }); }
});

router.post('/:id/reopen', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const p = await Payslip.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Introuvable' });
    p.status = 'draft';
    await p.save();
    res.json(p);
  } catch (err) { res.status(400).json({ error: 'Réouverture échouée', detail: err.message }); }
});

router.delete('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const p = await Payslip.findByIdAndDelete(req.params.id);
    if (!p) return res.status(404).json({ error: 'Introuvable' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) { res.status(400).json({ error: 'Suppression échouée', detail: err.message }); }
});

module.exports = router;
