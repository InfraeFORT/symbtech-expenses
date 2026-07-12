// routes/admin.js — administration : utilisateurs et groupes de droits.
// Toutes les routes sont réservées aux administrateurs (requireAdmin en amont).
const express = require('express');
const { connectDB } = require('../lib/db');
const User = require('../models/User');
const Group = require('../models/Group');
const { RESOURCES, RESOURCE_KEYS } = require('../lib/permissions');

const router = express.Router();

async function ensureDB(res) {
  try { await connectDB(); return true; }
  catch (err) { res.status(503).json({ error: 'Base de données indisponible', detail: err.message }); return false; }
}

const publicUser = (u) => ({
  _id: String(u._id), email: u.email, displayName: u.displayName,
  groups: (u.groups || []).map(String), active: u.active !== false,
  createdAt: u.createdAt, updatedAt: u.updatedAt,
});

// Liste des éléments protégeables (pour l'écran des groupes).
router.get('/resources', (req, res) => res.json({ resources: RESOURCES }));

// ---------- Groupes ----------
router.get('/groups', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const items = await Group.find().sort({ name: 1 });
    res.json({ items });
  } catch (err) { res.status(500).json({ error: 'Lecture des groupes échouée', detail: err.message }); }
});

function applyGroup(doc, b) {
  for (const f of ['name', 'description', 'isAdmin', 'allCompanies', 'active']) {
    if (b[f] !== undefined) doc[f] = b[f];
  }
  if (b.companies !== undefined) doc.companies = b.companies;
  if (b.permissions !== undefined) {
    doc.permissions = (b.permissions || []).filter((p) => RESOURCE_KEYS.includes(p.resource));
  }
}

router.post('/groups', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const g = new Group();
    applyGroup(g, req.body || {});
    if (!g.name) return res.status(400).json({ error: 'Nom du groupe requis.' });
    await g.save();
    res.status(201).json(g);
  } catch (err) { res.status(400).json({ error: 'Création du groupe échouée', detail: err.message }); }
});

router.patch('/groups/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const g = await Group.findById(req.params.id);
    if (!g) return res.status(404).json({ error: 'Groupe introuvable' });
    applyGroup(g, req.body || {});
    await g.save();
    res.json(g);
  } catch (err) { res.status(400).json({ error: 'Mise à jour du groupe échouée', detail: err.message }); }
});

router.delete('/groups/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const g = await Group.findById(req.params.id);
    if (!g) return res.status(404).json({ error: 'Groupe introuvable' });
    // Garde-fou : ne pas supprimer le dernier groupe d'administration.
    if (g.isAdmin) {
      const admins = await Group.countDocuments({ isAdmin: true, active: true });
      if (admins <= 1) return res.status(400).json({ error: "Impossible de supprimer le dernier groupe d'administration." });
    }
    await Group.findByIdAndDelete(req.params.id);
    await User.updateMany({ groups: g._id }, { $pull: { groups: g._id } });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) { res.status(400).json({ error: 'Suppression échouée', detail: err.message }); }
});

// ---------- Utilisateurs ----------
router.get('/users', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const users = await User.find().sort({ displayName: 1 });
    res.json({ items: users.map(publicUser) });
  } catch (err) { res.status(500).json({ error: 'Lecture des utilisateurs échouée', detail: err.message }); }
});

router.post('/users', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { email, displayName, password, groups, active } = req.body || {};
  if (!email || !displayName || !password) {
    return res.status(400).json({ error: 'Email, nom et mot de passe initial requis.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum.' });
  }
  try {
    const exists = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (exists) return res.status(400).json({ error: 'Un compte existe déjà avec cet email.' });
    const u = new User({
      email: String(email).toLowerCase().trim(),
      displayName,
      groups: groups || [],
      active: active !== false,
    });
    u.setPassword(String(password));
    await u.save();
    res.status(201).json(publicUser(u));
  } catch (err) { res.status(400).json({ error: 'Création échouée', detail: err.message }); }
});

router.patch('/users/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const b = req.body || {};
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (b.email !== undefined) u.email = String(b.email).toLowerCase().trim();
    if (b.displayName !== undefined) u.displayName = b.displayName;
    if (b.groups !== undefined) u.groups = b.groups;
    if (b.active !== undefined) {
      // Garde-fou : ne pas se désactiver soi-même.
      if (b.active === false && String(u._id) === String(req.user.id)) {
        return res.status(400).json({ error: 'Impossible de désactiver votre propre compte.' });
      }
      u.active = b.active;
    }
    await u.save();
    res.json(publicUser(u));
  } catch (err) { res.status(400).json({ error: 'Mise à jour échouée', detail: err.message }); }
});

// Réinitialisation du mot de passe par un administrateur.
router.post('/users/:id/password', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { password } = req.body || {};
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum.' });
  }
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    u.setPassword(String(password));
    await u.save();
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: 'Réinitialisation échouée', detail: err.message }); }
});

router.delete('/users/:id', async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'Impossible de supprimer votre propre compte.' });
    }
    const u = await User.findByIdAndDelete(req.params.id);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) { res.status(400).json({ error: 'Suppression échouée', detail: err.message }); }
});

module.exports = router;
