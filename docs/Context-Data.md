# Context-Data — symbtech-expenses

> Domaine : base Mongo dédiée, schéma `expenses`, mapping des champs PowerApps, référentiels.
> Voir aussi : `Context-Backend.md`, `Context-OCR.md`.
> Dernière mise à jour : 25 juin 2026.

---

## 1. Base de données

Base **dédiée** `symbtech-expenses` (décision D2 : séparée d'e-FORT au niveau base). Collection principale : `expenses`.

---

## 2. Schéma `expenses` (proposé)

```
_id,  // identifiant Mongo (pas de expenseId séparé)
createdBy,        // qui a saisi
expenseFor,       // personne concernée (« Expense for »)

title, date, type,
amount, vat, currency,

company,          // société émettrice
paymentMethod,    // moyen de paiement
proOrPerso,       // 'pro' | 'perso'
taxImpact,        // bool (Tax_Impact)
refactTo,         // entité de refacturation, ou null

s3Keys,           // tableau : 1..n pages, bucket dédié expenses/
ocrRaw,           // JSON brut renvoyé par Claude (audit)
ocrConfidence,    // 0–1
validatedByHuman, // bool — false tant que non relu

createdAt, updatedAt
```

### Index suggérés
`company+date`, `expenseFor+date`, `type+date`, `currency`, `validatedByHuman`.

---

## 3. Mapping PowerApps → modèle

Relevé sur les écrans existants. Colonne **Source** = d'où vient la valeur.

| Champ PowerApps | Champ modèle | Source |
|---|---|---|
| Title | `title` | **OCR** (corrigeable) |
| Date of the Expense | `date` | **OCR** (corrigeable) |
| Expense for | `expenseFor` | choix métier |
| Type of Expense | `type` | **OCR** (suggestion) + choix |
| Payment Method | `paymentMethod` | choix métier |
| Pro or Perso | `proOrPerso` | choix métier |
| Tax_Impact | `taxImpact` | choix métier |
| Company | `company` | choix métier |
| Currency | `currency` | **OCR** (corrigeable) |
| Amount | `amount` | **OCR** (corrigeable) |
| VAT | `vat` | **OCR** (corrigeable) |
| Refact / Refact to | `refactTo` | choix métier (case + entité) |
| Photo(s) | `s3Keys` (tableau) | upload S3 |
| — | `ocrRaw`, `ocrConfidence`, `validatedByHuman` | système |

> L'OCR pré-remplit 6 champs ; les autres sont des décisions de gestion. Cf. `Context-OCR.md`.

---

## 4. Référentiels (à confirmer / compléter)

Valeurs observées sur les captures — à figer dans des listes de référence (collections `ref_*` ou enums) :

- **Types** : Hotel, Restaurant, Plane, Office rental, Communication, Small equipment.
- **Sociétés / entités** : Symbtech ZA (Pty) Ltd, … (FR, autres — **à compléter**).
- **Devises** : EUR, MUR, ZAR, … (ISO 4217).
- **Moyens de paiement** : Personal Card N26 JVI, Personal Card Amex JVI, … (**à compléter**).
- **Entités de refacturation** : Symbtech ZA (Pty) Ltd, … (**à compléter**).
- **Pro/Perso** : pro | perso.

> Ces référentiels alimenteront les menus déroulants de l'app mobile (cf. `Context-Mobile.md`).

---

## 5. Points ouverts

- Conserver l'`ocrRaw` indéfiniment (audit) ou purger après validation ?
- Multi-utilisateurs : `createdBy` / `expenseFor` distincts dès le départ, ou usage mono-utilisateur (Joffrey) au début ?
- Taux/converion de change : stocke-t-on un montant converti dans une devise de référence pour l'export, ou la devise d'origine seule ?


## Référentiels élargis (26 juin 2026)
- **Devises** : liste complète ISO 4217 (179) dans `mobile/src/config.js` ({value,label}), sélecteur cherchable. OCR accepte tout code ISO.
- **Types** : élargis (26) pour le rapprochement comptable, alignés mobile (`config.js`) ↔ backend (`lib/ocr.js`, surchargeable via env `EXPENSE_TYPES`). À mapper sur le plan comptable avec l'expert-comptable.


## Collections Référentiels (26 juin 2026)

**`companies`** (nos sociétés) : name, code, address1/2, postalCode, city, country, regNumber, vatNumber, `bankAccounts[]` {bankName, swift, iban, accountNumber, currency}, `paymentMethods[]` {name, type, bankIban}, active. Seedé depuis les données réelles (3 sociétés : Symbtech ZA, Symbtech HC Ltd, Symbiose Software & Solutions).

**`clients`** (tiers) : name, onBehalfOf, `contacts[]` {name, role, email, phone}, adresse, regNumber, vatNumber, active. Seedé (8 clients).

Lecture : `GET /companies`, `GET /clients` (auth). CRUD complet = appli d'admin (à venir). Seed : `npm run seed-ref` (idempotent, upsert par code/name).

Côté app Expenses : Société et « Refacturer » (= sociétés + clients) viennent de ces endpoints ; moyens de paiement = ceux de la société + repli `PAYMENT_METHODS`.


## Ajout — Note de frais
- **Expense** : `isExpenseReport` (bool) + `person` (string = nom de la personne physique).
- **Supplier** : `isIndividual` (bool) — un fournisseur peut être une personne physique ; ces fournisseurs alimentent le champ « Personne » des notes de frais.


## Pièces jointes — opérationnel
`Client.attachments[]` et `Supplier.attachments[]` (`{kind,label,s3Key,date}`) alimentés via les routes `/:resource/:id/attachments` (upload S3). Consultation par URL signée temporaire.
