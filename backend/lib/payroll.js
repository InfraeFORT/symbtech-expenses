// lib/payroll.js — logique de paie française (indicative, taux/plafond modifiables côté bulletin).
// PMSS 2026 = 4 005 € (PASS 48 060 €). Les taux ci-dessous sont des valeurs usuelles du secteur
// privé, fournies comme point de départ : elles DOIVENT être vérifiées (URSSAF/BOSS, convention
// collective, taux AT/MP propre à l'entreprise) et sont toutes éditables sur le bulletin.

const PMSS_DEFAULT = 4005;
const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Assiettes usuelles à partir du brut et du plafond mensuel.
function bases(brut, pmss) {
  const p = Number(pmss) || PMSS_DEFAULT;
  const plafond = Math.min(brut, p);               // tranche 1 / assiette plafonnée
  const t2 = Math.max(0, Math.min(brut, 8 * p) - p); // tranche 2 (1 à 8 PMSS)
  const csgBase = round(0.9825 * Math.min(brut, 4 * p)) + Math.max(0, brut - 4 * p); // abattement 1,75 % jusqu'à 4 PMSS
  return { brut: round(brut), plafond: round(plafond), t2: round(t2), csg: round(csgBase) };
}

// Modèle de cotisations par défaut. baseType ∈ {brut, plafond, t2, csg}.
function defaultContributions(brut, pmss, isCadre) {
  const b = bases(brut, pmss);
  const L = (label, category, baseType, employeeRate, employerRate) => {
    const base = b[baseType];
    return {
      label, category, baseType, base,
      employeeRate, employeeAmount: round(base * employeeRate / 100),
      employerRate, employerAmount: round(base * employerRate / 100),
    };
  };
  const lines = [
    L('Santé — Sécurité sociale (maladie, maternité, invalidité, décès)', 'Santé', 'brut', 0, 7.00),
    L('Complémentaire santé (mutuelle)', 'Santé', 'brut', 0, 0),
    L('Accidents du travail / maladies professionnelles', 'Accidents du travail', 'brut', 0, 1.00),
    L('Retraite — Sécurité sociale plafonnée', 'Retraite', 'plafond', 6.90, 8.55),
    L('Retraite — Sécurité sociale déplafonnée', 'Retraite', 'brut', 0.40, 2.02),
    L('Retraite complémentaire Agirc-Arrco T1', 'Retraite', 'plafond', 3.15, 4.72),
    L('Contribution équilibre général (CEG) T1', 'Retraite', 'plafond', 0.86, 1.29),
    L('Retraite complémentaire Agirc-Arrco T2', 'Retraite', 't2', 8.64, 12.95),
    L('Contribution équilibre général (CEG) T2', 'Retraite', 't2', 1.08, 1.62),
    L('Famille — Allocations familiales', 'Famille', 'brut', 0, 3.45),
    L('Assurance chômage', 'Chômage', 'brut', 0, 4.05),
    L('CSG déductible', 'CSG/CRDS', 'csg', 6.80, 0),
    L('CSG/CRDS non déductible', 'CSG/CRDS', 'csg', 2.90, 0),
  ];
  if (isCadre) {
    lines.push(L('APEC (cadres)', 'Retraite', 'plafond', 0.024, 0.036));
    lines.push(L('CET — contribution équilibre technique', 'Retraite', 'brut', 0.14, 0.21));
    lines.push(L('Prévoyance cadre (1,50 % TA)', 'Prévoyance', 'plafond', 0, 1.50));
  }
  return lines;
}

// --- Maurice (MU) : CSG, NSF, Training Levy (HRDC). Taux 2025/2026, à vérifier (MRA). ---
// CSG : salarié 1,5 % (base <= seuil) ou 3 % ; employeur 3 % ou 6 %. Seuil usuel 50 000 Rs.
// NSF : salarié 1 % / employeur 2,5 %, sur salaire de base plafonné (plafond ~28 570 Rs, révisable).
// Training Levy (HRDC) : employeur 1,5 % du salaire de base.
function defaultContributionsMU(brut, opts) {
  opts = opts || {};
  const ceiling = Number(opts.nsfCeiling) || 28570;
  const threshold = Number(opts.csgThreshold) || 50000;
  const csgEmp = brut <= threshold ? 1.5 : 3;
  const csgEr = brut <= threshold ? 3 : 6;
  const nsfBase = Math.min(brut, ceiling);
  const L = (label, category, base, empRate, erRate) => ({
    label, category, baseType: 'custom', base: round(base),
    employeeRate: empRate, employeeAmount: round(base * empRate / 100),
    employerRate: erRate, employerAmount: round(base * erRate / 100),
  });
  return [
    L('CSG — Contribution Sociale Généralisée', 'CSG', brut, csgEmp, csgEr),
    L('NSF — National Savings Fund', 'NSF', nsfBase, 1, 2.5),
    L('Training Levy (HRDC)', 'Training Levy', brut, 0, 1.5),
  ];
}

// Totaux du bulletin.
function computeTotals(p) {
  const gains = (p.gains || []).reduce((s, g) => s + (Number(g.amount) || 0), 0);
  const brut = round((Number(p.baseSalary) || 0) + gains);
  let emp = 0, er = 0;
  for (const l of p.contributions || []) { emp += Number(l.employeeAmount) || 0; er += Number(l.employerAmount) || 0; }
  const totalEmployee = round(emp);
  const totalEmployer = round(er);
  const netBeforeTax = round(brut - totalEmployee);   // net à payer avant impôt (indicatif)
  const netSocial = netBeforeTax;                     // montant net social (indicatif)
  const taxRate = Number(p.taxRate) || 0;
  // Deux modes : 'rate' (taux × net avant impôt) ou 'amount' (montant calculé, ex. PAYE barème MRA).
  const taxAmount = p.taxMode === 'amount'
    ? round(Number(p.taxFixedAmount) || 0)
    : round(netBeforeTax * taxRate / 100);
  const reimb = Number(p.expenseReimbursement) || 0;     // remboursements de frais (non soumis)
  const netPaid = round(netBeforeTax - taxAmount + reimb);
  return {
    grossTotal: brut, totalEmployee, totalEmployer,
    netBeforeTax, netSocial, taxRate, taxAmount, netPaid,
    employerCost: round(brut + totalEmployer),
  };
}

// PAYE Maurice — barème annuel MRA (0 % ≤ 500k · 10 % 500k–1M · 20 % au-delà), appliqué aux
// émoluments annuels moins les abattements (EDF). Retenue mensuelle = impôt annuel / 12.
// Note : à Maurice, les cotisations (CSG/NSF) ne sont PAS déductibles de l'assiette PAYE.
function computePayeMU({ monthlyGross, monthsPerYear, reliefs, brackets }) {
  const { progressive, defaultBrackets } = require('./tax');
  const months = Number(monthsPerYear) > 0 ? Number(monthsPerYear) : 12;
  const annualEmoluments = round((Number(monthlyGross) || 0) * months);
  const annualReliefs = Math.max(0, Number(reliefs) || 0);
  const annualChargeable = Math.max(0, round(annualEmoluments - annualReliefs));
  const bands = (brackets && brackets.length) ? brackets : defaultBrackets('MU', 'employee');
  const annualTax = progressive(annualChargeable, bands);
  const monthlyTax = round(annualTax / 12);
  const effectiveRate = annualEmoluments > 0 ? round((annualTax / annualEmoluments) * 100) : 0;
  return { annualEmoluments, annualReliefs, annualChargeable, annualTax, monthlyTax, effectiveRate, brackets: bands };
}

module.exports = { PMSS_DEFAULT, bases, defaultContributions, defaultContributionsMU, computeTotals, computePayeMU, round };
