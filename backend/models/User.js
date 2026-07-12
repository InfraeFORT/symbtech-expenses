// models/User.js — comptes utilisateurs (auth interne).
const { mongoose } = require('../lib/db');
const bcrypt = require('bcryptjs');
const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' }, // hérité (les droits passent par les groupes)
    groups: [{ type: Schema.Types.ObjectId, ref: 'Group' }], // appartenance aux groupes de droits
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Définit le mot de passe (haché). Coût 10 = bon compromis.
UserSchema.methods.setPassword = function (plain) {
  this.passwordHash = bcrypt.hashSync(plain, 10);
};

UserSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compareSync(plain, this.passwordHash);
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
