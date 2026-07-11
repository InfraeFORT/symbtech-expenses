// models/LedgerEntry.js — lignes (legs) du Grand Livre, en partie double.
// Une "pièce" (opération source) regroupe plusieurs legs équilibrés via pieceRef.
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const AccountSchema = new Schema(
  {
    code: { type: String, default: null },
    label: { type: String, default: null },
    type: { type: String, default: null }, // expense|revenue|cash|payable|receivable|vat|suspense|...
  },
  { _id: false }
);

const LedgerEntrySchema = new Schema(
  {
    company: { type: String, required: true },
    standard: { type: String, required: true }, // IFRS | IFRS_SME | PCG

    date: { type: String, default: null }, // "YYYY-MM-DD"
    pieceRef: { type: String, required: true }, // = sourceKey : regroupe les legs d'une opération
    sourceKey: { type: String, required: true, index: true },

    account: { type: AccountSchema, default: () => ({}) },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    currency: { type: String, default: null },
    label: { type: String, default: null },

    source: {
      type: { type: String, default: null }, // expense | invoice | bank
      id: { type: String, default: null },
      snapshot: { type: Schema.Types.Mixed, default: {} },
    },

    status: { type: String, enum: ['included', 'rejected'], default: 'included' },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

LedgerEntrySchema.index({ company: 1, standard: 1, date: 1 });
LedgerEntrySchema.index({ company: 1, standard: 1, status: 1 });

module.exports = mongoose.model('LedgerEntry', LedgerEntrySchema);
