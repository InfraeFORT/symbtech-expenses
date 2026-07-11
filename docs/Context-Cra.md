# Feuille de temps (CRA) -> facture

Refonte du CRA en **feuille de temps mensuelle** (grille calendaire), inspirée des outils de portage.

## Backend
- `models/Cra.js` : `month` ("YYYY-MM"), `activities[]` = { label, category (production|absence|internal), clientRef, contractId, orderId/orderNumber, unit, unitPrice, vatRate, **days** (Mixed : { "1":1, "20":0.5 }) }. Totaux : subtotal/vatTotal/total (production seule), productionDays/absenceDays/internalDays, quantityTotal.
- `routes/cra.js` (`/cra`, authRequired) :
  - `dayTotal(days)`, `computeTotals(activities)` (production -> facturable ; absence/interne comptés en jours), `applyBody` (+ `markModified('activities')` pour le Mixed).
  - CRUD ; workflow `submit` (draft->submitted, exige quantityTotal>0), `approve`/`reject` ({note}), `reopen` (->draft).
  - `POST /:id/invoice` (approved -> facture brouillon depuis les activités **production** : 1 ligne/activité, qté = somme des jours, P.U./TVA ; mentions contrat+avenants ; status->invoiced). Idempotent.

## Admin — `pages/Cra.jsx` (nav « Comptes rendus »)
- Liste (période, intervenant, client, jours prod., total TTC, statut).
- Vue feuille pleine page : en-tête « Mois Année — Intervenant » + « Feuille de temps · société · client ».
  - Bandeau brouillon : société, client, contrat (mentions), commande, intervenant, mois (input month), référence, devise.
  - **Grille** : entêtes semaines ISO (S14…) + jours abrégés + numéros ; week-ends grisés. Lignes : Total attendu (jours ouvrés), activités (badge catégorie + libellé + total jours ; cellules `<input>` 0/0,5/1 par jour en brouillon), Total réalisé.
  - **+ Activité** -> modale (catégorie ; libellé ; réf/projet ; si production : catalogue, unité, P.U., TVA, commande).
  - Récap 3 boîtes **Production / Absence / Interne** + total jours chacune. Synthèse facturable HT/TVA/TTC.
  - Workflow : Enregistrer -> Soumettre -> Approuver/Refuser -> Générer la facture.
- Styles `ts-*` dans theme.css (grille, week-end, badges catégorie, boîtes récap).
- api.js : listCras/getCra/createCra/updateCra/submitCra/approveCra/rejectCra/reopenCra/invoiceCra/deleteCra (inchangé).

## Contrôles de cohérence
- Une journée ne peut pas dépasser **1 j cumulé** (toutes activités confondues) ; une cellule reste entre 0 et 1.
- Admin : cellules fautives surlignées en rouge, ligne Total réalisé surlignée sur les jours en dépassement, bandeau d'alerte listant les incohérences, **Soumettre bloqué** tant qu'il en reste.
- Serveur : `coherenceIssues(activities)` recalcule le cumul par jour ; `POST /:id/submit` renvoie 400 si dépassement (défense en profondeur).
