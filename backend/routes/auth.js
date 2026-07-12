// routes/auth.js — connexion et profil courant.
const express = require('express');
const { connectDB } = require('../lib/db');
const { signToken, authRequired } = require('../lib/auth');
const User = require('../models/User');
const { effectivePermissions } = require('../lib/permissions');

const router = express.Router();

async function ensureDB(res) {
  try {
    await connectDB();
    return true;
  } catch (err) {
    res.status(503).json({ error: 'Base de données indisponible', detail: err.message });
    return false;
  }
}

// POST /auth/login  { email, password }  ->  { token, user }
router.post('/login', async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email et password requis.' });
  }
  try {
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    // Message générique : ne révèle pas si c'est l'email ou le mot de passe.
    if (!user || !user.verifyPassword(password)) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }
    if (user.active === false) {
      return res.status(403).json({ error: 'Compte désactivé.' });
    }
    const token = signToken(user);
    res.json({
      token,
      user: { id: String(user._id), email: user.email, displayName: user.displayName, role: user.role },
    });
  } catch (err) {
    console.error('[auth] login échoué :', err);
    res.status(500).json({ error: 'Connexion échouée', detail: err.message });
  }
});

// GET /auth/me  (protégé)  ->  identité + droits effectifs (union des groupes)
router.get('/me', authRequired, async (req, res) => {
  if (!(await ensureDB(res))) return;
  try {
    const perms = await effectivePermissions(req.user.id);
    if (!perms) return res.status(403).json({ error: 'Compte désactivé ou introuvable.' });
    res.json({ user: req.user, perms });
  } catch (err) {
    res.status(500).json({ error: 'Lecture des droits échouée', detail: err.message });
  }
});

// POST /auth/password  { currentPassword, newPassword }  — l'utilisateur change son mot de passe.
router.post('/password', authRequired, async (req, res) => {
  if (!(await ensureDB(res))) return;
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe requis.' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Nouveau mot de passe : 8 caractères minimum.' });
  }
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.verifyPassword(String(currentPassword))) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
    }
    user.setPassword(String(newPassword));
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Changement de mot de passe échoué', detail: err.message });
  }
});

module.exports = router;
