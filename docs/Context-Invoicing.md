# Facturation (factures sortantes)

## Modèle — `models/Invoice.js`
Facture émise par une société Symbtech à un client.
- `number` (null tant que brouillon ; assigné à l'émission), `status` : draft → issued → paid | cancelled.
- `issuerCompany` (nom) + `issuer` (snapshot figé : nom, code, adresse, regNumber, vatNumber, bankAccounts[]).
- `clientId` + `client` (snapshot : nom, adresse, vatNumber…).
- `date`, `dueDate`, `currency` (défaut EUR).
- `lines[]` : `{ description, quantity, unitPrice, vatRate(%) }`.
- `subtotal`, `vatTotal`, `total` (recalculés serveur à chaque écriture).
- `notes`, `paymentTerms`.

## Routes — `routes/invoices.js` (montées sous `/invoices`, authRequired)
- `GET /invoices?status=&issuer=&q=` · `GET /invoices/:id`
- `POST /invoices` (crée un brouillon) · `PATCH /invoices/:id` (brouillon uniquement, sinon 409)
- `POST /invoices/:id/issue` : assigne `{CODE}-{ANNÉE}-{SEQ4}` (CODE = code/nom société épuré ; SEQ = max existant +1 pour ce préfixe), passe en `issued`.
- `POST /invoices/:id/status` : `{ issued | paid | cancelled }` (brouillon → 409).
- `DELETE /invoices/:id`.
`computeTotals(lines)` arrondit au centime ; HT = qty×PU, TVA par ligne.

## Admin — `src/pages/Invoices.jsx`
- Liste (numéro, émetteur, client, date, total, statut). Clic → éditeur.
- Éditeur (modale) : société émettrice + client (selects depuis référentiels → snapshot copié dans la facture), date/échéance (+30 j par défaut)/devise, lignes répétables avec totaux en direct (sous-total HT, TVA, total TTC), conditions de paiement, notes. « Enregistrer » puis « Émettre ». Une fois émise, formulaire verrouillé ; actions « Marquer payée » / « Annuler la facture ».
- **Vue imprimable** (`InvoicePrint`) : mise en page A4 (en-tête émetteur, FACTURE + numéro, « Facturé à », tableau des lignes, totaux, coordonnées bancaires de l'émetteur). Bouton « Imprimer / Enregistrer en PDF » → `window.print()`. CSS `@media print` masque l'app et n'imprime que la facture. Pas de dépendance PDF serveur.

## Défauts (ajustables)
Numéro `{CODE}-{ANNÉE}-{NNNN}` par entité et par an ; devise EUR ; TVA par ligne (0 % par défaut) ; échéance +30 j ; numéro attribué à l'émission (les brouillons ne consomment pas de numéro).
