// models/Client.js — clients/tiers : identité, contacts, (pièces jointes à venir).
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const ContactSchema = new Schema(
  {
    name: { type: String, default: null },
    role: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
  },
  { _id: false }
);

const AttachmentSchema = new Schema(
  {
    kind: { type: String, default: 'contract' }, // contract | po | other
    label: { type: String, default: null },
    s3Key: { type: String, default: null },
    date: { type: String, default: null },
  },
  { _id: false }
);

const ClientSchema = new Schema(
  {
    name: { type: String, required: true },
    onBehalfOf: { type: String, default: null }, // "Pour le compte de"
    contacts: { type: [ContactSchema], default: [] },
    address1: { type: String, default: null },
    address2: { type: String, default: null },
    postalCode: { type: String, default: null },
    city: { type: String, default: null },
    country: { type: String, default: null },
    regNumber: { type: String, default: null },
    vatNumber: { type: String, default: null },
    attachments: { type: [AttachmentSchema], default: [] }, // contrats, bons de commande
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Client || mongoose.model('Client', ClientSchema);
