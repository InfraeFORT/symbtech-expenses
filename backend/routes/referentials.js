// routes/referentials.js — CRUD des référentiels (sociétés, clients, fournisseurs)
// + pièces jointes (contrats, BC) sur clients & fournisseurs (upload S3).
const express = require('express');
const multer = require('multer');
const { connectDB } = require('../lib/db');
const { uploadBuffer, deleteKey, presignGet } = require('../lib/s3');
const Company = require('../models/Company');
const Client = require('../models/Client');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const Contract = require('../models/Contract');
const Avenant = require('../models/Avenant');
const Order = require('../models/Order');
const { extractContract, extractOrder } = require('../lib/dococr');

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

// Fabrique un routeur CRUD standard pour un modèle Mongoose.
// opts.attachments = true → ajoute les routes de pièces jointes.
function crudRouter(Model, label, opts = {}) {
  const r = express.Router();

  // Liste (par défaut : actifs ; ?all=1 pour tout).
  r.get('/', async (req, res) => {
    if (!(await ensureDB(res))) return;
    try {
      const filter = req.query.all ? {} : { active: true };
      if (req.query.contract) filter.contractId = req.query.contract;
      if (req.query.client) filter.clientId = req.query.client;
      const items = await Model.find(filter).sort(opts.sort || 'name');
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: `Lecture ${label} échouée`, detail: err.message });
    }
  });

  // --- Pièces jointes (avant /:id pour la clarté ; pas de conflit de segments) ---
  if (opts.attachments) {
    // Ajout d'une pièce jointe : upload S3 puis push dans attachments[].
    r.post('/:id/attachments', upload.single('file'), async (req, res) => {
      if (!(await ensureDB(res))) return;
      if (!req.file) return res.status(400).json({ error: 'Fichier "file" manquant.' });
      try {
        const item = await Model.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'Introuvable' });
        const s3Key = await uploadBuffer(req.file.buffer, req.file.mimetype);
        item.attachments.push({
          kind: req.body.kind || 'contract',
          label: req.body.label || req.file.originalname || null,
          s3Key,
          date: req.body.date || new Date().toISOString().slice(0, 10),
        });
        await item.save();
        res.status(201).json(item);
      } catch (err) {
        res.status(500).json({ error: 'Upload échoué', detail: err.message });
      }
    });

    // URL signée temporaire pour consulter/télécharger une pièce jointe.
    r.get('/:id/attachments/url', async (req, res) => {
      if (!(await ensureDB(res))) return;
      const key = req.query.key;
      try {
        const item = await Model.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'Introuvable' });
        const exists = (item.attachments || []).some((a) => a.s3Key === key);
        if (!exists) return res.status(404).json({ error: 'Pièce jointe introuvable' });
        const url = await presignGet(key);
        res.json({ url });
      } catch (err) {
        res.status(400).json({ error: 'URL échouée', detail: err.message });
      }
    });

    // Suppression d'une pièce jointe : retire de attachments[] + supprime l'objet S3.
    r.delete('/:id/attachments', async (req, res) => {
      if (!(await ensureDB(res))) return;
      const key = req.query.key || (req.body && req.body.key);
      try {
        const item = await Model.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'Introuvable' });
        item.attachments = (item.attachments || []).filter((a) => a.s3Key !== key);
        await item.save();
        try { await deleteKey(key); } catch (e) { /* objet déjà absent : on ignore */ }
        res.json(item);
      } catch (err) {
        res.status(400).json({ error: 'Suppression échouée', detail: err.message });
      }
    });
  }


  // --- Photo unique (option image) ---
  if (opts.image) {
    r.post('/:id/image', upload.single('file'), async (req, res) => {
      if (!(await ensureDB(res))) return;
      if (!req.file) return res.status(400).json({ error: 'Fichier "file" manquant.' });
      try {
        const item = await Model.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'Introuvable' });
        const old = item.imageKey;
        item.imageKey = await uploadBuffer(req.file.buffer, req.file.mimetype);
        await item.save();
        if (old) { try { await deleteKey(old); } catch (e) { /* ignore */ } }
        res.json(item);
      } catch (err) {
        res.status(500).json({ error: 'Upload échoué', detail: err.message });
      }
    });

    r.get('/:id/image/url', async (req, res) => {
      if (!(await ensureDB(res))) return;
      try {
        const item = await Model.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'Introuvable' });
        if (!item.imageKey) return res.status(404).json({ error: 'Pas de photo' });
        const url = await presignGet(item.imageKey);
        res.json({ url });
      } catch (err) {
        res.status(400).json({ error: 'URL échouée', detail: err.message });
      }
    });

    r.delete('/:id/image', async (req, res) => {
      if (!(await ensureDB(res))) return;
      try {
        const item = await Model.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'Introuvable' });
        const old = item.imageKey;
        item.imageKey = null;
        await item.save();
        if (old) { try { await deleteKey(old); } catch (e) { /* ignore */ } }
        res.json(item);
      } catch (err) {
        res.status(400).json({ error: 'Suppression échouée', detail: err.message });
      }
    });
  }


  // --- OCR (option ocr : extracteur de lib/dococr) ---
  if (opts.ocr) {
    r.post('/ocr', upload.single('file'), async (req, res) => {
      if (!(await ensureDB(res))) return;
      if (!req.file) return res.status(400).json({ error: 'Fichier "file" manquant.' });
      try {
        const out = await opts.ocr([req.file.buffer]);
        res.json(out);
      } catch (err) {
        res.status(500).json({ error: 'OCR échoué', detail: err.message });
      }
    });
  }

  r.get('/:id', async (req, res) => {
    if (!(await ensureDB(res))) return;
    try {
      const item = await Model.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Introuvable' });
      res.json(item);
    } catch (err) {
      res.status(400).json({ error: 'Lecture échouée', detail: err.message });
    }
  });

  r.post('/', async (req, res) => {
    if (!(await ensureDB(res))) return;
    try {
      const item = await Model.create(req.body);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ error: `Création ${label} échouée`, detail: err.message });
    }
  });

  r.patch('/:id', async (req, res) => {
    if (!(await ensureDB(res))) return;
    try {
      const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!item) return res.status(404).json({ error: 'Introuvable' });
      res.json(item);
    } catch (err) {
      res.status(400).json({ error: `Mise à jour ${label} échouée`, detail: err.message });
    }
  });

  r.delete('/:id', async (req, res) => {
    if (!(await ensureDB(res))) return;
    try {
      const item = await Model.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ error: 'Introuvable' });
      res.json({ deleted: true, id: req.params.id });
    } catch (err) {
      res.status(400).json({ error: 'Suppression échouée', detail: err.message });
    }
  });

  return r;
}

const ordersRouter = crudRouter(Order, 'commandes', { attachments: true, ocr: extractOrder, sort: '-date' });

// GET /orders/:id/prefill — agrège les mentions (contrat + avenants + commande) et renvoie les lignes,
// pour pré-remplir une facture rattachée à cette commande.
ordersRouter.get('/:id/prefill', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Introuvable' });
    let contract = null;
    let avenants = [];
    if (order.contractId) {
      contract = await Contract.findById(order.contractId);
      avenants = await Avenant.find({ contractId: order.contractId }).sort('date');
    }
    const parts = [];
    if (contract && contract.mentions) parts.push(contract.mentions);
    for (const a of avenants) if (a.mentions) parts.push(`Avenant ${a.version || ''} : ${a.mentions}`.trim());
    if (order.mentions) parts.push(order.mentions);
    res.json({
      orderId: String(order._id),
      orderNumber: order.number || null,
      contractId: order.contractId || null,
      contractRef: contract ? contract.reference : null,
      clientId: order.clientId || (contract ? contract.clientId : null) || null,
      clientName: order.clientName || (contract ? contract.clientName : null) || null,
      company: order.company || (contract ? contract.company : null) || null,
      currency: order.currency || (contract ? contract.currency : null) || 'EUR',
      lines: order.lines || [],
      mentions: parts.filter(Boolean).join('\n'),
    });
  } catch (err) {
    res.status(400).json({ error: 'Pré-remplissage échoué', detail: err.message });
  }
});

module.exports = {
  companies: crudRouter(Company, 'sociétés', { image: true }),
  clients: crudRouter(Client, 'clients', { attachments: true }),
  suppliers: crudRouter(Supplier, 'fournisseurs', { attachments: true }),
  products: crudRouter(Product, 'produits', { image: true }),
  contracts: crudRouter(Contract, 'contrats', { attachments: true, ocr: extractContract, sort: '-createdAt' }),
  avenants: crudRouter(Avenant, 'avenants', { attachments: true, ocr: extractContract, sort: 'date' }),
  orders: ordersRouter,
};
