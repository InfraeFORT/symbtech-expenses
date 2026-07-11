// models/BankTransaction.js — une ligne de relevé bancaire importée.
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const BankTransactionSchema = new Schema(
  {
    company: { type: String, default: null }, // entité (nom de la société)
    account: { type: String, default: null }, // libellé du compte (banque / IBAN)

    date: { type: String, default: null }, // "YYYY-MM-DD"
    label: { type: String, default: null }, // libellé de l'opération
    amount: { type: Number, default: null }, // signé : + crédit, - débit
    currency: { type: String, default: null },
    balance: { type: Number, default: null }, // solde après opération (optionnel)
    externalRef: { type: String, default: null },

    // Déduplication & traçabilité d'import
    dedupKey: { type: String, default: null },
    importBatch: { type: String, default: null },
    source: { type: String, default: null }, // nom du fichier importé

    // Rapprochement
    reconciled: { type: Boolean, default: false },
    reconcileType: { type: String, default: null }, // 'expense' | 'internal'
    matchedExpenseId: { type: String, default: null }, // si type 'expense'
    reconcileCategory: { type: String, default: null }, // si type 'internal' (Virement, Salaire…)
    matchedLabel: { type: String, default: null }, // libellé dénormalisé pour affichage
    reconciledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

BankTransactionSchema.index({ company: 1, date: -1 });
BankTransactionSchema.index({ dedupKey: 1 });
BankTransactionSchema.index({ importBatch: 1 });
BankTransactionSchema.index({ reconciled: 1 });

module.exports = mongoose.model('BankTransaction', BankTransactionSchema);
