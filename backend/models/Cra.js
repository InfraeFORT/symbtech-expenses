// models/Cra.js — feuille de temps / compte rendu d'activité mensuel.
// Activités ventilées par jour et par catégorie (production | absence | internal).
// Seule la production est facturable.
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const ActivitySchema = new Schema(
  {
    label: { type: String, default: '' },
    category: { type: String, enum: ['production', 'absence', 'internal'], default: 'production' },
    clientRef: { type: String, default: null }, // ex : "SAFRAN - ... MIS1991"
    contractId: { type: String, default: null },
    orderId: { type: String, default: null },
    orderNumber: { type: String, default: null },
    unit: { type: String, default: 'jour' },
    unitPrice: { type: Number, default: 0 },
    vatRate: { type: Number, default: 0 },
    days: { type: Schema.Types.Mixed, default: {} }, // { "1": 1, "20": 0.5, ... }
  },
  { _id: false }
);

const CraSchema = new Schema(
  {
    company: { type: String, default: null }, // société émettrice
    clientId: { type: String, default: null },
    clientName: { type: String, default: null },
    contractId: { type: String, default: null },
    orderId: { type: String, default: null },
    orderNumber: { type: String, default: null },

    reference: { type: String, default: null },
    title: { type: String, default: null },
    person: { type: String, default: null },

    month: { type: String, default: null }, // "YYYY-MM"
    periodLabel: { type: String, default: null },
    currency: { type: String, default: 'EUR' },

    activities: { type: [ActivitySchema], default: [] },

    subtotal: { type: Number, default: 0 },
    vatTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    productionDays: { type: Number, default: 0 },
    absenceDays: { type: Number, default: 0 },
    internalDays: { type: Number, default: 0 },
    quantityTotal: { type: Number, default: 0 },

    status: { type: String, enum: ['draft', 'submitted', 'approved', 'rejected', 'invoiced'], default: 'draft' },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approverNote: { type: String, default: null },

    notes: { type: String, default: null },
    invoiceId: { type: String, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CraSchema.index({ clientId: 1, status: 1 });
CraSchema.index({ company: 1, month: 1 });

module.exports = mongoose.model('Cra', CraSchema);
