// routes/cra.js — feuilles de temps : CRUD, soumission/approbation, génération de facture (production).
const express = require('express');
const { connectDB } = require('../lib/db');
const Cra = require('../models/Cra');
const Invoice = require('../models/Invoice');
const Contract = require('../models/Contract');
const Avenant = require('../models/Avenant');

const router = express.Router();

async function ensureDB(res) {
  try { await connectDB(); return true; }
  catch (err) { res.status(503).json({ error: 'Base de données indisponible', detail: err.message }); return false; }
}

function dayTotal(days) {
  let s = 0;
  for (const k in (days || {})) s += Number(days[k]) || 0;
  return s;
}

// Cumul par jour (toutes activités) + détection de valeurs hors bornes.
function coherenceIssues(activities) {
  const EPS = 1e-6;
  const perDay = {};
  const issues = [];
  for (const a of activities || []) {
    for (const k in (a.days || {})) {
      const v = Number(a.days[k]) || 0;
      if (v < 0 || v > 1 + EPS) issues.push(`Activité « ${a.label || ''} », jour ${k} : ${v} (attendu entre 0 et 1).`);
      perDay[k] = (perDay[k] || 0) + v;
    }
  }
  for (const k in perDay) if (perDay[k] > 1 + EPS) issues.push(`Jour ${k} : ${Math.round(perDay[k] * 100) / 100} j cumulés (maximum 1 j/jour).`);
  return issues;
}

function computeTotals(activities) {
  let subtotal = 0, vatTotal = 0, production = 0, absence = 0, internal = 0;
  for (const a of activities || []) {
    const d = dayTotal(a.days);
    if (a.category === 'production') {
      const ht = d * (Number(a.unitPrice) || 0);
      subtotal += ht;
      vatTotal += (ht * (Number(a.vatRate) || 0)) / 100;
      production += d;
    } else if (a.category === 'absence') absence += d;
    else internal += d;
  }
  const r = (n) => Math.round(n * 100) / 100;
  return {
    subtotal: r(subtotal), vatTotal: r(vatTotal), total: r(subtotal + vatTotal),
    productionDays: r(production), absenceDays: r(absence), internalDays: r(internal),
    quantityTotal: r(production + absence + internal),
  };
}

function applyBody(doc, b) {
  const fields = ['company', 'clientId', 'clientName', 'contractId', 'orderId', 'orderNumber',
    'reference', 'title', 'person', 'month', 'periodLabel', 'currency', 'notes'];
  for (const f of fields) if (b[f] !== undefined) doc[f] = b[f];
  if (b.activities !== undefined) { doc.activities = b.activities; doc.markModified('activities'); }
  const t = computeTotals(doc.activities);
  doc.subtotal = t.subtotal; doc.vatTotal = t.vatTotal; doc.total = t.total;
  doc.productionDays = t.productionDays; doc.absenceDays = t.absenceDays;
  doc.internalDays = t.internalDays; doc.quantityTotal = t.quantityTotal;
}

async function aggregateMentions(contractId) {
  const parts = [];
  if (contractId) {
    const contract = await Contract.findById(contractId);
    if (contract && contract.mentions) parts.push(contract.mentions);
    const avenants = await Avenant.find({ contractId }).sort('date');
    for (const a of avenants) if (a.mentions) parts.push(`Avenant ${a.version || ''} : ${a.mentions}`.trim());
  }
  return parts.filter(Boolean).join('\n');
}

router.get('/', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { status, client, issuer, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (client) filter.clientId = client;
  if (issuer) filter.company = issuer;
  if (q) filter.$or = [{ reference: { $regex: q, $options: 'i' } }, { title: { $regex: q, $options: 'i' } }, { person: { $regex: q, $options: 'i' } }];
  try {
    const items = await Cra.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json({ items });
  } catch (err) { res.status(500).json({ error: 'Lecture CRA échouée', detail: err.message }); }
});

router.get('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const cra = await Cra.findById(req.params.id);
    if (!cra) return res.status(404).json({ error: 'Introuvable' });
    res.json(cra);
  } catch (err) { res.status(400).json({ error: 'Lecture échouée', detail: err.message }); }
});

router.post('/', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const cra = new Cra();
    applyBody(cra, req.body || {});
    await cra.save();
    res.status(201).json(cra);
  } catch (err) { res.status(400).json({ error: 'Création échouée', detail: err.message }); }
});

router.patch('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const cra = await Cra.findById(req.params.id);
    if (!cra) return res.status(404).json({ error: 'Introuvable' });
    if (cra.status !== 'draft') return res.status(409).json({ error: 'Feuille non modifiable (déjà soumise).' });
    applyBody(cra, req.body || {});
    await cra.save();
    res.json(cra);
  } catch (err) { res.status(400).json({ error: 'Mise à jour échouée', detail: err.message }); }
});

router.post('/:id/submit', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const cra = await Cra.findById(req.params.id);
    if (!cra) return res.status(404).json({ error: 'Introuvable' });
    if (cra.status !== 'draft') return res.status(409).json({ error: 'Déjà soumise.' });
    if (cra.quantityTotal <= 0) return res.status(400).json({ error: 'Saisissez au moins une journée d’activité.' });
    const issues = coherenceIssues(cra.activities);
    if (issues.length) return res.status(400).json({ error: 'Incohérences à corriger : ' + issues.join(' '), issues });
    cra.status = 'submitted';
    cra.submittedAt = new Date();
    await cra.save();
    res.json(cra);
  } catch (err) { res.status(400).json({ error: 'Soumission échouée', detail: err.message }); }
});

router.post('/:id/approve', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const cra = await Cra.findById(req.params.id);
    if (!cra) return res.status(404).json({ error: 'Introuvable' });
    if (cra.status !== 'submitted') return res.status(409).json({ error: 'La feuille doit être soumise.' });
    cra.status = 'approved';
    cra.approvedAt = new Date();
    if (req.body && req.body.note !== undefined) cra.approverNote = req.body.note;
    await cra.save();
    res.json(cra);
  } catch (err) { res.status(400).json({ error: 'Approbation échouée', detail: err.message }); }
});

router.post('/:id/reject', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const cra = await Cra.findById(req.params.id);
    if (!cra) return res.status(404).json({ error: 'Introuvable' });
    if (cra.status !== 'submitted') return res.status(409).json({ error: 'La feuille doit être soumise.' });
    cra.status = 'rejected';
    if (req.body && req.body.note !== undefined) cra.approverNote = req.body.note;
    await cra.save();
    res.json(cra);
  } catch (err) { res.status(400).json({ error: 'Refus échoué', detail: err.message }); }
});

router.post('/:id/reopen', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const cra = await Cra.findById(req.params.id);
    if (!cra) return res.status(404).json({ error: 'Introuvable' });
    if (!['rejected', 'submitted'].includes(cra.status)) return res.status(409).json({ error: 'Réouverture impossible.' });
    cra.status = 'draft';
    await cra.save();
    res.json(cra);
  } catch (err) { res.status(400).json({ error: 'Réouverture échouée', detail: err.message }); }
});

// POST /cra/:id/invoice — approuvé -> facture brouillon depuis les activités de PRODUCTION.
router.post('/:id/invoice', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const cra = await Cra.findById(req.params.id);
    if (!cra) return res.status(404).json({ error: 'Introuvable' });
    if (cra.status !== 'approved') return res.status(409).json({ error: 'Seule une feuille approuvée peut être facturée.' });
    if (cra.invoiceId) {
      const existing = await Invoice.findById(cra.invoiceId);
      if (existing) return res.json({ ok: true, alreadyInvoiced: true, invoiceId: String(existing._id), number: existing.number });
    }
    const prod = (cra.activities || []).filter((a) => a.category === 'production' && dayTotal(a.days) > 0);
    if (prod.length === 0) return res.status(400).json({ error: 'Aucune activité de production à facturer.' });
    const periodSuffix = cra.periodLabel || cra.month || '';
    const lines = prod.map((a) => ({
      description: [a.label, a.clientRef].filter(Boolean).join(' — ') + (periodSuffix ? ` (${periodSuffix})` : ''),
      quantity: dayTotal(a.days), unitPrice: a.unitPrice, vatRate: a.vatRate,
    }));
    let subtotal = 0, vatTotal = 0;
    for (const l of lines) { const ht = l.quantity * (Number(l.unitPrice) || 0); subtotal += ht; vatTotal += ht * (Number(l.vatRate) || 0) / 100; }
    const r = (n) => Math.round(n * 100) / 100;
    const mentions = await aggregateMentions(cra.contractId);
    const inv = new Invoice({
      status: 'draft',
      issuerCompany: cra.company, issuer: {},
      clientId: cra.clientId, client: { name: cra.clientName },
      date: new Date().toISOString().slice(0, 10), currency: cra.currency,
      lines, subtotal: r(subtotal), vatTotal: r(vatTotal), total: r(subtotal + vatTotal),
      notes: cra.title ? `Feuille de temps : ${cra.title}${periodSuffix ? ' (' + periodSuffix + ')' : ''}` : (periodSuffix ? `Feuille de temps ${periodSuffix}` : null),
      orderId: cra.orderId || null, orderNumber: cra.orderNumber || null, contractId: cra.contractId || null,
      mentions: mentions || null,
    });
    await inv.save();
    cra.status = 'invoiced';
    cra.invoiceId = String(inv._id);
    await cra.save();
    res.json({ ok: true, invoiceId: String(inv._id), cra });
  } catch (err) { res.status(400).json({ error: 'Génération de facture échouée', detail: err.message }); }
});

router.delete('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const cra = await Cra.findByIdAndDelete(req.params.id);
    if (!cra) return res.status(404).json({ error: 'Introuvable' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) { res.status(400).json({ error: 'Suppression échouée', detail: err.message }); }
});

module.exports = router;
