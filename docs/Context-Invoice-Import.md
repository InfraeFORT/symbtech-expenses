# Import d'historique de factures de VENTE

Archivage des factures de vente passées (déjà émises) : créées avec leur **numéro d'origine** et le statut **issued|paid**, sans repasser par la numérotation auto.

## Backend
- `models/Invoice.js` : + `source` ('import'), `importBatch`, `dedupKey` (+ index). Le reste inchangé (number/issuer/client snapshot/lines/totaux/mentions).
- `lib/dococr.js` : `extractInvoice(buffers)` (vision Claude Sonnet) → { number, date, dueDate, clientName, issuerName, currency, lines[], subtotal, vatTotal, total, paymentTerms, mentions, confidence, notes }. Exporté.
- `routes/invoices.js` :
  - `POST /invoices/ocr` (multipart 'file') → { data, raw, usage }.
  - `POST /invoices/import` body { issuerCompany, status, items[] }. Pour chaque item : dédup `dedupKey = sha1(issuerCompany|number)` (doublon ignoré), snapshot émetteur depuis Company, rapprochement clientId par nom, totaux recalculés si lignes fournies sinon repris du récap (TTC seul → HT=TTC). source='import', importBatch. Renvoie { inserted, skipped, batch, errors }.

## Admin — `pages/Invoices.jsx`
- Bouton **« Importer l'historique »** → `ImportModal` (société émettrice + statut), deux onglets :
  - **Récap Excel/CSV** : upload (PapaParse/SheetJS), mappage colonnes (n°, date, client, devise, HT, TVA, TTC), séparateur décimal, aperçu, import en lot.
  - **PDF (OCR)** : upload facture → spinner → champs pré-remplis éditables (n°, date, client, devise, HT, TTC) → « Ajouter à la liste » (cumul) → import.
- api.js : `importInvoices`, `ocrInvoice`.
- Dédoublonnage : réimporter le même n° (même émetteur) est ignoré.

## Gestion de la liste Factures (slice 21A)
- Filtre par **société émettrice** (déroulant) + filtres colonne (numéro, client, statut) + **tri** par colonne (clic sur l'en-tête).
- **Sélection multiple** (cases à cocher + tout sélectionner) → **suppression en lot** (`POST /invoices/bulk-delete`) ou **export** XLSX (sélection ou vue filtrée).
- **Édition des factures importées** : `source==='import'` reste modifiable même émise (PATCH autorisé) ; l'éditeur déverrouille champs + lignes, bouton Enregistrer. (Les factures émises non importées restent verrouillées.)
- À venir (slice 21B) : champs supplémentaires (CRA, devis, jours, frais, réalisé par, tax impact, interco + société destinataire, no cash, montant payé).

## Informations complémentaires (slice 21B)
- `models/Invoice.js` : + craId/craLabel, quoteId/quoteNumber, prestationDays, expenseReimbursement, performedById/performedBy, taxImpact (Bool), interco (Bool) + intercoCompany, noCash (Bool), amountPaid.
- `routes/invoices.js` : `POST /invoices/:id/meta` met à jour ces champs **quel que soit le statut** (infos de gestion, sans toucher au contenu légal). Si craId fourni, `prestationDays` alimenté depuis `Cra.productionDays` (et craLabel déduit). interco=false vide intercoCompany. applyBody inclut aussi ces champs pour les brouillons.
- Admin `pages/Invoices.jsx` : section « Informations complémentaires » dans l'éditeur (toujours active, bouton « Enregistrer les infos » → saveInvoiceMeta) : rattacher CRA (auto-jours) + devis, jours de prestation, remboursement de frais, réalisé par (fournisseur), tax impact, no cash, interco + société destinataire, montant encaissé. api.js : saveInvoiceMeta.

## Filtres toutes colonnes + édition import robuste (slice 21C)
- Liste : filtre **texte + liste déroulante** (datalist alimentée par le contenu de la colonne) sur **toutes** les colonnes (numéro, émetteur, client, date, total, statut). Suggestions calculées sur la société filtrée.
- Édition import : le **numéro** est éditable (importées) ; quand une facture n'a **pas de lignes** (récap), les **totaux HT/TVA/TTC sont saisissables** dans l'éditeur. Correctif backend : `applyBody` ne recalcule les totaux depuis les lignes que s'il y en a, sinon conserve/accepte les totaux fournis (évite de remettre à 0 un récap importé à l'enregistrement). Impression : totaux stockés utilisés si pas de lignes.
