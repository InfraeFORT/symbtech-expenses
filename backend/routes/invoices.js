// routes/invoices.js — factures : CRUD, calcul des totaux, numérotation à l'émission, import d'historique.
const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { connectDB } = require('../lib/db');
const Invoice = require('../models/Invoice');
const Company = require('../models/Company');
const Client = require('../models/Client');
const { extractInvoice } = require('../lib/dococr');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 5 } });

const sha1 = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

function companySnapshot(c) {
  if (!c) return {};
  return {
    name: c.name || null, code: c.code || null,
    address1: c.address1 || null, address2: c.address2 || null,
    postalCode: c.postalCode || null, city: c.city || null, country: c.country || null,
    regNumber: c.regNumber || null, vatNumber: c.vatNumber || null,
    bankAccounts: (c.bankAccounts || []).map((b) => ({
      bankName: b.bankName || null, swift: b.swift || null, iban: b.iban || null,
      accountNumber: b.accountNumber || null, currency: b.currency || null,
    })),
  };
}

async function ensureDB(res) {
  try {
    await connectDB();
    return true;
  } catch (err) {
    console.error('[db] connexion impossible :', err.message);
    res.status(503).json({ error: 'Base de données indisponible', detail: err.message });
    return false;
  }
}

// Recalcule subtotal / TVA / total à partir des lignes.
function computeTotals(lines) {
  let subtotal = 0;
  let vatTotal = 0;
  for (const l of lines || []) {
    const qty = Number(l.quantity) || 0;
    const pu = Number(l.unitPrice) || 0;
    const rate = Number(l.vatRate) || 0;
    const lineHT = qty * pu;
    subtotal += lineHT;
    vatTotal += (lineHT * rate) / 100;
  }
  const round = (n) => Math.round(n * 100) / 100;
  subtotal = round(subtotal);
  vatTotal = round(vatTotal);
  return { subtotal, vatTotal, total: round(subtotal + vatTotal) };
}

function applyBody(doc, b) {
  const fields = ['number', 'issuerCompany', 'issuer', 'clientId', 'client', 'date', 'dueDate', 'currency', 'notes', 'paymentTerms', 'orderId', 'orderNumber', 'contractId', 'mentions',
    'craId', 'craLabel', 'quoteId', 'quoteNumber', 'prestationDays', 'expenseReimbursement', 'performedById', 'performedBy', 'taxImpact', 'interco', 'intercoCompany', 'noCash', 'amountPaid'];
  for (const f of fields) if (b[f] !== undefined) doc[f] = b[f];
  if (b.lines !== undefined) doc.lines = b.lines;
  if (Array.isArray(doc.lines) && doc.lines.length) {
    const t = computeTotals(doc.lines);
    doc.subtotal = t.subtotal;
    doc.vatTotal = t.vatTotal;
    doc.total = t.total;
  } else {
    // Pas de lignes (ex : facture importée en récap) : on conserve / accepte des totaux saisis.
    if (b.subtotal !== undefined) doc.subtotal = Number(b.subtotal) || 0;
    if (b.vatTotal !== undefined) doc.vatTotal = Number(b.vatTotal) || 0;
    if (b.total !== undefined) doc.total = Number(b.total) || 0;
  }
}

// Champs de gestion modifiables quel que soit le statut (n'affectent pas le contenu légal).
const META_FIELDS = ['craId', 'craLabel', 'quoteId', 'quoteNumber', 'prestationDays', 'expenseReimbursement',
  'performedById', 'performedBy', 'taxImpact', 'interco', 'intercoCompany', 'noCash', 'amountPaid'];

// GET /invoices?status=&issuer=&q=
router.get('/', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { status, issuer, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (issuer) filter.issuerCompany = issuer;
  if (q) filter.$or = [{ number: { $regex: q, $options: 'i' } }, { 'client.name': { $regex: q, $options: 'i' } }];
  try {
    const items = await Invoice.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Lecture factures échouée', detail: err.message });
  }
});

router.get('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Introuvable' });
    res.json(inv);
  } catch (err) {
    res.status(400).json({ error: 'Lecture échouée', detail: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const inv = new Invoice();
    applyBody(inv, req.body || {});
    await inv.save();
    res.status(201).json(inv);
  } catch (err) {
    res.status(400).json({ error: 'Création échouée', detail: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Introuvable' });
    if (inv.status !== 'draft' && inv.source !== 'import') {
      return res.status(409).json({ error: 'Facture déjà émise : modification interdite (annulez d’abord).' });
    }
    applyBody(inv, req.body || {});
    await inv.save();
    res.json(inv);
  } catch (err) {
    res.status(400).json({ error: 'Mise à jour échouée', detail: err.message });
  }
});

// POST /invoices/:id/issue — assigne un numéro {CODE}-{ANNÉE}-{SEQ} et passe en "issued".
// POST /invoices/ocr — analyse une facture de vente (PDF/image) → { data, raw, usage }
router.post('/ocr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'Aucun fichier fourni.' });
    const out = await extractInvoice([req.file.buffer]);
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'Analyse de la facture échouée', detail: err.message });
  }
});

// POST /invoices/import — import en lot de factures de VENTE déjà émises (archive).
// body : { issuerCompany, status: 'issued'|'paid', items: [{ number, date, dueDate, clientName, currency,
//          lines?, subtotal?, vatTotal?, total?, paymentTerms?, mentions?, orderId?, orderNumber?, contractId? }] }
router.post('/import', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { issuerCompany, status, items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Aucune facture à importer.' });
  const st = ['issued', 'paid'].includes(status) ? status : 'issued';
  try {
    let issuer = {};
    if (issuerCompany) { const co = await Company.findOne({ name: issuerCompany }); issuer = companySnapshot(co); }
    const clients = await Client.find().select('name');
    const cmap = {};
    for (const c of clients) if (c.name) cmap[c.name.toLowerCase()] = c._id;

    const batch = 'imp-' + Date.now();
    let inserted = 0, skipped = 0;
    const errors = [];
    for (const it of items) {
      try {
        const number = (it.number == null ? '' : String(it.number)).trim();
        if (!number) { errors.push('Ligne sans numéro ignorée.'); continue; }
        const dedupKey = sha1((issuerCompany || '') + '|' + number);
        if (await Invoice.findOne({ dedupKey })) { skipped++; continue; }

        const lines = Array.isArray(it.lines) ? it.lines.map((l) => ({
          description: l.description ?? '', quantity: num(l.quantity) ?? 1, unitPrice: num(l.unitPrice) ?? 0, vatRate: num(l.vatRate) ?? 0,
        })) : [];
        let subtotal = num(it.subtotal) || 0, vatTotal = num(it.vatTotal) || 0, total = num(it.total) || 0;
        if (lines.length) { const t = computeTotals(lines); subtotal = t.subtotal; vatTotal = t.vatTotal; total = t.total; }
        else if (total && !subtotal && !vatTotal) { subtotal = total; } // récap TTC seul

        const clientName = it.clientName || null;
        const inv = new Invoice({
          number, status: st,
          issuerCompany: issuerCompany || null, issuer,
          clientId: clientName ? (cmap[clientName.toLowerCase()] || null) : null,
          client: { name: clientName },
          date: it.date || null, dueDate: it.dueDate || null, currency: it.currency || 'EUR',
          lines, subtotal, vatTotal, total,
          notes: it.notes || null, paymentTerms: it.paymentTerms || null, mentions: it.mentions || null,
          orderId: it.orderId || null, orderNumber: it.orderNumber || null, contractId: it.contractId || null,
          source: 'import', importBatch: batch, dedupKey,
        });
        await inv.save();
        inserted++;
      } catch (e) { errors.push(e.message); }
    }
    res.json({ inserted, skipped, batch, errors });
  } catch (err) {
    res.status(400).json({ error: 'Import échoué', detail: err.message });
  }
});

// POST /invoices/bulk-delete — suppression multiple { ids: [] }
// POST /invoices/:id/meta — met à jour les infos de gestion, quel que soit le statut.
// Si craId est fourni, alimente prestationDays depuis le CRA (jours de production) si non précisé.
router.post('/:id/meta', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Introuvable' });
    const b = req.body || {};
    for (const f of META_FIELDS) if (b[f] !== undefined) inv[f] = b[f];
    if (b.craId) {
      try {
        const Cra = require('../models/Cra');
        const cra = await Cra.findById(b.craId);
        if (cra) {
          if (b.prestationDays === undefined || b.prestationDays === null || b.prestationDays === '') inv.prestationDays = cra.productionDays;
          if (!inv.craLabel) inv.craLabel = [cra.reference, cra.title, cra.periodLabel || cra.month].filter(Boolean).join(' · ') || null;
        }
      } catch (e) { /* CRA optionnel */ }
    }
    if (b.interco === false) inv.intercoCompany = null;
    await inv.save();
    res.json(inv);
  } catch (err) {
    res.status(400).json({ error: 'Mise à jour des infos échouée', detail: err.message });
  }
});

router.post('/bulk-delete', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Aucune facture sélectionnée.' });
  try {
    const r = await Invoice.deleteMany({ _id: { $in: ids } });
    res.json({ deleted: r.deletedCount || 0 });
  } catch (err) {
    res.status(400).json({ error: 'Suppression multiple échouée', detail: err.message });
  }
});

router.post('/:id/issue', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Introuvable' });
    if (inv.status !== 'draft') return res.status(409).json({ error: 'Déjà émise.' });
    if (!inv.issuer || !inv.issuer.name) return res.status(400).json({ error: 'Société émettrice requise.' });

    const code = (inv.issuer.code || inv.issuer.name || 'INV').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const year = (inv.date || new Date().toISOString().slice(0, 10)).slice(0, 4);
    const prefix = `${code}-${year}-`;

    const existing = await Invoice.find({ number: { $regex: `^${prefix}` } }).select('number');
    let maxSeq = 0;
    for (const e of existing) {
      const m = (e.number || '').match(/(\d+)$/);
      if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
    }
    inv.number = prefix + String(maxSeq + 1).padStart(4, '0');
    inv.status = 'issued';
    if (!inv.date) inv.date = new Date().toISOString().slice(0, 10);
    await inv.save();
    res.json(inv);
  } catch (err) {
    res.status(400).json({ error: 'Émission échouée', detail: err.message });
  }
});

// POST /invoices/:id/status — { status: 'paid' | 'cancelled' | 'issued' }
router.post('/:id/status', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { status } = req.body || {};
  if (!['issued', 'paid', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Introuvable' });
    if (inv.status === 'draft') return res.status(409).json({ error: 'Émettez la facture d’abord.' });
    inv.status = status;
    await inv.save();
    res.json(inv);
  } catch (err) {
    res.status(400).json({ error: 'Changement de statut échoué', detail: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const inv = await Invoice.findByIdAndDelete(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Introuvable' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: 'Suppression échouée', detail: err.message });
  }
});

module.exports = router;
