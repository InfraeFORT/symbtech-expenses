// models/Expense.js — schéma d'une dépense (cf. docs/Context-Data.md).
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const ExpenseSchema = new Schema(
  {
    // Qui
    createdBy: { type: String, default: null },
    expenseFor: { type: String, default: null },

    // Issu de l'OCR (corrigé par l'humain avant enregistrement)
    title: { type: String, required: true },
    merchant: { type: String, default: null },
    date: { type: String, default: null }, // ISO "YYYY-MM-DD"
    type: { type: String, default: null },
    amount: { type: Number, default: null },
    vat: { type: Number, default: null },
    currency: { type: String, default: null },

    // Choix métier
    company: { type: String, default: null },
    paymentMethod: { type: String, default: null },
    proOrPerso: { type: String, enum: ['pro', 'perso'], default: 'pro' },
    taxImpact: { type: Boolean, default: false },
    refactTo: { type: String, default: null },

    // Note de frais : dépense avancée par une personne physique
    // (fournisseur marqué isIndividual). person = nom de cette personne.
    isExpenseReport: { type: Boolean, default: false },
    person: { type: String, default: null },

    // Justificatif(s) — plusieurs pages possibles
    s3Keys: { type: [String], default: [] },

    // Traçabilité OCR
    ocrRaw: { type: Schema.Types.Mixed, default: null },
    ocrConfidence: { type: Number, default: null },
    validatedByHuman: { type: Boolean, default: false },

    // Import en masse (Excel/CSV)
    source: { type: String, default: 'manual' }, // manual | mobile | import
    importBatch: { type: String, default: null },
    dedupKey: { type: String, default: null, index: true },

    // Facture fournisseur (import d'historique d'achats)
    supplierId: { type: String, default: null },
    invoiceNumber: { type: String, default: null },
    dueDate: { type: String, default: null },
    subtotal: { type: Number, default: null }, // total HT (amount = TTC, vat = TVA)
  },
  { timestamps: true } // createdAt / updatedAt automatiques
);

// Index alignés sur les recherches prévues
ExpenseSchema.index({ company: 1, date: -1 });
ExpenseSchema.index({ expenseFor: 1, date: -1 });
ExpenseSchema.index({ type: 1, date: -1 });
ExpenseSchema.index({ validatedByHuman: 1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
