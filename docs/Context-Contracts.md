# Contrats client (référentiel) — Phase 1

## Backend
- Modèles : `Contract` (client, société, référence, intitulé, objet, dates, devise, valeur, conditions, **mentions** à reporter sur factures, préavis, statut, documents[], ocrRaw), `Avenant` (contractId, version, date, objet, résumé, valeur, mentions, documents[]), `Order` (contractId, client, n°, date, description, montant, mentions, statut, documents[]).
- `lib/dococr.js` : `extractContract` / `extractOrder` via vision Claude (réutilise `buildMediaBlock`), renvoie les champs clés.
- `routes/referentials.js` (factory `crudRouter` étendu) :
  - option `attachments` → documents nommés multiples (upload S3, label, kind) — réutilise le composant Attachments.
  - option `ocr` → `POST /:resource/ocr` (multipart `file`) renvoie `{ data, raw, usage }`.
  - filtres passthrough `?contract=` / `?client=` ; `?all=1` pour inclure inactifs ; tri configurable.
  - Référentiels exposés : `/contracts`, `/avenants`, `/orders` (montés authRequired dans server.js).

## Admin — `pages/Contrats.jsx` (nav « Contrats »)
- Vue maître-détail : liste des contrats → fiche.
- Fiche contrat : bouton **OCR** (pré-remplit), formulaire, **Documents** (Attachments), section **Avenants** (versionning) et section **Commandes** (chacune : OCR ou saisie manuelle + documents nommés).
- api.js : listContracts/createContract/updateContract/deleteContract, idem avenants & orders, `ocrDocument(resource, file)`.

## Phase 2 (fait) — facture rattachée à une commande
- `Order.lines[]` (description, quantité, P.U., TVA) : éditeur de lignes + sélecteur catalogue dans la fiche commande ; le montant se calcule depuis les lignes.
- `GET /orders/:id/prefill` : agrège les mentions du contrat + de ses avenants + de la commande, et renvoie les lignes, le client, la devise.
- `Invoice` : champs `orderId`, `orderNumber`, `contractId`, `mentions`. L'éditeur de facture propose un sélecteur Commande qui reprend lignes + mentions + client ; un champ Mentions reste éditable.
- Vue imprimable : numéro de facture, adresse de facturation (bloc client), numéro de commande, bloc Mentions obligatoires, et lignes reprises de la commande.
