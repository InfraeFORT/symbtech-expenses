// scripts/createUser.js — crée (ou met à jour le mot de passe d') un utilisateur.
// Usage : node scripts/createUser.js <email> <password> "<Nom affiché>" [role]
require('dotenv').config();
const { connectDB, mongoose } = require('../lib/db');
const User = require('../models/User');

async function main() {
  const [email, password, displayName, role] = process.argv.slice(2);
  if (!email || !password || !displayName) {
    console.error('Usage : node scripts/createUser.js <email> <password> "<Nom affiché>" [role]');
    process.exit(1);
  }

  await connectDB();

  let user = await User.findOne({ email: email.toLowerCase().trim() });
  const action = user ? 'mis à jour' : 'créé';
  if (!user) user = new User({ email, displayName, role: role || 'user' });
  else {
    user.displayName = displayName;
    if (role) user.role = role;
  }
  user.setPassword(password);
  await user.save();

  console.log(`Utilisateur ${action} : ${user.email} (${user.displayName}, ${user.role})`);
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Échec :', err.message);
  process.exit(1);
});
