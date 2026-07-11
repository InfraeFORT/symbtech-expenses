# Comptabilité — Grand Livre & rapports (en construction)

## Étape 1 — Normes comptables par société (FAIT)
- `Company.accountingStandards: [String]` — plusieurs normes possibles par société.
- `lib/accounting.js` : catalogue `STANDARDS` (IFRS, IFRS_SME, PCG) + `suggestedFor(country)` :
  - France → PCG, IFRS ; Maurice → IFRS, IFRS_SME ; Afrique du Sud → IFRS, IFRS_SME ; inconnu → IFRS.
- `GET /accounting/standards?country=` → `{ standards, suggested }` (monté sous `/accounting`, authRequired).
- Admin (Sociétés) : sélecteur à cases à cocher + bouton « Proposer (pays) » qui pré-coche les normes du pays. Catalogue source unique côté backend.

## Étape 2 — Grand Livre brouillon, PARTIE DOUBLE (FAIT)
Objectif : agréger en lignes d'écritures les **dépenses/notes de frais**, **factures** et **charges issues des relevés bancaires**, par société et par norme, sur une période.
Implémentation (partie double : Σ débits = Σ crédits par pièce) :
- Modèle `LedgerEntry` matérialisé (régénérable) : `{ company, standard, date, account{code,label}, counterAccount, label, debit, credit, source{type:'expense'|'invoice'|'bank', id, snapshot}, status:'included'|'rejected' }`.
- Génération idempotente par clé `(company, standard, source.type, source.id)` : un rafraîchissement conserve les décisions manuelles (lignes rejetées).
- Chaque ligne porte sa **provenance** + un **détail** consultable (document source) ; on peut la **rejeter** (exclue des totaux) ou la **restaurer**.
- Mapping vers le plan de comptes selon la norme (PCG : 6xx charges / 7xx produits / 44 TVA / 401-411 tiers / 512 banque ; IFRS : comptes descriptifs). Table de correspondance type de dépense → compte.
- Rapports (étape 3) : balance (débit/crédit par compte) + synthèse Résultat (produits − charges), calculés sur les lignes non rejetées.


### Détail technique (étape 2 livrée)
- `models/LedgerEntry.js` : un *leg* par ligne ; `pieceRef = sourceKey = company|standard|type|id` regroupe les legs d'une opération. Champs : account{code,label,type}, debit, credit, currency, label, source{type,id,snapshot}, status.
- `lib/ledger.js` : plan de comptes par famille (`PCG` numéroté / `IFRS` descriptif, IFRS_SME→IFRS). Constructeurs équilibrés :
  - Dépense : D 6xx (HT) + D 44566 (TVA) / C 512 (TTC).
  - Facture : D 411 (TTC) / C 706 (HT) + C 44571 (TVA).
  - Banque : compte de nature (627 frais, 641 salaire, 635 taxe, 580 vir. interne, 471 attente) ↔ 512 selon le sens. Les lignes bancaires **déjà rapprochées à une dépense sont exclues** (anti-double-comptage).
  - `expenseAccount(type)` : mapping par mots-clés (resto→6256, transport→6251, logiciel→6068, télécom→626, honoraires→622…), défaut 606.
  - `generate()` idempotent : delete+insert sur la période, statuts conservés par sourceKey.
- `routes/ledger.js` (sous `/ledger`) : `POST /generate`, `GET /` (legs + totaux débit/crédit), `GET /:id` (pièce + provenance), `POST /reject` & `/restore` (par sourceKey, toute la pièce), `GET /reports/summary` (balance par compte + Résultat produits−charges + contrôle équilibre).
- Admin `pages/Ledger.jsx` : société + norme (issue des normes de la société) + période → « Générer le brouillon ». Onglet **Écritures** (pièces groupées, badge provenance Dépense/Facture/Banque, détail, Rejeter/Restaurer, total débit=crédit). Onglet **Balance & Résultat** (synthèse + balance par compte). Nav « Grand Livre ».

### Reste possible (étape 3)
Édition manuelle du compte d'une ligne (reclassement depuis 471 attente), export (CSV/PDF), comparaison multi-normes côte à côte, gestion des devises (conversion).

### Imputation par libellé + cycle de tiers (révision)
- `classifyKey(label)` impute chaque ligne bancaire d'après le libellé : transport (GARE/ORLY/AIR AUSTRAL), carburant (SHELL/ENGEN), achats (SUPER U/INTERMART), réceptions (MC DONALD/restaurants), médical (C CARE/clinic), télécom (EMTEL), logiciels (Dropbox), loyer (rent/BEEZADHUR), salaires (salary/director fees), taxes (MRA/government), frais bancaires (Charge/Subs Fee), intérêts (Penalty/Debit Interest), virements internes (inter acc trf), personnel/école (school/vitiere → compte courant associé 455). Défaut → 471 attente. La catégorie choisie au rapprochement reste prioritaire.
- **Cycle à 4 écritures** via compte de tiers : un achat = D charge(P&L) / C fournisseur (engagement) puis D fournisseur / C banque (règlement) — le tiers se solde à zéro. Tiers selon la nature : fournisseur 401 (achats), personnel 421 (salaires), état 447 (taxes), client 411 (ventes). Frais bancaires, intérêts et virements internes restent en 2 écritures directes (pas de facture tierce).
- Dépense saisie : D charge (+TVA déductible) / C 401 puis D 401 / C 512. Facture : D 411 / C 706 (+TVA collectée) ; si `paid`, ajoute D 512 / C 411.
- Toutes les pièces restent équilibrées (Σ débits = Σ crédits).

### Enregistrement, rafraîchissement & compteur (brouillon)
- `models/LedgerDraft.js` : un brouillon enregistré par (société, norme, période) avec `generatedAt`, `refreshedAt`, `savedAt`.
- `lib/ledger.js` : `generate` (reconstruction complète, conserve les rejets), `refresh` (ajout incrémental des seules nouvelles pièces, préserve l'existant), `pending` (compte les opérations sources non encore intégrées).
- Routes : `POST /ledger/refresh`, `POST /ledger/save` (horodatage), `GET /ledger/status` (brouillon + compteur `{total,expense,invoice,bank}` + nb d'écritures). `/status` déclaré AVANT `/:id` (sinon capturé).
- Admin : 3 boutons — **Générer** (complet), **Rafraîchir (N)** (incrémental, badge = nb à intégrer, désactivé si 0), **Enregistrer**. Bandeau : « N nouvelle(s) opération(s) à intégrer pour l'exercice (x dépenses · y factures · z banque) » ou « à jour », + « Enregistré le … ». Compteur recalculé à chaque changement de période.
