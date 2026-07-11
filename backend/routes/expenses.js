// routes/expenses.js
// Route HTTP fine au-dessus du cœur OCR. Volontairement minimale : toute la
// logique d'extraction vit dans lib/ocr.js (testable et réutilisable).

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { extractExpenseFromFiles } = require('../lib/ocr');
const { extractSupplierInvoice } = require('../lib/dococr');
const { connectDB } = require('../lib/db');
const { uploadBuffer, deleteKey, presignGet } = require('../lib/s3');
const Expense = require('../models/Expense');

const router = express.Router();

// Garantit la connexion Mongo avant toute opération base ; sinon 503 propre.
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

// Upload en mémoire, jusqu'à 10 pages, 20 Mo chacune. Images (image/*) ET PDF.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Une image ou un PDF est attendu (champ "file").'));
  },
});

// POST /expenses/ocr  —  multipart/form-data, champ "file" répété pour le multi-pages :
//   curl -F "file=@page1.jpg" -F "file=@page2.jpg" ...
// Toutes les pages constituent UNE seule dépense. Réponse : { data, model, usage, raw }
router.post('/ocr', upload.array('file', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Champ "file" manquant (multipart/form-data).' });
  }
  try {
    const buffers = req.files.map((f) => f.buffer);
    const result = await extractExpenseFromFiles(buffers);
    res.json(result);
  } catch (err) {
    console.error('[ocr] échec extraction :', err);
    res.status(502).json({ error: 'Extraction OCR échouée', detail: err.message });
  }
});

// Helpers de parsing des champs multipart (toujours reçus en string)
const toNum = (v) => (v === undefined || v === '' || v === null ? null : Number(v));
const toBool = (v) => v === true || v === 'true' || v === '1' || v === 'on';

// POST /expenses  —  multipart/form-data : champ "file" (1..n pages) + champs métier.
// Upload des justificatifs sur S3 puis création de la dépense en base.
router.post('/', upload.array('file', 10), async (req, res) => {
  if (!(await ensureDB(res))) return;
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Champ "title" requis.' });

  try {
    // Upload des pages (s'il y en a) en parallèle.
    const s3Keys = await Promise.all(
      (req.files || []).map((f) => uploadBuffer(f.buffer, f.mimetype))
    );

    const expense = await Expense.create({
      createdBy: (req.user && req.user.name) || b.createdBy || null,
      expenseFor: b.expenseFor || (req.user && req.user.name) || null,
      title: b.title,
      merchant: b.merchant || null,
      date: b.date || null,
      type: b.type || null,
      amount: toNum(b.amount),
      vat: toNum(b.vat),
      currency: b.currency || null,
      company: b.company || null,
      paymentMethod: b.paymentMethod || null,
      proOrPerso: b.proOrPerso === 'perso' ? 'perso' : 'pro',
      taxImpact: toBool(b.taxImpact),
      refactTo: b.refactTo || null,
      isExpenseReport: toBool(b.isExpenseReport),
      person: b.person || null,
      s3Keys,
      ocrRaw: b.ocrRaw ? JSON.parse(b.ocrRaw) : null,
      ocrConfidence: toNum(b.ocrConfidence),
      validatedByHuman: toBool(b.validatedByHuman),
    });

    res.status(201).json(expense);
  } catch (err) {
    console.error('[expenses] création échouée :', err);
    res.status(500).json({ error: 'Création de la dépense échouée', detail: err.message });
  }
});

// GET /expenses  —  liste/recherche. Filtres : company, type, currency, from, to,
// validated (bool), q (texte sur title/merchant). Pagination : limit, skip.
router.get('/', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { company, type, currency, from, to, validated, q } = req.query;

  const filter = {};
  if (company) filter.company = company;
  if (type) filter.type = type;
  if (currency) filter.currency = currency;
  if (validated !== undefined) filter.validatedByHuman = toBool(validated);
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { merchant: { $regex: q, $options: 'i' } },
    ];
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const skip = Number(req.query.skip) || 0;

  try {
    const [items, total] = await Promise.all([
      Expense.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
      Expense.countDocuments(filter),
    ]);
    res.json({ total, count: items.length, items });
  } catch (err) {
    console.error('[expenses] recherche échouée :', err);
    res.status(500).json({ error: 'Recherche échouée', detail: err.message });
  }
});

// GET /expenses/:id/files  —  URL signées temporaires des justificatifs.
router.get('/:id/files', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Dépense introuvable' });
    const files = await Promise.all(
      (expense.s3Keys || []).map(async (key) => ({ key, url: await presignGet(key) }))
    );
    res.json({ files });
  } catch (err) {
    res.status(400).json({ error: 'Récupération des justificatifs échouée', detail: err.message });
  }
});

// GET /expenses/:id
router.get('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Dépense introuvable' });
    res.json(expense);
  } catch (err) {
    res.status(400).json({ error: 'Identifiant invalide', detail: err.message });
  }
});

// PATCH /expenses/:id  —  met à jour les champs métier fournis.
router.patch('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const b = req.body || {};
  const updatable = [
    'title', 'merchant', 'date', 'type', 'currency', 'company',
    'paymentMethod', 'refactTo', 'expenseFor', 'person',
  ];
  const update = {};
  for (const k of updatable) if (b[k] !== undefined) update[k] = b[k];
  if (b.amount !== undefined) update.amount = toNum(b.amount);
  if (b.vat !== undefined) update.vat = toNum(b.vat);
  if (b.proOrPerso !== undefined) update.proOrPerso = b.proOrPerso === 'perso' ? 'perso' : 'pro';
  if (b.taxImpact !== undefined) update.taxImpact = toBool(b.taxImpact);
  if (b.isExpenseReport !== undefined) update.isExpenseReport = toBool(b.isExpenseReport);
  if (b.validatedByHuman !== undefined) update.validatedByHuman = toBool(b.validatedByHuman);

  try {
    const expense = await Expense.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!expense) return res.status(404).json({ error: 'Dépense introuvable' });
    res.json(expense);
  } catch (err) {
    res.status(400).json({ error: 'Mise à jour échouée', detail: err.message });
  }
});

// DELETE /expenses/:id  —  supprime la dépense ET ses justificatifs sur S3.
router.delete('/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Dépense introuvable' });

    // Purge S3 (best-effort : une clé déjà absente ne bloque pas la suppression).
    await Promise.all(
      (expense.s3Keys || []).map((k) =>
        deleteKey(k).catch((e) => console.warn('[s3] purge échouée', k, e.message))
      )
    );
    await expense.deleteOne();
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: 'Suppression échouée', detail: err.message });
  }
});


// POST /expenses/bulk — import en masse de charges (depuis Excel/CSV mappé côté admin).
const sha1 = (str) => crypto.createHash('sha1').update(str).digest('hex');
router.post('/bulk', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { items, company } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Aucune ligne à importer.' });
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const batch = 'imp_' + Date.now();
  const docs = [];
  for (const it of items) {
    const comp = it.company || company || null;
    const amount = num(it.amount);
    const date = it.date || null;
    const merchant = it.merchant || it.title || null;
    if (amount === null && !merchant) continue;
    const dedupKey = sha1([comp, date, merchant, amount, it.type || ''].join('|'));
    docs.push({
      title: it.title || merchant || 'Charge importée',
      merchant, date, type: it.type || null, amount, vat: num(it.vat),
      currency: it.currency || null, company: comp, paymentMethod: it.paymentMethod || null,
      proOrPerso: it.proOrPerso || 'pro', isExpenseReport: !!it.isExpenseReport, person: it.person || null,
      source: 'import', importBatch: batch, dedupKey, validatedByHuman: false,
    });
  }
  if (docs.length === 0) return res.status(400).json({ error: 'Lignes invalides (montant et libellé vides).' });
  try {
    const keys = docs.map((d) => d.dedupKey);
    const existing = await Expense.find({ dedupKey: { $in: keys } }).select('dedupKey');
    const seen = new Set(existing.map((e) => e.dedupKey));
    const toInsert = [];
    for (const d of docs) { if (seen.has(d.dedupKey)) continue; seen.add(d.dedupKey); toInsert.push(d); }
    if (toInsert.length) await Expense.insertMany(toInsert);
    res.json({ inserted: toInsert.length, skipped: docs.length - toInsert.length, batch });
  } catch (err) {
    res.status(500).json({ error: 'Import échoué', detail: err.message });
  }
});

// POST /expenses/supplier-ocr — analyse une facture fournisseur (PDF/image) → { data, raw, usage }
router.post('/supplier-ocr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'Aucun fichier fourni.' });
    const out = await extractSupplierInvoice([req.file.buffer]);
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'Analyse de la facture fournisseur échouée', detail: err.message });
  }
});

// POST /expenses/import-supplier-invoices — import en lot de factures FOURNISSEURS (achats → charges).
// body : { company, supplierId?, items: [{ invoiceNumber, date, dueDate, supplierName, currency,
//          subtotal, vat, total, category }] }
router.post('/import-supplier-invoices', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { company, supplierId, items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Aucune facture à importer.' });
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  try {
    const Supplier = require('../models/Supplier');
    const suppliers = await Supplier.find().select('name');
    const smap = {};
    for (const s of suppliers) if (s.name) smap[s.name.toLowerCase()] = String(s._id);

    const batch = 'imp_' + Date.now();
    let inserted = 0, skipped = 0;
    const errors = [];
    for (const it of items) {
      try {
        const invoiceNumber = (it.invoiceNumber == null ? '' : String(it.invoiceNumber)).trim();
        if (!invoiceNumber) { errors.push('Ligne sans numéro de facture ignorée.'); continue; }
        const supplierName = it.supplierName || null;
        const sid = supplierId || (supplierName ? (smap[supplierName.toLowerCase()] || null) : null);
        const supplierKey = sid || (supplierName || '').toLowerCase();
        const dedupKey = sha1([company || '', supplierKey, invoiceNumber].join('|'));
        if (await Expense.findOne({ dedupKey })) { skipped++; continue; }

        const total = num(it.total);
        const subtotal = num(it.subtotal);
        const vat = num(it.vat);
        const doc = new Expense({
          title: supplierName ? `Facture ${invoiceNumber} — ${supplierName}` : `Facture ${invoiceNumber}`,
          merchant: supplierName, date: it.date || null, dueDate: it.dueDate || null,
          type: it.category || 'Facture fournisseur',
          amount: total != null ? total : (subtotal != null ? subtotal : null),
          vat, subtotal, currency: it.currency || null,
          company: company || null, proOrPerso: 'pro',
          supplierId: sid, invoiceNumber,
          source: 'import', importBatch: batch, dedupKey, validatedByHuman: false,
        });
        await doc.save();
        inserted++;
      } catch (e) { errors.push(e.message); }
    }
    res.json({ inserted, skipped, batch, errors });
  } catch (err) {
    res.status(500).json({ error: 'Import échoué', detail: err.message });
  }
});

module.exports = router;
