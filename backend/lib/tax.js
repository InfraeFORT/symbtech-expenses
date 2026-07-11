// lib/tax.js — calcul d'impôt progressif (indicatif, barèmes éditables).
// Barèmes 2025/2026 fournis comme point de départ : à vérifier (MRA — Maurice, DGFiP — France).

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Impôt progressif par tranches. brackets = [{ upTo: Number|null, rate: % }], trié par upTo (null = infini).
function progressive(base, brackets) {
  base = Math.max(0, Number(base) || 0);
  const sorted = [...(brackets || [])].sort((a, b) => (a.upTo == null ? Infinity : Number(a.upTo)) - (b.upTo == null ? Infinity : Number(b.upTo)));
  let tax = 0, prev = 0;
  for (const b of sorted) {
    const cap = b.upTo == null ? Infinity : Number(b.upTo);
    const slice = Math.max(0, Math.min(base, cap) - prev);
    tax += slice * (Number(b.rate) || 0) / 100;
    prev = cap;
    if (base <= cap) break;
  }
  return round(tax);
}

// Barèmes par défaut selon pays et type.
function defaultBrackets(country, kind) {
  if (kind === 'company') {
    if (country === 'MU') return [{ upTo: null, rate: 15 }]; // impôt sociétés Maurice (taux standard)
    return [{ upTo: 42500, rate: 15 }, { upTo: null, rate: 25 }]; // IS France (taux réduit PME puis 25 %)
  }
  // Impôt sur le revenu / PAYE (revenu imposable annuel)
  if (country === 'MU') return [{ upTo: 500000, rate: 0 }, { upTo: 1000000, rate: 10 }, { upTo: null, rate: 20 }];
  // Barème IR France (par part) — valeurs indicatives
  return [
    { upTo: 11497, rate: 0 },
    { upTo: 29315, rate: 11 },
    { upTo: 83823, rate: 30 },
    { upTo: 180294, rate: 41 },
    { upTo: null, rate: 45 },
  ];
}

// Totaux d'une simulation.
function computeSim(sim) {
  const lines = sim.lines || [];
  const sum = (pred) => lines.filter(pred).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const income = sum((l) => l.type === 'income');
  const charge = sum((l) => l.type === 'charge');
  const relief = sum((l) => l.type === 'relief');
  const base = round(income - charge - relief);
  const parts = (sim.kind === 'employee' && sim.country === 'FR' && Number(sim.parts) > 0) ? Number(sim.parts) : 1;
  const tax = parts > 1 ? round(parts * progressive(base / parts, sim.brackets)) : progressive(base, sim.brackets);
  // Fair Share Contribution (Maurice) : salarié 15 % si revenu net annuel > 12 M ; société 5 % si CA > 24 M.
  // Déclencheur : société -> chiffre d'affaires (produits) ; salarié -> revenu imposable (base). Appliquée à la base.
  let fairShare = 0;
  if (sim.fairShareEnabled) {
    const rate = Number(sim.fairShareRate) || 0;
    const thr = Number(sim.fairShareThreshold) || 0;
    const trigger = sim.kind === 'company' ? income : base;
    if (rate > 0 && trigger > thr) fairShare = round(base * rate / 100);
  }
  const totalTax = round(tax + fairShare);
  const effectiveRate = base > 0 ? round((totalTax / base) * 100) : 0;
  const withheld = Number(sim.withheld) || 0;
  const remaining = sim.kind === 'employee' ? round(totalTax - withheld) : totalTax;
  return { totalIncome: round(income), totalCharge: round(charge), totalRelief: round(relief), base, tax, fairShare, totalTax, effectiveRate, remaining };
}

// Réglages Fair Share par défaut (Maurice).
function defaultFairShare(country, kind) {
  if (country !== 'MU') return { enabled: false, threshold: 0, rate: 0 };
  return kind === 'company'
    ? { enabled: true, threshold: 24000000, rate: 5 }
    : { enabled: true, threshold: 12000000, rate: 15 };
}

module.exports = { round, progressive, defaultBrackets, defaultFairShare, computeSim };
