// models/Quote.js — devis de vente émis par une société Symbtech à un client.
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const LineSchema = new Schema(
  {
    description: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    vatRate: { type: Number, default: 0 },
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

const QuoteSchema = new Schema(
  {
    number: { type: String, default: null }, // assigné à l'émission
    status: { type: String, enum: ['draft', 'sent', 'accepted', 'rejected', 'converted'], default: 'draft' },

    issuerCompany: { type: String, default: null },
    issuer: { type: PartySchema, default: () => ({}) },
    clientId: { type: String, default: null },
    client: { type: PartySchema, default: () => ({}) },

    date: { type: String, default: null },
    validUntil: { type: String, default: null },
    currency: { type: String, default: 'EUR' },

    lines: { type: [LineSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    vatTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },

    notes: { type: String, default: null },
    terms: { type: String, default: null },

    convertedInvoiceId: { type: String, default: null }, // facture issue de la conversion
  },
  { timestamps: true }
);

QuoteSchema.index({ issuerCompany: 1, number: 1 });
QuoteSchema.index({ status: 1, date: -1 });

module.exports = mongoose.model('Quote', QuoteSchema);
