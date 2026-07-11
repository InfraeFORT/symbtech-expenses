// models/Company.js — nos sociétés : identité, comptes bancaires, moyens de paiement, paie.
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

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

const PaymentMethodSchema = new Schema(
  {
    name: { type: String, required: true }, // ex "Virement MCB EUR", "Carte société"
    type: { type: String, default: 'other' }, // card | transfer | cash | other
    bankIban: { type: String, default: null }, // rattachement (optionnel) à un compte ci-dessus
  },
  { _id: false }
);

const CompanySchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, default: null }, // ex SYMBTECHZA
    address1: { type: String, default: null },
    address2: { type: String, default: null },
    postalCode: { type: String, default: null },
    city: { type: String, default: null },
    country: { type: String, default: null },
    regNumber: { type: String, default: null }, // RC / SIRET / BRN
    vatNumber: { type: String, default: null },
    // Paie / déclarations sociales (report automatique sur les bulletins)
    apeCode: { type: String, default: null }, // Code APE/NAF (FR) ou secteur (MU)
    urssafNumber: { type: String, default: null }, // N° employeur URSSAF (FR) ou ERN MRA (MU)
    conventionCollective: { type: String, default: null },
    imageKey: { type: String, default: null }, // logo de la société (S3)
    accountingStandards: { type: [String], default: [] }, // normes choisies (IFRS, PCG…)
    bankAccounts: { type: [BankAccountSchema], default: [] },
    paymentMethods: { type: [PaymentMethodSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Company || mongoose.model('Company', CompanySchema);
