# Devis (sales quotes)

## Backend
- `models/Quote.js` : décalque Invoice. Statut `draft|sent|accepted|rejected|converted` ; `validUntil` (au lieu de dueDate) ; `terms` (au lieu de paymentTerms) ; `convertedInvoiceId`. `number` null jusqu'à l'émission.
- `routes/quotes.js` (monté `/quotes`, authRequired) : CRUD, `computeTotals`, `applyBody`.
  - `POST /:id/issue` → numéro `{CODE}-DEV-{ANNÉE}-{SEQ4}`, statut `sent`.
  - `POST /:id/status` → `sent|accepted|rejected` (draft→409, converted→409).
  - `POST /:id/convert` → crée une **facture brouillon** (issuer/client/lines/devise/notes copiés), passe le devis en `converted` + `convertedInvoiceId`. Idempotent si déjà converti.
  - `DELETE /:id`.

## Admin — `pages/Devis.jsx` (nav « Devis »)
- Liste + éditeur de lignes (société/client → snapshot figé, lignes avec totaux live, TVA par ligne).
- **Émettre** (numéro + verrouillage), statuts **Accepté / Refusé**, **Convertir en facture** (quand émis/accepté).
- Vue imprimable « DEVIS » (window.print → PDF), réutilise les styles `.invoice-print`.
- api.js : listQuotes, getQuote, createQuote, updateQuote, issueQuote, setQuoteStatus, convertQuote, deleteQuote.
