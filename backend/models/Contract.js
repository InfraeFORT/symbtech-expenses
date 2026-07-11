// models/Contract.js — contrat client (référentiel), avec documents nommés (S3).
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const AttachmentSchema = new Schema(
  {
    kind: { type: String, default: 'contract' }, // contract | annexe | other
    label: { type: String, default: null },
    s3Key: { type: String, default: null },
    date: { type: String, default: null },
  },
  { _id: false }
);

const ContractSchema = new Schema(
  {
    clientId: { type: String, default: null },
    clientName: { type: String, default: null },
    company: { type: String, default: null }, // société Symbtech contractante

    reference: { type: String, default: null },
    name: { type: String, default: null }, // intitulé (sert au tri du factory)
    object: { type: String, default: null },

    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
    currency: { type: String, default: 'EUR' },
    value: { type: Number, default: null },

    paymentTerms: { type: String, default: null },
    mentions: { type: String, default: null }, // mentions à reporter sur les factures
    noticePeriod: { type: String, default: null },

    status: { type: String, enum: ['draft', 'active', 'expired', 'terminated'], default: 'active' },
    active: { type: Boolean, default: true },

    attachments: { type: [AttachmentSchema], default: [] },
    ocrRaw: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

ContractSchema.index({ clientId: 1 });

module.exports = mongoose.model('Contract', ContractSchema);
