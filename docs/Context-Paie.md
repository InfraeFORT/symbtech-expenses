# Context-Paie.md — Fiches de paie (France & Maurice)

## Backend
- `lib/payroll.js` : `PMSS_DEFAULT=4005` ; `bases(brut,pmss)` (plafond T1, tranche 2 1→8 PMSS, assiette CSG abattement 1,75 % ≤ 4 PMSS) ; `defaultContributions(brut,pmss,isCadre)` (France) ; `defaultContributionsMU(brut,{nsfCeiling=28570,csgThreshold=50000})` (CSG 1,5/3 % sal · 3/6 % pat, NSF 1 %/2,5 % plafonné, Training Levy 1,5 % pat) ; `computeTotals(p)`.
- `models/Payslip.js` : country(FR/MU), currency, employer{name,siret,apeCode,address,urssafNumber,conventionCollective}, employee{...,isCadre}, month/périodes, baseSalary, workedHours, gains[], pmss/nsfCeiling/csgThreshold, contributions[], taxRate, expenseReimbursement, totaux, status(draft/finalized).
- `routes/payslips.js` : CRUD, `POST /payslips/default-contributions` (FR/MU), finalize, reopen. Monté `/payslips` (authRequired).

## Admin — `pages/Payslips.jsx`
- Éditeur pleine page : pays/devise, employeur (pré-rempli société + logo), salarié (depuis fournisseur personne physique/salarié), période, brut, gains ; cotisations éditables + « Générer le modèle FR/MU » ; net & impôt (taux PAYE/PAS).
- Impression : « Aperçu / Imprimer » → fenêtre dédiée, `@page A4`, logo en en-tête, bloc nets en bas (min-height ~255 mm → une page). Décocher « Print headers and footers ».

## Points d'attention
- Taux/plafonds indicatifs (URSSAF/BOSS, MRA), éditables. Net avant impôt / net social = brut − cotisations salariales (simplifié). PAYE MU saisi en taux.
