# Import d'historique de factures FOURNISSEURS (achats → charges)

Pendant de l'import ventes, côté achats : les factures fournisseurs deviennent des **charges** (Expense), avec rattachement à un compte fournisseur et déduplication par n° de facture.

## Backend
- `models/Expense.js` : + `supplierId`, `invoiceNumber`, `dueDate`, `subtotal` (HT). amount = TTC, vat = TVA.
- `lib/dococr.js` : `extractSupplierInvoice(buffers)` (vision) → { supplierName, invoiceNumber, date, dueDate, currency, subtotal, vatTotal, total, category, confidence, notes }. Exporté.
- `routes/expenses.js` :
  - `POST /expenses/supplier-ocr` (multipart 'file') → { data, raw, usage }.
  - `POST /expenses/import-supplier-invoices` body { company, supplierId?, items[] }. Dédup `sha1(company|supplier|invoiceNumber)`, rattachement supplierId (défaut ou match par nom), création de charges (type='Facture fournisseur', source='import'). Renvoie { inserted, skipped, batch, errors }.

## Admin — `pages/Charges.jsx`
- Bouton **« Importer des factures fournisseurs »** → `SupplierImportModal` (société + fournisseur par défaut optionnel), deux onglets :
  - **Récap Excel/CSV** : mappage (n°, date, fournisseur, devise, HT, TVA, TTC), séparateur décimal, aperçu, import en lot.
  - **PDF (OCR)** : upload → spinner → champs pré-remplis éditables → « Ajouter à la liste » → import.
- api.js : `importSupplierInvoices`, `ocrSupplierInvoice`.
- Les charges importées apparaissent dans la liste Charges et alimentent le Grand Livre (compte fournisseur via classification existante).
