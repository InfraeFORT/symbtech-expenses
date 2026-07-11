// lib/auth.js — authentification JWT (token Bearer).
const jwt = require('jsonwebtoken');

const TTL = process.env.JWT_TTL || '30d';

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET absent (.env)');
  return s;
}

function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), name: user.displayName, email: user.email },
    getSecret(),
    { expiresIn: TTL }
  );
}

// Middleware : exige un header "Authorization: Bearer <token>" valide.
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentification requise (Bearer token).' });
  }
  try {
    const payload = jwt.verify(token, getSecret());
    req.user = { id: payload.sub, name: payload.name, email: payload.email };
    next();
  } catch (err) {
    if (err.message.includes('JWT_SECRET')) {
      return res.status(500).json({ error: 'Auth non configurée (JWT_SECRET absent).' });
    }
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

module.exports = { signToken, authRequired };
