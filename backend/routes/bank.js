// routes/bank.js — relevés bancaires : import en lot (JSON normalisé côté admin),
// liste filtrable, suppression d'une ligne ou d'un import complet.
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { connectDB } = require('../lib/db');
const { extractBankTransactionsFromFiles } = require('../lib/bankocr');
const BankTransaction = require('../models/BankTransaction');
const Expense = require('../models/Expense');

const router = express.Router();

// Catégories d'écritures internes (lignes sans facture : virements, salaires…).
const INTERNAL_CATEGORIES = [
  'Virement interne', 'Salaire / honoraires', 'Frais bancaires',
  'Taxes / TVA', 'Remboursement', 'Autre',
];

function dayDiff(a, b) {
  const da = new Date(a + 'T00:00:00Z');
  const db = new Date(b + 'T00:00:00Z');
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 9999;
  return Math.abs(Math.round((da - db) / 86400000));
}

// Upload mémoire pour l'analyse PDF/image (jusqu'à 5 pages, 25 Mo chacune).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 5 },
});

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

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
function dedupKey(company, account, t) {
  return crypto
    .createHash('sha1')
    .update([company || '', account || '', t.date || '', t.label || '', t.amount].join('|'))
    .digest('hex');
}

// POST /bank/parse — analyse un relevé PDF/image (Claude vision) → transactions normalisées.
// Ne touche pas la base : renvoie les lignes pour aperçu, l'import se fait via /transactions/bulk.
router.post('/parse', upload.array('file', 5), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Fichier "file" manquant (PDF ou image).' });
  }
  try {
    const buffers = req.files.map((f) => f.buffer);
    const result = await extractBankTransactionsFromFiles(buffers);
    res.json(result);
  } catch (err) {
    console.error('[bank] extraction échouée :', err);
    res.status(502).json({ error: 'Extraction du relevé échouée', detail: err.message });
  }
});

// POST /bank/transactions/bulk
// body : { company, account, source, allowDuplicates, transactions: [{date,label,amount,currency,balance,externalRef}] }
router.post('/transactions/bulk', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { company, account, source, allowDuplicates } = req.body || {};
  const rows = Array.isArray(req.body && req.body.transactions) ? req.body.transactions : [];
  if (rows.length === 0) return res.status(400).json({ error: 'Aucune transaction fournie.' });

  const batch = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');

  try {
    // Normalisation + clés de dédup
    const prepared = rows.map((t) => {
      const amount = num(t.amount);
      const base = {
        company: company || null,
        account: account || null,
        date: t.date || null,
        label: t.label || null,
        amount,
        currency: t.currency || null,
        balance: num(t.balance),
        externalRef: t.externalRef || null,
        source: source || null,
        importBatch: batch,
      };
      base.dedupKey = dedupKey(company, account, { date: base.date, label: base.label, amount });
      return base;
    });

    let toInsert = prepared;
    let skipped = 0;
    if (!allowDuplicates) {
      const keys = prepared.map((p) => p.dedupKey);
      const existing = await BankTransaction.find({ dedupKey: { $in: keys } }).select('dedupKey');
      const seen = new Set(existing.map((e) => e.dedupKey));
      // dédup aussi à l'intérieur du même lot
      const within = new Set();
      toInsert = prepared.filter((p) => {
        if (seen.has(p.dedupKey) || within.has(p.dedupKey)) {
          skipped += 1;
          return false;
        }
        within.add(p.dedupKey);
        return true;
      });
    }

    const inserted = toInsert.length ? await BankTransaction.insertMany(toInsert) : [];
    res.status(201).json({ imported: inserted.length, skipped, batch });
  } catch (err) {
    console.error('[bank] import échoué :', err);
    res.status(500).json({ error: 'Import échoué', detail: err.message });
  }
});

// GET /bank/transactions?company=&account=&reconciled=&from=&to=&q=&limit=&skip=
router.get('/transactions', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { company, account, reconciled, from, to, q } = req.query;
  const filter = {};
  if (company) filter.company = company;
  if (account) filter.account = account;
  if (reconciled === 'true') filter.reconciled = true;
  if (reconciled === 'false') filter.reconciled = false;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  if (q) filter.label = { $regex: q, $options: 'i' };

  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const skip = Number(req.query.skip) || 0;
  try {
    const [items, total] = await Promise.all([
      BankTransaction.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
      BankTransaction.countDocuments(filter),
    ]);
    res.json({ total, count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: 'Lecture échouée', detail: err.message });
  }
});

// Liste des imports (pour pouvoir en supprimer un)
router.get('/imports', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const rows = await BankTransaction.aggregate([
      {
        $group: {
          _id: '$importBatch',
          company: { $first: '$company' },
          account: { $first: '$account' },
          source: { $first: '$source' },
          count: { $sum: 1 },
          importedAt: { $first: '$createdAt' },
        },
      },
      { $sort: { importedAt: -1 } },
    ]);
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: 'Lecture imports échouée', detail: err.message });
  }
});

router.delete('/transactions/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const t = await BankTransaction.findByIdAndDelete(req.params.id);
    if (!t) return res.status(404).json({ error: 'Introuvable' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: 'Suppression échouée', detail: err.message });
  }
});

router.delete('/imports/:batch', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const r = await BankTransaction.deleteMany({ importBatch: req.params.batch });
    res.json({ deleted: r.deletedCount });
  } catch (err) {
    res.status(400).json({ error: 'Suppression échouée', detail: err.message });
  }
});

// GET /bank/internal-categories — catégories d'écritures internes
router.get('/internal-categories', (req, res) => {
  res.json({ items: INTERNAL_CATEGORIES });
});

// GET /bank/transactions/:id/matches — dépenses candidates classées par score.
// Priorité : montant exact + date proche ; les montants proches (change/arrondis)
// sont proposés avec un score moindre.
router.get('/transactions/:id/matches', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const tx = await BankTransaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Introuvable' });
    const target = Math.abs(tx.amount || 0);
    if (!target) return res.json({ items: [], target: 0, currency: tx.currency });

    // Dépenses déjà rapprochées à une autre ligne → exclues.
    const used = await BankTransaction.find({
      matchedExpenseId: { $ne: null }, _id: { $ne: tx._id },
    }).select('matchedExpenseId');
    const usedSet = new Set(used.map((u) => String(u.matchedExpenseId)));

    const q = {};
    if (tx.company) q.company = tx.company;
    const expenses = await Expense.find(q).sort({ date: -1 }).limit(3000);

    const EPS = 0.01;
    const items = [];
    for (const e of expenses) {
      if (usedSet.has(String(e._id))) continue;
      if (e.amount == null) continue;
      const amountDiff = Math.abs(e.amount - target);
      const exact = amountDiff <= EPS;
      const near = amountDiff <= Math.max(target * 0.02, 1); // 2 % ou 1 unité
      if (!exact && !near) continue;

      const dd = tx.date && e.date ? dayDiff(tx.date, e.date) : 9999;
      const curMatch = tx.currency && e.currency ? tx.currency === e.currency : true;

      const amountScore = exact ? 60 : 30;
      const dateScore = dd <= 5 ? 30 - dd * 2 : dd <= 30 ? 12 : dd <= 60 ? 4 : 0;
      const curScore = curMatch ? 10 : -25;
      const score = amountScore + Math.max(0, dateScore) + curScore;

      items.push({
        expenseId: String(e._id),
        title: e.title, merchant: e.merchant || null,
        date: e.date, amount: e.amount, currency: e.currency, company: e.company,
        exact, amountDiff: Number(amountDiff.toFixed(2)),
        dateDiff: dd === 9999 ? null : dd, currencyMatch: curMatch, score,
      });
    }
    items.sort((a, b) => b.score - a.score);
    res.json({ items: items.slice(0, 10), target, currency: tx.currency });
  } catch (err) {
    res.status(500).json({ error: 'Recherche de correspondances échouée', detail: err.message });
  }
});

// POST /bank/transactions/:id/reconcile  — body { expenseId } OU { category }
router.post('/transactions/:id/reconcile', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { expenseId, category } = req.body || {};
  if (!expenseId && !category) {
    return res.status(400).json({ error: 'expenseId ou category requis.' });
  }
  try {
    const update = { reconciled: true, reconciledAt: new Date() };
    if (expenseId) {
      const exp = await Expense.findById(expenseId).select('title');
      if (!exp) return res.status(404).json({ error: 'Dépense introuvable' });
      update.reconcileType = 'expense';
      update.matchedExpenseId = expenseId;
      update.reconcileCategory = null;
      update.matchedLabel = exp.title || 'Dépense';
    } else {
      update.reconcileType = 'internal';
      update.matchedExpenseId = null;
      update.reconcileCategory = category;
      update.matchedLabel = category;
    }
    const tx = await BankTransaction.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!tx) return res.status(404).json({ error: 'Introuvable' });
    res.json(tx);
  } catch (err) {
    res.status(400).json({ error: 'Rapprochement échoué', detail: err.message });
  }
});

// POST /bank/transactions/:id/unreconcile
router.post('/transactions/:id/unreconcile', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const tx = await BankTransaction.findByIdAndUpdate(
      req.params.id,
      { reconciled: false, reconcileType: null, matchedExpenseId: null, reconcileCategory: null, matchedLabel: null, reconciledAt: null },
      { new: true }
    );
    if (!tx) return res.status(404).json({ error: 'Introuvable' });
    res.json(tx);
  } catch (err) {
    res.status(400).json({ error: 'Annulation échouée', detail: err.message });
  }
});

module.exports = router;
