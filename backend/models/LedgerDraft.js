// models/LedgerDraft.js — métadonnées d'un brouillon de Grand Livre enregistré
// (un par société + norme + période). Les écritures vivent dans LedgerEntry.
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const LedgerDraftSchema = new Schema(
  {
    company: { type: String, required: true },
    standard: { type: String, required: true },
    from: { type: String, required: true }, // "YYYY-MM-DD"
    to: { type: String, required: true },
    label: { type: String, default: null },
    generatedAt: { type: Date, default: null },
    refreshedAt: { type: Date, default: null },
    savedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

LedgerDraftSchema.index({ company: 1, standard: 1, from: 1, to: 1 }, { unique: true });

module.exports = mongoose.model('LedgerDraft', LedgerDraftSchema);
