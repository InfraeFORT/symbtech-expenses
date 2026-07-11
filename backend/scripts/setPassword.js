// scripts/setPassword.js — change le mot de passe d'un utilisateur existant.
// Le mot de passe est lu sur STDIN (jamais en argument : absent de l'historique et de `ps`).
// Usage : printf '%s' 'monMotDePasse' | node scripts/setPassword.js <email>
require('dotenv').config();
const { connectDB, mongoose } = require('../lib/db');
const User = require('../models/User');

(async () => {
  const email = (process.argv[2] || '').toLowerCase().trim();
  if (!email) {
    console.error('Usage : printf %s "<motdepasse>" | node scripts/setPassword.js <email>');
    process.exit(1);
  }

  let pwd = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) pwd += chunk;
  pwd = pwd.replace(/[\r\n]+$/, '');

  if (pwd.length < 8) {
    console.error('Mot de passe trop court (8 caractères minimum).');
    process.exit(1);
  }

  await connectDB();
  const user = await User.findOne({ email });
  if (!user) {
    console.error('Utilisateur introuvable :', email);
    await mongoose.connection.close();
    process.exit(1);
  }
  user.setPassword(pwd);
  await user.save();
  console.log('Mot de passe mis à jour pour', user.email);
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
