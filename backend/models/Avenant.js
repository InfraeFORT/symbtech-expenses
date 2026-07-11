// models/Avenant.js — avenant (versionning d'un contrat), avec documents nommés (S3).
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const AttachmentSchema = new Schema(
  {
    kind: { type: String, default: 'avenant' },
    label: { type: String, default: null },
    s3Key: { type: String, default: null },
    date: { type: String, default: null },
  },
  { _id: false }
);

const AvenantSchema = new Schema(
  {
    contractId: { type: String, required: true },
    version: { type: String, default: null }, // ex : "A1", "v2"
    date: { type: String, default: null },
    name: { type: String, default: null }, // intitulé (tri)
    summary: { type: String, default: null },
    object: { type: String, default: null },

    value: { type: Number, default: null },
    currency: { type: String, default: null },
    paymentTerms: { type: String, default: null },
    mentions: { type: String, default: null },

    active: { type: Boolean, default: true },
    attachments: { type: [AttachmentSchema], default: [] },
    ocrRaw: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

AvenantSchema.index({ contractId: 1, date: 1 });

module.exports = mongoose.model('Avenant', AvenantSchema);
