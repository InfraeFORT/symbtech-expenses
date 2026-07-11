// models/Order.js — commande client rattachée à un contrat, avec documents nommés (S3).
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

const AttachmentSchema = new Schema(
  {
    kind: { type: String, default: 'po' }, // po (bon de commande) | annexe | other
    label: { type: String, default: null },
    s3Key: { type: String, default: null },
    date: { type: String, default: null },
  },
  { _id: false }
);

const OrderSchema = new Schema(
  {
    contractId: { type: String, default: null },
    clientId: { type: String, default: null },
    clientName: { type: String, default: null },
    company: { type: String, default: null },

    number: { type: String, default: null },
    name: { type: String, default: null }, // intitulé (tri)
    date: { type: String, default: null },
    description: { type: String, default: null },
    lines: { type: [LineSchema], default: [] },

    amount: { type: Number, default: null },
    currency: { type: String, default: 'EUR' },
    paymentTerms: { type: String, default: null },
    mentions: { type: String, default: null },

    status: { type: String, enum: ['open', 'invoiced', 'closed', 'cancelled'], default: 'open' },
    active: { type: Boolean, default: true },

    attachments: { type: [AttachmentSchema], default: [] },
    ocrRaw: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

OrderSchema.index({ contractId: 1 });
OrderSchema.index({ clientId: 1 });

module.exports = mongoose.model('Order', OrderSchema);
