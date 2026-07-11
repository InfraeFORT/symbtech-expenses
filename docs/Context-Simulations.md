# Context-Simulations.md — Simulations d'impôt (salarié & société)

## Backend
- `lib/tax.js` : `progressive(base,brackets)` (tranches marginales) ; `defaultBrackets(country,kind)` (MU salarié 0/10/20 seuils 500k/1M ; MU société 15 % ; FR salarié barème IR ; FR société 15 % ≤ 42 500 puis 25 %) ; `defaultFairShare(country,kind)` (MU salarié 15 % > 12 M ; MU société 5 % > 24 M) ; `computeSim(sim)`.
- `models/Simulation.js` : kind(employee/company), title, country, company, person, supplierId, currency, fiscalYearLabel, periodFrom/To, notes, lines[{label,type,nature,amount,note}], brackets[], parts, withheld, fairShare(Enabled/Threshold/Rate), totaux, status.
- `routes/simulations.js` : CRUD, `POST /defaults`, `POST /prefill` (salarié : bulletins + PAYE retenu + prévision contrat ; société : CA facturé, charges, contrats clients proratisés, masse salariale). Monté `/simulations`.

## Admin — `pages/Simulations.jsx`
- Composant paramétré par `kind`. En-tête sauvegardable ; période auto `autoPeriod` (FR année civile, MU 1er juillet→30 juin), dates modifiables ; « Pré-remplir depuis le réel » ; lignes éditables ; barème éditable ; bloc Fair Share ; quotient familial (FR salarié) ; impôt déjà retenu.
- Récap : base, impôt barème, Fair Share, impôt total, taux effectif, reste à payer.

## Points d'attention
- Barèmes / Fair Share indicatifs (MRA / DGFiP), éditables. Base = brut (renseigner les abattements EDF). Masse salariale = tous les salariés (pas de rattachement société encore).
