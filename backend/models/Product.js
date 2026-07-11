// models/Product.js — référentiel de produits & services (pour lignes de devis/factures).
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const ProductSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: null },
    kind: { type: String, enum: ['service', 'good'], default: 'service' }, // service | bien
    code: { type: String, default: null },
    unit: { type: String, default: null }, // unité, jour, heure, forfait…
    unitPrice: { type: Number, default: 0 },
    vatRate: { type: Number, default: 0 }, // en %
    currency: { type: String, default: 'EUR' },
    active: { type: Boolean, default: true },
    imageKey: { type: String, default: null }, // photo (clé S3)
  },
  { timestamps: true }
);

ProductSchema.index({ name: 1 });

module.exports = mongoose.model('Product', ProductSchema);
