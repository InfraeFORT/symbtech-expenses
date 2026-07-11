// models/Invoice.js — facture émise par une société Symbtech à un client.
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const LineSchema = new Schema(
  {
    description: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    vatRate: { type: Number, default: 0 }, // en %
  },
  { _id: false }
);

const BankAccountSchema = new Schema(
  {
    bankName: { type: String, default: null },
    swift: { type: String, default: null },
    iban: { type: String, default: null },
    accountNumber: { type: String, default: null },
    currency: { type: String, default: null },
  },
  { _id: false }
);

// Blocs dénormalisés (figés à l'émission pour archivage fidèle).
const PartySchema = new Schema(
  {
    name: { type: String, default: null },
    code: { type: String, default: null },
    address1: { type: String, default: null },
    address2: { type: String, default: null },
    postalCode: { type: String, default: null },
    city: { type: String, default: null },
    country: { type: String, default: null },
    regNumber: { type: String, default: null },
    vatNumber: { type: String, default: null },
    bankAccounts: { type: [BankAccountSchema], default: [] },
  },
  { _id: false }
);

const InvoiceSchema = new Schema(
  {
    number: { type: String, default: null }, // assigné à l'émission
    status: { type: String, enum: ['draft', 'issued', 'paid', 'cancelled'], default: 'draft' },

    issuerCompany: { type: String, default: null }, // nom de la société émettrice
    issuer: { type: PartySchema, default: () => ({}) },
    clientId: { type: String, default: null },
    client: { type: PartySchema, default: () => ({}) },

    date: { type: String, default: null }, // "YYYY-MM-DD"
    dueDate: { type: String, default: null },
    currency: { type: String, default: 'EUR' },

    lines: { type: [LineSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    vatTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },

    notes: { type: String, default: null },
    paymentTerms: { type: String, default: null },

    // Rattachement commande / contrat (Phase 2)
    orderId: { type: String, default: null },
    orderNumber: { type: String, default: null },
    contractId: { type: String, default: null },
    mentions: { type: String, default: null }, // mentions obligatoires (contrat + avenants + commande)

    // Archivage / import d'historique de factures de vente
    source: { type: String, default: null }, // 'import' pour les factures importées
    importBatch: { type: String, default: null },
    dedupKey: { type: String, default: null },

    // Informations de gestion complémentaires
    craId: { type: String, default: null },
    craLabel: { type: String, default: null },
    quoteId: { type: String, default: null },
    quoteNumber: { type: String, default: null },
    prestationDays: { type: Number, default: null }, // jours de prestation (alimenté par le CRA si rattaché)
    expenseReimbursement: { type: Number, default: null }, // remboursement de frais (montant)
    performedById: { type: String, default: null }, // fournisseur ayant réalisé
    performedBy: { type: String, default: null },
    taxImpact: { type: Boolean, default: false },
    interco: { type: Boolean, default: false },
    intercoCompany: { type: String, default: null }, // société destinataire si interco
    noCash: { type: Boolean, default: false },
    amountPaid: { type: Number, default: null }, // montant encaissé (rapprochement bancaire)
  },
  { timestamps: true }
);

InvoiceSchema.index({ issuerCompany: 1, number: 1 });
InvoiceSchema.index({ status: 1, date: -1 });
InvoiceSchema.index({ dedupKey: 1 });

module.exports = mongoose.model('Invoice', InvoiceSchema);
