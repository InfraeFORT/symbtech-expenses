// models/Payslip.js — bulletin de paie (France).
const { mongoose } = require('../lib/db');
const { Schema } = mongoose;

const GainSchema = new Schema({ label: { type: String, default: '' }, amount: { type: Number, default: 0 } }, { _id: false });

const ContribSchema = new Schema({
  label: { type: String, default: '' },
  category: { type: String, default: null },
  baseType: { type: String, default: 'brut' }, // brut | plafond | t2 | csg (indicatif)
  base: { type: Number, default: 0 },
  employeeRate: { type: Number, default: 0 },
  employeeAmount: { type: Number, default: 0 },
  employerRate: { type: Number, default: 0 },
  employerAmount: { type: Number, default: 0 },
}, { _id: false });

const PayslipSchema = new Schema({
  company: { type: String, default: null }, // société Symbtech employeur
  country: { type: String, enum: ['FR', 'MU'], default: 'FR' },
  currency: { type: String, default: 'EUR' },

  employer: {
    name: { type: String, default: null },
    siret: { type: String, default: null },
    apeCode: { type: String, default: null },
    address: { type: String, default: null },
    urssafNumber: { type: String, default: null },
    conventionCollective: { type: String, default: null },
  },
  employee: {
    name: { type: String, default: null },
    address: { type: String, default: null },
    socialSecurityNumber: { type: String, default: null },
    position: { type: String, default: null },
    classification: { type: String, default: null },
    coefficient: { type: String, default: null },
    hireDate: { type: String, default: null },
    isCadre: { type: Boolean, default: false },
  },

  month: { type: String, default: null }, // "YYYY-MM"
  periodLabel: { type: String, default: null },
  periodFrom: { type: String, default: null },
  periodTo: { type: String, default: null },
  paymentDate: { type: String, default: null },

  baseSalary: { type: Number, default: 0 }, // salaire de base mensuel brut
  workedHours: { type: Number, default: 151.67 },
  hourlyRate: { type: Number, default: null },
  gains: { type: [GainSchema], default: [] },

  pmss: { type: Number, default: 4005 },
  nsfCeiling: { type: Number, default: 28570 }, // Maurice : plafond NSF
  csgThreshold: { type: Number, default: 50000 }, // Maurice : seuil CSG 1,5%/3%
  contributions: { type: [ContribSchema], default: [] },

  taxRate: { type: Number, default: 0 }, // taux de prélèvement à la source
  taxMode: { type: String, enum: ['rate', 'amount'], default: 'rate' }, // 'amount' = PAYE calculé (barème)
  taxFixedAmount: { type: Number, default: 0 }, // montant d'impôt retenu quand taxMode = 'amount'
  edfReliefs: { type: Number, default: 0 }, // Maurice : abattements annuels EDF (personnes à charge…)
  monthsPerYear: { type: Number, default: 12 }, // mensualités/an (13e mois…) pour annualiser
  expenseReimbursement: { type: Number, default: 0 }, // remboursements de frais (non soumis)

  grossTotal: { type: Number, default: 0 },
  totalEmployee: { type: Number, default: 0 },
  totalEmployer: { type: Number, default: 0 },
  netBeforeTax: { type: Number, default: 0 },
  netSocial: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  netPaid: { type: Number, default: 0 },
  employerCost: { type: Number, default: 0 },

  status: { type: String, enum: ['draft', 'finalized'], default: 'draft' },
  notes: { type: String, default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true });

PayslipSchema.index({ company: 1, month: 1 });

module.exports = mongoose.model('Payslip', PayslipSchema);
