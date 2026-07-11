// routes/auth.js — connexion et profil courant.
const express = require('express');
const { connectDB } = require('../lib/db');
const { signToken, authRequired } = require('../lib/auth');
const User = require('../models/User');

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

// GET /auth/me  (protégé)  ->  identité du porteur du token
router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
