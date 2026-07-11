// lib/accounting.js — normes comptables : catalogue + suggestion par pays.
// Sert de source unique : la sélection sur la Société et (plus tard) le moteur
// de Grand Livre s'appuient sur le même référentiel de normes.

const STANDARDS = [
  { code: 'IFRS', label: 'IFRS (normes internationales)' },
  { code: 'IFRS_SME', label: 'IFRS for SMEs (PME)' },
  { code: 'PCG', label: 'Plan Comptable Général (France)' },
];

const STANDARD_CODES = new Set(STANDARDS.map((s) => s.code));

// Normalise un pays saisi librement → code ISO grossier.
function countryCode(country) {
  const c = (country || '').toLowerCase();
  if (/(france|\bfr\b|paris|français|francaise)/.test(c)) return 'FR';
  if (/(maurice|mauritius|\bmu\b)/.test(c)) return 'MU';
  if (/(afrique du sud|south africa|\bza\b|hout bay|cape town)/.test(c)) return 'ZA';
  return null;
}

const SUGGESTED = {
  FR: ['PCG', 'IFRS'],
  MU: ['IFRS', 'IFRS_SME'],
  ZA: ['IFRS', 'IFRS_SME'],
};

// Normes proposées pour un pays ; repli sur IFRS si pays inconnu.
function suggestedFor(country) {
  const cc = countryCode(country);
  return (cc && SUGGESTED[cc]) || ['IFRS'];
}

module.exports = { STANDARDS, STANDARD_CODES, countryCode, suggestedFor };
