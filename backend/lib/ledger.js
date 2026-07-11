// lib/ledger.js — moteur de Grand Livre en partie double.
// Convertit dépenses / factures / lignes bancaires en écritures équilibrées,
// avec cycle de tiers (engagement puis règlement) et imputation par libellé.
const Expense = require('../models/Expense');
const Invoice = require('../models/Invoice');
const BankTransaction = require('../models/BankTransaction');
const LedgerEntry = require('../models/LedgerEntry');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function family(standard) { return standard === 'PCG' ? 'PCG' : 'IFRS'; }

// Plan de comptes par famille. type ∈ expense|revenue|cash|payable|receivable|vat|suspense
const ACC = {
  PCG: {
    bank: { code: '512', label: 'Banque', type: 'cash' },
    vatDed: { code: '44566', label: 'TVA déductible', type: 'vat' },
    vatCol: { code: '44571', label: 'TVA collectée', type: 'vat' },
    supplier: { code: '401', label: 'Fournisseurs', type: 'payable' },
    client: { code: '411', label: 'Clients', type: 'receivable' },
    personnel: { code: '421', label: 'Personnel — rémunérations dues', type: 'payable' },
    state: { code: '447', label: 'État — impôts et taxes', type: 'payable' },
    assoc: { code: '455', label: 'Associés — comptes courants', type: 'receivable' },
    internal: { code: '580', label: 'Virements internes', type: 'cash' },
    suspense: { code: '471', label: 'Compte d’attente (à classer)', type: 'suspense' },
    sales: { code: '706', label: 'Prestations de services', type: 'revenue' },
    miscIncome: { code: '758', label: 'Produits divers de gestion', type: 'revenue' },
    bankFees: { code: '627', label: 'Services bancaires', type: 'expense' },
    interest: { code: '661', label: 'Charges d’intérêts', type: 'expense' },
    transport: { code: '6251', label: 'Voyages et déplacements', type: 'expense' },
    fuel: { code: '6061', label: 'Carburants', type: 'expense' },
    purchases: { code: '606', label: 'Achats non stockés', type: 'expense' },
    reception: { code: '6257', label: 'Réceptions et repas', type: 'expense' },
    telecom: { code: '626', label: 'Frais postaux et télécommunications', type: 'expense' },
    software: { code: '6068', label: 'Logiciels et abonnements', type: 'expense' },
    medical: { code: '6475', label: 'Frais médicaux / prévoyance', type: 'expense' },
    rent: { code: '6132', label: 'Locations immobilières', type: 'expense' },
    utilities: { code: '6063', label: 'Eau, énergie, fournitures', type: 'expense' },
    salary: { code: '641', label: 'Rémunérations du personnel', type: 'expense' },
    tax: { code: '635', label: 'Impôts et taxes', type: 'expense' },
  },
  IFRS: {
    bank: { code: '5100', label: 'Cash and bank', type: 'cash' },
    vatDed: { code: '1450', label: 'VAT receivable', type: 'vat' },
    vatCol: { code: '2450', label: 'VAT payable', type: 'vat' },
    supplier: { code: '2100', label: 'Trade payables', type: 'payable' },
    client: { code: '1100', label: 'Trade receivables', type: 'receivable' },
    personnel: { code: '2200', label: 'Payroll payable', type: 'payable' },
    state: { code: '2300', label: 'Taxes payable', type: 'payable' },
    assoc: { code: '1300', label: 'Shareholder current account', type: 'receivable' },
    internal: { code: '5800', label: 'Inter-account transfers', type: 'cash' },
    suspense: { code: '1900', label: 'Suspense account', type: 'suspense' },
    sales: { code: '4000', label: 'Revenue', type: 'revenue' },
    miscIncome: { code: '4900', label: 'Other income', type: 'revenue' },
    bankFees: { code: '6300', label: 'Bank charges', type: 'expense' },
    interest: { code: '6400', label: 'Interest expense', type: 'expense' },
    transport: { code: '6100', label: 'Travel expenses', type: 'expense' },
    fuel: { code: '6110', label: 'Fuel', type: 'expense' },
    purchases: { code: '6000', label: 'Supplies and consumables', type: 'expense' },
    reception: { code: '6200', label: 'Meals and entertainment', type: 'expense' },
    telecom: { code: '6250', label: 'Communications', type: 'expense' },
    software: { code: '6260', label: 'Software and subscriptions', type: 'expense' },
    medical: { code: '6470', label: 'Medical / welfare', type: 'expense' },
    rent: { code: '6130', label: 'Rent', type: 'expense' },
    utilities: { code: '6120', label: 'Utilities', type: 'expense' },
    salary: { code: '6500', label: 'Staff costs', type: 'expense' },
    tax: { code: '6600', label: 'Taxes', type: 'expense' },
  },
};

// Imputation d'un libellé bancaire → clé de nature. Ordre = priorité.
function classifyKey(label) {
  const t = (label || '').toLowerCase();
  if (/inter acc|inter account|own acc trf|inter-acc/.test(t)) return 'internal';
  if (/penalty interest|debit interest/.test(t)) return 'interest';
  if (/\bcharge\b|subs fee|transfer charge|direct debit charge|failed direct debit|ac-usd|service fee|\bfee\b|consolidated entry/.test(t)) return 'bankfee';
  if (/revenue authority|\bmra\b|\btax\b|government|pac mcbl|direct debit scheme|passport|immigration/.test(t)) return 'tax';
  if (/school|northfield|tuition|fees vitiere|vitiere fees|car rental vitiere/.test(t)) return 'personal';
  if (/salary|salaire|director fees|directors fees|director fee|\bfees\b|honoraire|wages|payroll/.test(t)) return 'salary';
  if (/\brent\b|rental|loyer|beezadhur/.test(t)) return 'rent';
  if (/\bceb\b|electric|\bcwa\b|\bwater\b|utility|telecom bill/.test(t)) return 'utilities';
  if (/dropbox|adobe|google|microsoft|\baws\b|software|licence|license|saas|subscription/.test(t)) return 'software';
  if (/emtel|telecom|mauritius telecom|mtelecom|\bmyt\b|liberty connect|internet|\bmobile\b/.test(t)) return 'telecom';
  if (/shell|engen|\bpetrol\b|\besso\b|carburant|\bfuel\b|gas station|gblc/.test(t)) return 'fuel';
  if (/gare|orly|\bcdg\b|airport|havalimani|air austral|airline|prebook travel|taxi|\btrain\b|\bvol\b|flight|\baer\b|istanbul|ictur|narita|tokyo|lawson|immigration/.test(t)) return 'transport';
  if (/clinic|\bdr \b|tennant|pharma|optic|hospital|c care|medical|delaisse|orthophoniste/.test(t)) return 'medical';
  if (/super u|intermart|winner|paltoni|grocery|\bmarket\b|\bspar\b|london way|silver coast/.test(t)) return 'groceries';
  if (/mcdonald|mc donald|restaurant|\bsnack\b|terasse|madeleine|boulangerie|laduree|la duree|\bcafe\b|royal snack|laqua|aventure des saveurs|chirougui|armada|danis hotel/.test(t)) return 'reception';
  return 'unknown';
}

// clé → { nature (compte), via ('supplier'|'personnel'|'state'|'client'|'assoc'|null) }
const KEYMAP = {
  transport: { acc: 'transport', via: 'supplier' },
  fuel: { acc: 'fuel', via: 'supplier' },
  groceries: { acc: 'purchases', via: 'supplier' },
  reception: { acc: 'reception', via: 'supplier' },
  telecom: { acc: 'telecom', via: 'supplier' },
  software: { acc: 'software', via: 'supplier' },
  medical: { acc: 'medical', via: 'supplier' },
  rent: { acc: 'rent', via: 'supplier' },
  utilities: { acc: 'utilities', via: 'supplier' },
  salary: { acc: 'salary', via: 'personnel' },
  tax: { acc: 'tax', via: 'state' },
  personal: { acc: 'assoc', via: null }, // dépense personnelle → compte courant associé
  bankfee: { acc: 'bankFees', via: null },
  interest: { acc: 'interest', via: null },
  internal: { acc: 'internal', via: null },
  unknown: { acc: 'suspense', via: null },
};

// Catégorie de rapprochement (choix explicite de l'utilisateur) → clé.
function categoryToKey(cat) {
  const c = (cat || '').toLowerCase();
  if (/virement interne/.test(c)) return 'internal';
  if (/salaire|honoraire/.test(c)) return 'salary';
  if (/frais bancaire/.test(c)) return 'bankfee';
  if (/taxe|tva/.test(c)) return 'tax';
  return 'unknown';
}

// Compte de charge d'une dépense saisie (par type).
function expenseAccount(type, fam) {
  const key = classifyKey(type);
  const k = KEYMAP[key] && KEYMAP[key].acc && ACC[fam][KEYMAP[key].acc] && ACC[fam][KEYMAP[key].acc].type === 'expense' ? KEYMAP[key].acc : 'purchases';
  return ACC[fam][k];
}

// --- Constructeurs (legs équilibrés) ---

// Cycle d'achat : D charge (+TVA) / C tiers ; puis D tiers / C banque.
function purchaseCycle(charge, vatLeg, ttc, tp, bank) {
  const legs = [{ account: charge, debit: round2(ttc - (vatLeg ? vatLeg.amount : 0)), credit: 0 }];
  if (vatLeg) legs.push({ account: vatLeg.account, debit: round2(vatLeg.amount), credit: 0 });
  legs.push({ account: tp, debit: 0, credit: round2(ttc) });
  legs.push({ account: tp, debit: round2(ttc), credit: 0 });
  legs.push({ account: bank, debit: 0, credit: round2(ttc) });
  return legs;
}
function directLegs(nature, bank, amt, isDebit) {
  return isDebit
    ? [{ account: nature, debit: amt, credit: 0 }, { account: bank, debit: 0, credit: amt }]
    : [{ account: bank, debit: amt, credit: 0 }, { account: nature, debit: 0, credit: amt }];
}

function legsForExpense(e, fam) {
  const acc = ACC[fam];
  const ttc = round2(e.amount);
  const vat = round2(e.vat || 0);
  const charge = expenseAccount(e.type, fam);
  return purchaseCycle(charge, vat > 0 ? { account: acc.vatDed, amount: vat } : null, ttc, acc.supplier, acc.bank);
}

function legsForInvoice(inv, fam) {
  const acc = ACC[fam];
  const ttc = round2(inv.total);
  const vat = round2(inv.vatTotal);
  const ht = round2(inv.subtotal);
  const legs = [{ account: acc.client, debit: ttc, credit: 0 }, { account: acc.sales, debit: 0, credit: ht }];
  if (vat > 0) legs.push({ account: acc.vatCol, debit: 0, credit: vat });
  if (inv.status === 'paid') {
    legs.push({ account: acc.bank, debit: ttc, credit: 0 });
    legs.push({ account: acc.client, debit: 0, credit: ttc });
  }
  return legs;
}

function legsForBank(tx, fam) {
  const acc = ACC[fam];
  const amt = round2(Math.abs(tx.amount));
  const isDebit = (tx.amount || 0) < 0;

  // Choix explicite au rapprochement → prioritaire ; sinon imputation par libellé.
  const key = tx.reconcileType === 'internal' ? categoryToKey(tx.reconcileCategory) : classifyKey(tx.label);
  const m = KEYMAP[key] || KEYMAP.unknown;
  const nature = ACC[fam][m.acc] || acc.suspense;

  // Crédits (entrées) : virement interne → 580 ; sinon compte d'attente (revenu à reclasser).
  if (!isDebit) {
    if (key === 'internal') return directLegs(acc.internal, acc.bank, amt, false);
    return directLegs(acc.suspense, acc.bank, amt, false);
  }

  // Débits : cycle de tiers si applicable, sinon écriture directe.
  if (m.via) {
    const tp = ACC[fam][m.via];
    return purchaseCycle(nature, null, amt, tp, acc.bank);
  }
  return directLegs(nature, acc.bank, amt, true);
}

// --- Sources & construction des pièces ---

function keyOf(company, standard, type, id) { return `${company}|${standard}|${type}|${id}`; }

async function sourceOps({ company, from, to }) {
  const [exps, invs, banks] = await Promise.all([
    Expense.find({ company, date: { $gte: from, $lte: to } }),
    Invoice.find({ issuerCompany: company, status: { $in: ['issued', 'paid'] }, date: { $gte: from, $lte: to } }),
    // exclut les lignes déjà rapprochées à une dépense (anti double-comptage)
    BankTransaction.find({ company, date: { $gte: from, $lte: to }, reconcileType: { $ne: 'expense' } }),
  ]);
  return { exps, invs, banks };
}

// Construit les legs de toutes les pièces. statusByKey conserve les rejets ;
// onlyNew (Set de sourceKeys existants) restreint à l'ajout incrémental.
function buildDocs({ company, standard, ops, statusByKey, onlyNew }) {
  const fam = family(standard);
  const docs = [];
  const add = (type, id, date, currency, label, legs, snapshot) => {
    const sourceKey = keyOf(company, standard, type, id);
    if (onlyNew && onlyNew.has(sourceKey)) return;
    const status = (statusByKey && statusByKey[sourceKey]) || 'included';
    for (const leg of legs) {
      docs.push({
        company, standard, date, pieceRef: sourceKey, sourceKey,
        account: leg.account, debit: round2(leg.debit), credit: round2(leg.credit),
        currency, label, source: { type, id: String(id), snapshot }, status, generatedAt: new Date(),
      });
    }
  };
  for (const e of ops.exps) {
    add('expense', e._id, e.date, e.currency, e.title || e.merchant || 'Dépense', legsForExpense(e, fam), {
      title: e.title, merchant: e.merchant, amount: e.amount, vat: e.vat, type: e.type,
      date: e.date, currency: e.currency, isExpenseReport: e.isExpenseReport, person: e.person, source: e.source,
    });
  }
  for (const inv of ops.invs) {
    add('invoice', inv._id, inv.date, inv.currency, `Facture ${inv.number || ''} ${inv.client?.name || ''}`.trim(), legsForInvoice(inv, fam), {
      number: inv.number, client: inv.client?.name, total: inv.total, vatTotal: inv.vatTotal,
      subtotal: inv.subtotal, date: inv.date, currency: inv.currency, status: inv.status,
    });
  }
  for (const b of ops.banks) {
    add('bank', b._id, b.date, b.currency, b.label, legsForBank(b, fam), {
      label: b.label, amount: b.amount, account: b.account, reconciled: b.reconciled,
      reconcileType: b.reconcileType, reconcileCategory: b.reconcileCategory, date: b.date, currency: b.currency,
    });
  }
  return docs;
}

// Reconstruction complète sur la période (conserve les rejets).
async function generate({ company, standard, from, to }) {
  const prev = await LedgerEntry.find({ company, standard }).select('sourceKey status');
  const statusByKey = {};
  for (const p of prev) statusByKey[p.sourceKey] = p.status;
  const ops = await sourceOps({ company, from, to });
  const docs = buildDocs({ company, standard, ops, statusByKey });
  await LedgerEntry.deleteMany({ company, standard, date: { $gte: from, $lte: to } });
  if (docs.length) await LedgerEntry.insertMany(docs);
  return { legs: docs.length, pieces: new Set(docs.map((d) => d.sourceKey)).size };
}

// Ajout incrémental : n'intègre QUE les nouvelles pièces (préserve l'existant et les rejets).
async function refresh({ company, standard, from, to }) {
  const existing = await LedgerEntry.find({ company, standard }).distinct('sourceKey');
  const onlyNew = new Set(existing);
  const ops = await sourceOps({ company, from, to });
  const docs = buildDocs({ company, standard, ops, onlyNew });
  if (docs.length) await LedgerEntry.insertMany(docs);
  return { added: new Set(docs.map((d) => d.sourceKey)).size, legs: docs.length };
}

// Compte les opérations sources de la période pas encore intégrées au brouillon.
async function pending({ company, standard, from, to }) {
  const existing = await LedgerEntry.find({ company, standard }).distinct('sourceKey');
  const set = new Set(existing);
  const ops = await sourceOps({ company, from, to });
  const cnt = { expense: 0, invoice: 0, bank: 0 };
  for (const e of ops.exps) if (!set.has(keyOf(company, standard, 'expense', e._id))) cnt.expense++;
  for (const i of ops.invs) if (!set.has(keyOf(company, standard, 'invoice', i._id))) cnt.invoice++;
  for (const b of ops.banks) if (!set.has(keyOf(company, standard, 'bank', b._id))) cnt.bank++;
  return { total: cnt.expense + cnt.invoice + cnt.bank, ...cnt };
}

module.exports = {
  generate, refresh, pending, family, ACC, classifyKey, expenseAccount,
  legsForExpense, legsForInvoice, legsForBank, round2,
};
