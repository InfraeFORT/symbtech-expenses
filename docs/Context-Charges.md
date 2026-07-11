# Import de charges (Excel / CSV)

## Backend
- `Expense` : champs ajoutés `source` ('manual'|'mobile'|'import'), `importBatch`, `dedupKey` (indexé).
- `POST /expenses/bulk` (JSON `{ company, items:[{title,merchant,date,type,amount,vat,currency,paymentMethod,...}] }`) :
  - calcule `dedupKey = sha1(company|date|merchant|amount|type)`, ignore les doublons (déjà en base ou dans le lot),
  - insère le reste avec `source:'import'`, `importBatch`. Retourne `{ inserted, skipped, batch }`.
- `GET /expenses?company=&type=&from=&to=&q=&limit=` (déjà existant) pour la liste.

## Admin — `pages/Charges.jsx` (nav « Charges »)
- Société + fichier CSV/Excel. Parsing : PapaParse (CSV) / SheetJS (Excel, 1re feuille).
- Mappage de colonnes (auto-deviné) : date, libellé/fournisseur, montant, TVA (opt.), devise (opt.), type (opt.) ; séparateur décimal FR/EN.
- Aperçu (8 lignes) puis import en masse → crée des `Expense` (source 'import').
- Liste des charges de la société (date, libellé, type, montant, source) avec suppression.
- Les charges importées alimentent directement le **Grand Livre** (imputées par type/libellé) et le **rapprochement** bancaire.
