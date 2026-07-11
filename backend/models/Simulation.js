// models/Simulation.js — simulations d'impôt (salarié & société), sauvegardables.
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const LineSchema = new Schema({
  label: { type: String, default: '' },
  type: { type: String, enum: ['income', 'charge', 'relief'], default: 'income' }, // produit / charge / abattement
  nature: { type: String, enum: ['real', 'forecast', 'adjust'], default: 'real' }, // réel / prévision / ajustement
  amount: { type: Number, default: 0 },
  note: { type: String, default: null },
}, { _id: false });

const BracketSchema = new Schema({
  upTo: { type: Number, default: null }, // plafond de tranche (null = au-delà)
  rate: { type: Number, default: 0 }, // %
}, { _id: false });

const SimulationSchema = new Schema({
  kind: { type: String, enum: ['employee', 'company'], required: true },
  title: { type: String, default: null },
  country: { type: String, enum: ['FR', 'MU'], default: 'MU' },
  company: { type: String, default: null }, // société concernée / employeur
  person: { type: String, default: null }, // salarié (kind employee)
  supplierId: { type: String, default: null }, // fiche fournisseur/salarié liée
  currency: { type: String, default: null },

  fiscalYearLabel: { type: String, default: null }, // ex "2026" ou "2025/2026"
  periodFrom: { type: String, default: null },
  periodTo: { type: String, default: null },
  notes: { type: String, default: null }, // champ libre

  lines: { type: [LineSchema], default: [] },
  brackets: { type: [BracketSchema], default: [] },
  parts: { type: Number, default: 1 }, // quotient familial (France, salarié)
  withheld: { type: Number, default: 0 }, // impôt déjà retenu (PAYE/PAS)
  fairShareEnabled: { type: Boolean, default: false },
  fairShareThreshold: { type: Number, default: 0 },
  fairShareRate: { type: Number, default: 0 },

  // Totaux calculés (snapshot)
  totalIncome: { type: Number, default: 0 },
  totalCharge: { type: Number, default: 0 },
  totalRelief: { type: Number, default: 0 },
  base: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  fairShare: { type: Number, default: 0 },
  totalTax: { type: Number, default: 0 },
  effectiveRate: { type: Number, default: 0 },
  remaining: { type: Number, default: 0 },

  status: { type: String, enum: ['draft', 'saved'], default: 'draft' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

SimulationSchema.index({ kind: 1, company: 1, fiscalYearLabel: 1 });

module.exports = mongoose.models.Simulation || mongoose.model('Simulation', SimulationSchema);
