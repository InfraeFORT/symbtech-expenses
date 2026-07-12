// models/Supplier.js — fournisseurs : identité (société ou personne physique), contacts, pièces jointes S3.
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

const BonusSchema = new Schema(
  {
    label: { type: String, default: null },
    amount: { type: Number, default: 0 },
    recurring: { type: Boolean, default: false }, // récurrent (reporté chaque mois) vs ponctuel
  },
  { _id: false }
);

const EmploymentSchema = new Schema(
  {
    company: { type: String, default: null }, // société employeuse (nom)
    country: { type: String, default: null }, // FR | MU
    currency: { type: String, default: null },
    contractType: { type: String, default: null }, // CDI, CDD, …
    startDate: { type: String, default: null }, // date d'entrée / début de contrat
    position: { type: String, default: null },
    classification: { type: String, default: null },
    coefficient: { type: String, default: null },
    isCadre: { type: Boolean, default: false },
    workedHours: { type: Number, default: 151.67 },
    annualGross: { type: Number, default: 0 }, // rémunération annuelle brute
    monthlyGross: { type: Number, default: 0 }, // mensualisée
    monthsPerYear: { type: Number, default: 12 }, // 12 + mois supplémentaires (13e, 14e…)
    bonuses: { type: [BonusSchema], default: [] },
  },
  { _id: false }
);

const SupplierSchema = new Schema(
  {
    name: { type: String, required: true },
    contacts: { type: [ContactSchema], default: [] },
    address1: { type: String, default: null },
    address2: { type: String, default: null },
    postalCode: { type: String, default: null },
    city: { type: String, default: null },
    country: { type: String, default: null },
    regNumber: { type: String, default: null },
    vatNumber: { type: String, default: null },
    isIndividual: { type: Boolean, default: false }, // personne physique (vs société)
    // Champs personne physique (renseignés quand isIndividual = true)
    civility: { type: String, default: null }, // M. | Mme | …
    firstName: { type: String, default: null },
    lastName: { type: String, default: null },
    birthDate: { type: String, default: null },
    nationalId: { type: String, default: null }, // NIC / n° pièce d'identité / n° SS
    isEmployee: { type: Boolean, default: false }, // salarié (personne physique employée)
    employment: { type: EmploymentSchema, default: () => ({}) },
    attachments: { type: [AttachmentSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Supplier || mongoose.model('Supplier', SupplierSchema);
