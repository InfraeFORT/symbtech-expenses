# Context-Bank — relevés bancaires & rapprochement

## Modèle (backend)
`BankTransaction` : company, account, date (YYYY-MM-DD), label, amount (signé : + crédit / − débit), currency, balance?, externalRef?, dedupKey (sha1 company|account|date|label|amount), importBatch, source, **reconciled**, **matchedExpenseId** (réservés au rapprochement).

## Routes `/bank` (JWT)
- `POST /bank/transactions/bulk` — `{company, account, source, allowDuplicates, transactions:[{date,label,amount,currency,balance,externalRef}]}` → insert + dédup (par dedupKey, intra-lot et vs base) → `{imported, skipped, batch}`.
- `GET /bank/transactions?company=&account=&reconciled=&from=&to=&q=&limit=&skip=`
- `GET /bank/imports` — lots d'import (agrégat) pour suppression.
- `DELETE /bank/transactions/:id` · `DELETE /bank/imports/:batch`.
- `POST /bank/parse` (multipart `file`, PDF/image) — extraction IA des opérations via `lib/bankocr.js` (Claude vision). **Les PDF sont découpés en paquets de 4 pages** (`pdf-lib`) analysés en parallèle puis recollés — indispensable pour les relevés longs (sinon la sortie JSON est tronquée). Réglages : `BANK_OCR_PAGES_PER_CHUNK`, `BANK_OCR_MAX_TOKENS`. Renvoie `{transactions}` ; n'écrit pas en base (l'import passe par `/transactions/bulk`).

## Admin (page Banque)
Import **CSV** (PapaParse) et **Excel** (SheetJS) côté navigateur avec mappage de colonnes ; **PDF/scan** envoyé à `/bank/parse` → extraction IA → aperçu direct (pas de mappage) : choix société (+ *Autre…*) ; le **compte** est proposé depuis les comptes bancaires enregistrés de la société sélectionnée (+ *Autre…* pour saisie libre), upload, **mappage de colonnes** (date, libellé, montant en colonne signée OU débit/crédit séparés, séparateur décimal, devise, solde), aperçu (lignes valides), puis envoi en lot JSON. Tableau des lignes filtrable (société, état rapproché), suppression unitaire. Parsing robuste : montants `1 234,56` / `1,234.56` / `(123)` ; dates `YYYY-MM-DD`, `JJ/MM/AAAA`, `JJ.MM.AAAA`, années sur 2 chiffres.

## Rapprochement — opérationnel
`BankTransaction` enrichi : `reconcileType` ('expense'|'internal'), `matchedExpenseId`, `reconcileCategory`, `matchedLabel`, `reconciledAt`.
Routes : `GET /bank/transactions/:id/matches` (dépenses candidates classées : score = montant exact 60 / proche 30, + proximité date, + devise ; exclut les dépenses déjà liées), `POST …/reconcile` `{expenseId}` ou `{category}`, `POST …/unreconcile`, `GET /bank/internal-categories`.
Admin : clic sur une ligne → modale. Si non rapprochée : liste des dépenses suggérées (badges montant exact/≈, écart de jours, devise) + boutons d'**écritures internes** (Virement interne, Salaire, Frais bancaires, Taxes, Remboursement, Autre). Si rapprochée : libellé + « Annuler le rapprochement ». La colonne Rappr. affiche ✓ + libellé.
