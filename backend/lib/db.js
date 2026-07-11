// lib/db.js — connexion Mongoose à la base dédiée symbtech-expenses.
// Connexion paresseuse : le serveur démarre même sans base (la route OCR n'en
// a pas besoin) ; les routes qui touchent la base appellent connectDB() au vol.

const mongoose = require('mongoose');

let connecting = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connecting) return connecting;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI absent (.env)');

  connecting = mongoose
    .connect(uri, { dbName: process.env.MONGODB_DB || undefined })
    .then((m) => {
      console.log('MongoDB connecté :', m.connection.name);
      return m.connection;
    })
    .catch((err) => {
      connecting = null; // autorise une nouvelle tentative au prochain appel
      throw err;
    });

  return connecting;
}

module.exports = { connectDB, mongoose };
