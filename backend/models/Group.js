// models/Group.js — groupes de droits. Un utilisateur appartient à plusieurs groupes ;
// ses droits effectifs sont l'UNION des droits de ses groupes (le plus permissif l'emporte).
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

// Un droit = un élément (ressource) + un niveau : none < read < write.
const PermissionSchema = new Schema(
  {
    resource: { type: String, required: true },
    level: { type: String, enum: ['none', 'read', 'write'], default: 'none' },
  },
  { _id: false }
);

const GroupSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: null },
    isAdmin: { type: Boolean, default: false }, // accès à l'administration (utilisateurs & groupes)
    permissions: { type: [PermissionSchema], default: [] },
    // Périmètre société : tout, ou une liste de sociétés (par nom).
    allCompanies: { type: Boolean, default: false },
    companies: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Group || mongoose.model('Group', GroupSchema);
