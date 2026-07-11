// routes/ledger.js — Grand Livre (brouillon) : génération, lecture, rejet, rapports.
const express = require('express');
const { connectDB } = require('../lib/db');
const LedgerEntry = require('../models/LedgerEntry');
const { generate, refresh, pending } = require('../lib/ledger');
const LedgerDraft = require('../models/LedgerDraft');

const router = express.Router();

async function ensureDB(res) {
  try { await connectDB(); return true; }
  catch (err) { res.status(503).json({ error: 'Base de données indisponible', detail: err.message }); return false; }
}


async function upsertDraft(company, standard, from, to, patch) {
  return LedgerDraft.findOneAndUpdate(
    { company, standard, from, to },
    { $set: patch, $setOnInsert: { company, standard, from, to } },
    { new: true, upsert: true }
  );
}

function requireParams(res, obj, keys) {
  for (const k of keys) if (!obj[k]) { res.status(400).json({ error: `Paramètre requis : ${k}` }); return false; }
  return true;
}

// POST /ledger/generate { company, standard, from, to }
router.post('/generate', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { company, standard, from, to } = req.body || {};
  if (!requireParams(res, { company, standard, from, to }, ['company', 'standard', 'from', 'to'])) return;
  try {
    const r = await generate({ company, standard, from, to });
    const draft = await upsertDraft(company, standard, from, to, { generatedAt: new Date() });
    res.json({ ok: true, ...r, draft });
  } catch (err) {
    res.status(500).json({ error: 'Génération échouée', detail: err.message });
  }
});

// GET /ledger?company=&standard=&from=&to=&status=&q=
router.get('/', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { company, standard, from, to, status, q } = req.query;
  if (!requireParams(res, { company, standard }, ['company', 'standard'])) return;
  const filter = { company, standard };
  if (from || to) filter.date = {};
  if (from) filter.date.$gte = from;
  if (to) filter.date.$lte = to;
  if (status) filter.status = status;
  if (q) filter.$or = [{ label: { $regex: q, $options: 'i' } }, { 'account.label': { $regex: q, $options: 'i' } }, { 'account.code': { $regex: q, $options: 'i' } }];
  try {
    const items = await LedgerEntry.find(filter).sort({ date: 1, pieceRef: 1, _id: 1 }).limit(8000);
    let debit = 0, credit = 0;
    for (const e of items) if (e.status === 'included') { debit += e.debit; credit += e.credit; }
    res.json({ items, totals: { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 } });
  } catch (err) {
    res.status(500).json({ error: 'Lecture échouée', detail: err.message });
  }
});

// GET /ledger/status — brouillon enregistré + compteur de données à intégrer
router.get('/status', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { company, standard, from, to } = req.query;
  if (!requireParams(res, { company, standard, from, to }, ['company', 'standard', 'from', 'to'])) return;
  try {
    const [draft, pend, count] = await Promise.all([
      LedgerDraft.findOne({ company, standard, from, to }),
      pending({ company, standard, from, to }),
      LedgerEntry.countDocuments({ company, standard, date: { $gte: from, $lte: to } }),
    ]);
    res.json({ draft, pending: pend, ledgerLegs: count });
  } catch (err) {
    res.status(500).json({ error: 'Statut échoué', detail: err.message });
  }
});

// GET /ledger/drafts — brouillons enregistrés (pour rouvrir un enregistrement)
router.get('/drafts', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { company } = req.query;
  const filter = { savedAt: { $ne: null } };
  if (company) filter.company = company;
  try {
    const items = await LedgerDraft.find(filter).sort({ savedAt: -1 }).limit(100);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Lecture des brouillons échouée', detail: err.message });
  }
});

// GET /ledger/:id — un leg + ses legs frères (la pièce complète) + provenance.
router.get('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const entry = await LedgerEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Introuvable' });
    const piece = await LedgerEntry.find({ sourceKey: entry.sourceKey }).sort({ debit: -1 });
    res.json({ entry, piece, source: entry.source });
  } catch (err) {
    res.status(400).json({ error: 'Lecture échouée', detail: err.message });
  }
});

// POST /ledger/reject { sourceKey } | { id }   → rejette toute la pièce
// POST /ledger/restore { sourceKey } | { id }
async function setStatus(req, res, status) {
  if (!(await ensureDB(res))) return;
  let { sourceKey, id } = req.body || {};
  try {
    if (!sourceKey && id) {
      const e = await LedgerEntry.findById(id);
      if (!e) return res.status(404).json({ error: 'Introuvable' });
      sourceKey = e.sourceKey;
    }
    if (!sourceKey) return res.status(400).json({ error: 'sourceKey ou id requis.' });
    const r = await LedgerEntry.updateMany({ sourceKey }, { $set: { status } });
    res.json({ ok: true, sourceKey, status, modified: r.modifiedCount });
  } catch (err) {
    res.status(400).json({ error: 'Changement de statut échoué', detail: err.message });
  }
}
router.post('/reject', (req, res) => setStatus(req, res, 'rejected'));
router.post('/restore', (req, res) => setStatus(req, res, 'included'));

// GET /ledger/reports?company=&standard=&from=&to=
// → balance par compte + synthèse Résultat (produits − charges), sur les lignes incluses.
router.get('/reports/summary', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { company, standard, from, to } = req.query;
  if (!requireParams(res, { company, standard }, ['company', 'standard'])) return;
  const filter = { company, standard, status: 'included' };
  if (from || to) filter.date = {};
  if (from) filter.date.$gte = from;
  if (to) filter.date.$lte = to;
  try {
    const legs = await LedgerEntry.find(filter);
    const byAccount = {};
    let totalDebit = 0, totalCredit = 0, revenue = 0, expense = 0;
    for (const l of legs) {
      const key = (l.account?.code || '') + '|' + (l.account?.label || '');
      if (!byAccount[key]) byAccount[key] = { code: l.account?.code || null, label: l.account?.label || '—', type: l.account?.type || null, debit: 0, credit: 0 };
      byAccount[key].debit += l.debit;
      byAccount[key].credit += l.credit;
      totalDebit += l.debit; totalCredit += l.credit;
      if (l.account?.type === 'revenue') revenue += l.credit - l.debit;
      if (l.account?.type === 'expense') expense += l.debit - l.credit;
    }
    const rd = (n) => Math.round(n * 100) / 100;
    const balance = Object.values(byAccount)
      .map((a) => ({ ...a, debit: rd(a.debit), credit: rd(a.credit), solde: rd(a.debit - a.credit) }))
      .sort((a, b) => (a.code || a.label).localeCompare(b.code || b.label));
    res.json({
      balance,
      totals: { debit: rd(totalDebit), credit: rd(totalCredit), balanced: rd(totalDebit) === rd(totalCredit) },
      pl: { revenue: rd(revenue), expense: rd(expense), result: rd(revenue - expense) },
    });
  } catch (err) {
    res.status(500).json({ error: 'Rapport échoué', detail: err.message });
  }
});


// POST /ledger/refresh — intègre uniquement les nouvelles opérations (incrémental)
router.post('/refresh', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { company, standard, from, to } = req.body || {};
  if (!requireParams(res, { company, standard, from, to }, ['company', 'standard', 'from', 'to'])) return;
  try {
    const r = await refresh({ company, standard, from, to });
    const draft = await upsertDraft(company, standard, from, to, { refreshedAt: new Date() });
    res.json({ ok: true, ...r, draft });
  } catch (err) {
    res.status(500).json({ error: 'Rafraîchissement échoué', detail: err.message });
  }
});

// POST /ledger/save — enregistre le brouillon (horodatage)
router.post('/save', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { company, standard, from, to, label } = req.body || {};
  if (!requireParams(res, { company, standard, from, to }, ['company', 'standard', 'from', 'to'])) return;
  try {
    const patch = { savedAt: new Date() };
    if (label !== undefined) patch.label = label;
    const draft = await upsertDraft(company, standard, from, to, patch);
    res.json({ ok: true, draft });
  } catch (err) {
    res.status(500).json({ error: 'Enregistrement échoué', detail: err.message });
  }
});

module.exports = router;
