// routes/quotes.js — devis : CRUD, totaux, numérotation à l'émission, conversion en facture.
const express = require('express');
const { connectDB } = require('../lib/db');
const Quote = require('../models/Quote');
const Invoice = require('../models/Invoice');

const router = express.Router();

async function ensureDB(res) {
  try { await connectDB(); return true; }
  catch (err) { res.status(503).json({ error: 'Base de données indisponible', detail: err.message }); return false; }
}

function computeTotals(lines) {
  let subtotal = 0, vatTotal = 0;
  for (const l of lines || []) {
    const ht = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
    subtotal += ht;
    vatTotal += (ht * (Number(l.vatRate) || 0)) / 100;
  }
  const round = (n) => Math.round(n * 100) / 100;
  subtotal = round(subtotal); vatTotal = round(vatTotal);
  return { subtotal, vatTotal, total: round(subtotal + vatTotal) };
}

function applyBody(doc, b) {
  const fields = ['issuerCompany', 'issuer', 'clientId', 'client', 'date', 'validUntil', 'currency', 'notes', 'terms'];
  for (const f of fields) if (b[f] !== undefined) doc[f] = b[f];
  if (b.lines !== undefined) doc.lines = b.lines;
  const t = computeTotals(doc.lines);
  doc.subtotal = t.subtotal; doc.vatTotal = t.vatTotal; doc.total = t.total;
}

// GET /quotes?status=&issuer=&q=
router.get('/', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { status, issuer, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (issuer) filter.issuerCompany = issuer;
  if (q) filter.$or = [{ number: { $regex: q, $options: 'i' } }, { 'client.name': { $regex: q, $options: 'i' } }];
  try {
    const items = await Quote.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Lecture devis échouée', detail: err.message });
  }
});

router.get('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const q = await Quote.findById(req.params.id);
    if (!q) return res.status(404).json({ error: 'Introuvable' });
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: 'Lecture échouée', detail: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const q = new Quote();
    applyBody(q, req.body || {});
    await q.save();
    res.status(201).json(q);
  } catch (err) {
    res.status(400).json({ error: 'Création échouée', detail: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const q = await Quote.findById(req.params.id);
    if (!q) return res.status(404).json({ error: 'Introuvable' });
    if (q.status !== 'draft') return res.status(409).json({ error: 'Devis déjà émis : modification interdite.' });
    applyBody(q, req.body || {});
    await q.save();
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: 'Mise à jour échouée', detail: err.message });
  }
});

// POST /quotes/:id/issue — numéro {CODE}-DEV-{ANNÉE}-{SEQ}, statut "sent".
router.post('/:id/issue', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const q = await Quote.findById(req.params.id);
    if (!q) return res.status(404).json({ error: 'Introuvable' });
    if (q.status !== 'draft') return res.status(409).json({ error: 'Déjà émis.' });
    if (!q.issuer || !q.issuer.name) return res.status(400).json({ error: 'Société émettrice requise.' });

    const code = (q.issuer.code || q.issuer.name || 'DEV').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const year = (q.date || new Date().toISOString().slice(0, 10)).slice(0, 4);
    const prefix = `${code}-DEV-${year}-`;
    const existing = await Quote.find({ number: { $regex: `^${prefix}` } }).select('number');
    let maxSeq = 0;
    for (const e of existing) {
      const m = (e.number || '').match(/(\d+)$/);
      if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
    }
    q.number = prefix + String(maxSeq + 1).padStart(4, '0');
    q.status = 'sent';
    if (!q.date) q.date = new Date().toISOString().slice(0, 10);
    await q.save();
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: 'Émission échouée', detail: err.message });
  }
});

// POST /quotes/:id/status — { status: 'sent' | 'accepted' | 'rejected' }
router.post('/:id/status', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { status } = req.body || {};
  if (!['sent', 'accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
  try {
    const q = await Quote.findById(req.params.id);
    if (!q) return res.status(404).json({ error: 'Introuvable' });
    if (q.status === 'draft') return res.status(409).json({ error: 'Émettez le devis d’abord.' });
    if (q.status === 'converted') return res.status(409).json({ error: 'Devis déjà converti en facture.' });
    q.status = status;
    await q.save();
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: 'Changement de statut échoué', detail: err.message });
  }
});

// POST /quotes/:id/convert — crée une facture (brouillon) à partir du devis.
router.post('/:id/convert', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const q = await Quote.findById(req.params.id);
    if (!q) return res.status(404).json({ error: 'Introuvable' });
    if (q.status === 'draft') return res.status(409).json({ error: 'Émettez le devis avant de le convertir.' });
    if (q.convertedInvoiceId) {
      const existing = await Invoice.findById(q.convertedInvoiceId);
      if (existing) return res.json({ ok: true, alreadyConverted: true, invoiceId: String(existing._id), number: existing.number });
    }
    const t = computeTotals(q.lines);
    const inv = new Invoice({
      status: 'draft',
      issuerCompany: q.issuerCompany, issuer: q.issuer, clientId: q.clientId, client: q.client,
      date: new Date().toISOString().slice(0, 10), currency: q.currency,
      lines: q.lines, subtotal: t.subtotal, vatTotal: t.vatTotal, total: t.total,
      notes: q.notes, paymentTerms: q.terms,
    });
    await inv.save();
    q.status = 'converted';
    q.convertedInvoiceId = String(inv._id);
    await q.save();
    res.json({ ok: true, invoiceId: String(inv._id), invoiceStatus: inv.status, quote: q });
  } catch (err) {
    res.status(400).json({ error: 'Conversion échouée', detail: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const q = await Quote.findByIdAndDelete(req.params.id);
    if (!q) return res.status(404).json({ error: 'Introuvable' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: 'Suppression échouée', detail: err.message });
  }
});

module.exports = router;
