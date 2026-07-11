# symbtech-expenses — Documentation Projet

> **Vivant.** Mise à jour progressive au fil des sessions de travail, dans l'esprit du `PROJECT.md` d'e-FORT.
> **Dernière mise à jour** : 26 juin 2026 — backend complet (OCR image/PDF/multi-pages + CRUD + S3 + Mongo + auth JWT) validé en réel ; app mobile v1 (login, liste, ajout OCR, détail/édition) sur simulateur iOS.
> **Maintenu par** : Claude (assistant) + Joffrey (Symbtech)

---

## Sommaire

**[Partie I — Référence technique](#partie-i--référence-technique)**
1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture & séparation d'e-FORT](#2-architecture--séparation-defort)
3. [Stack & déploiement](#3-stack--déploiement)
4. [Structure du dépôt](#4-structure-du-dépôt)
5. [Fichiers de contexte par domaine](#5-fichiers-de-contexte-par-domaine)

**[Partie II — Documentation fonctionnelle](#partie-ii--documentation-fonctionnelle)**
6. [Le produit & le parcours utilisateur](#6-le-produit--le-parcours-utilisateur)
7. [Origine : le PowerApps à industrialiser](#7-origine--le-powerapps-à-industrialiser)
8. [Décisions architecturales](#8-décisions-architecturales)
9. [Roadmap & chantiers](#9-roadmap--chantiers)
10. [Glossaire](#10-glossaire)

---

# Partie I — Référence technique

## 1. Vue d'ensemble

### 1.1 Mission

**symbtech-expenses** industrialise, hors PowerApps, le système maison de **capture et d'enregistrement de justificatifs de dépenses** : une **app mobile** photographie un ticket/facture, un **OCR par vision Claude** en extrait les champs structurés, l'utilisateur valide, et la dépense est enregistrée (multi-sociétés, multi-devises, avec TVA et refacturation).

C'est le **premier système** de l'umbrella `symbtech-systems`, destinée à regrouper les outils internes de gestion de Symbtech (distincts du produit grand public e-FORT).

### 1.2 Périmètre

Dans le périmètre : capture photo, OCR/extraction, formulaire de saisie pré-rempli, liste/recherche des dépenses, stockage des justificatifs, persistance, export comptable.

Hors périmètre (pour l'instant) : rapprochement bancaire automatique, intégration directe à un logiciel comptable, gestion des notes de frais multi-utilisateurs avec workflow d'approbation.

### 1.3 Contexte Symbtech

Symbtech opère sur plusieurs entités (notamment **Symbtech ZA (Pty) Ltd** en Afrique du Sud, **Symbtech.fr** en France), d'où le besoin natif de **multi-sociétés**, **multi-devises** (EUR, MUR, ZAR…), **TVA** et **refacturation inter-entités**.

---

## 2. Architecture & séparation d'e-FORT

Principe directeur retenu (session du 25 juin 2026) : **données et compute séparés d'e-FORT ; mutualisation uniquement là où c'est inoffensif.** Motivation = hygiène d'architecture (deux domaines sans rien en commun : perf sportive temps réel vs suivi de dépenses), pas une contrainte de facturation.

| Ressource | Décision | Détail |
|---|---|---|
| **Base de données** | **Séparée** | Base Mongo dédiée `symbtech-expenses` (PAS une collection greffée dans `efort`). |
| **Backend / compute** | **Séparé** | Sa propre app Express, son propre process, sur une **petite instance dédiée** (pas le serveur e-FORT, calibré pour du temps réel MQTT et de l'ingestion lourde). |
| **Clé Anthropic** | **Mutualisée** | Un appel vision ne crée aucun couplage entre les deux apps. |
| **Bucket S3** | **Séparé** | Bucket dédié au nom neutre (eu-west-3), préfixe `expenses/`, IAM scoppé. |
| **Toolchain Expo/RN & patterns** | **Réutilisés** | Savoir-faire, pas infrastructure : aucune duplication de ressource qui tourne. |

> Frontière nette là où elle compte : aucune requête d'un service ne peut toucher les données de l'autre, et un incident sur l'un n'affecte pas l'autre.

---

## 3. Stack & déploiement

### 3.1 Stack

**Backend** — Node.js + Express ; MongoDB (base dédiée `symbtech-expenses`) ; vision Claude via `@anthropic-ai/sdk` pour l'OCR ; `sharp` (normalisation image) ; `multer` (upload). Détail : `Context-Backend.md` + `Context-OCR.md`.

**Stockage** — AWS S3 `efort-prod` / préfixe `expenses/` (eu-west-3).

**Mobile** — Expo / React Native (même toolchain qu'e-FORT : Expo SDK 54, RN 0.81.5). Détail : `Context-Mobile.md`.

### 3.2 Environnements

| Env | Backend | DB | Notes |
|---|---|---|---|
| **Local** | `node server.js` (port 4000) | Mongo `symbtech-expenses` | Dev/test de l'extraction OCR. |
| **Prod** | Petite instance dédiée (à provisionner) | Mongo `symbtech-expenses` | Hôte/domaine **TBD**. |

### 3.3 Variables d'environnement

```
ANTHROPIC_API_KEY=...        # mutualisée avec e-FORT
OCR_MODEL=claude-sonnet-4-6  # optionnel (défaut)
EXPENSE_TYPES=...            # optionnel (catégories CSV)
PORT=4000

# À venir (S3 + Mongo) :
MONGODB_URI=...              # base symbtech-expenses dédiée
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-west-3
AWS_S3_BUCKET=efort-prod
S3_PREFIX=expenses/
```

### 3.4 Déploiement

À définir (**TBD**). Piste retenue : cloner le pattern e-FORT (instance + Express + pm2 + Nginx) sur une **petite instance séparée**. Pas de git pour l'instant (cohérent avec e-FORT) ; un `deploy.sh` dédié pourra être ajouté.

---

## 4. Structure du dépôt

Racine commune avec e-FORT : `/Users/jvitiere/`.

```
/Users/jvitiere/
├── efort-platform/                 # produit e-FORT (existant, intouché)
└── symbtech-systems/               # umbrella : outils internes Symbtech
    └── symbtech-expenses/          # 1er système
        ├── backend/                # micro-service Express (OCR + API)
        │   ├── lib/ocr.js          # cœur extraction vision Claude
        │   ├── routes/expenses.js  # route HTTP
        │   ├── server.js
        │   └── package.json
        ├── mobile/                 # app Expo/RN (à venir)
        └── docs/                   # CETTE documentation
            ├── Project.md
            ├── Context-Backend.md
            ├── Context-OCR.md
            ├── Context-Data.md
            └── Context-Mobile.md
```

> Le micro-service OCR déjà livré (`expenses-ocr/`) a vocation à être déposé dans `symbtech-expenses/backend/`.

---

## 5. Fichiers de contexte par domaine

Comme pour e-FORT, la doc est éclatée en fichiers `Context-*.md` spécialisés, pour garder `Project.md` lisible et permettre un chargement ciblé lors des sessions futures.

| Fichier | Domaine |
|---|---|
| `Context-Backend.md` | Micro-service Express, route OCR, API prévue, S3, Mongo, déploiement. |
| `Context-OCR.md` | Extraction par vision Claude : modèle, prompt, normalisation, confidence, limites. |
| `Context-Data.md` | Base `symbtech-expenses`, schéma `expenses`, mapping des champs, référentiels. |
| `Context-Mobile.md` | App Expo/RN : écrans, flux capture→OCR→validation, auth, distribution. |
| `Context-Paie.md` | Fiches de paie France & Maurice : logique de paie, cotisations, bulletin, impression A4, logo. |
| `Context-Referentiels.md` | Ajouts Société (paie + logo) et Fournisseur (personne physique + salarié : contrat & rémunération). |
| `Context-Simulations.md` | Simulations d'impôt salarié & société : barème progressif, Fair Share, pré-remplissage réel + prévisions. |

---

# Partie II — Documentation fonctionnelle

## 6. Le produit & le parcours utilisateur

1. **Capture** — l'utilisateur photographie un justificatif (caméra) ou en choisit un (galerie).
2. **Upload** — la photo part vers S3 (`expenses/`).
3. **OCR** — le backend appelle la vision Claude → JSON structuré (titre, date, montant TTC, TVA, devise, type).
4. **Validation** — le formulaire mobile se pré-remplit ; l'utilisateur corrige et complète les champs métier (société, moyen de paiement, Pro/Perso, refacturation…).
5. **Enregistrement** — écriture en base `symbtech-expenses`.
6. **Consultation** — écran liste/recherche (reproduit le « List of Expenses » du PowerApps).
7. **Export** — sortie comptable (format **TBD** : CSV, ventilation par société/TVA…).

---

## 7. Origine : le PowerApps à industrialiser

Le système actuel est un PowerApps (capture d'écran). Champs d'une dépense, relevés sur les écrans existants :

titre, date de la dépense, « expense for » (personne), type de dépense, moyen de paiement, Pro/Perso, Tax_Impact (on/off), société émettrice, devise, montant, TVA, refacturation à une entité, photo du justificatif.

L'**OCR ne pré-remplit que** titre / date / montant / TVA / devise / (type). Le reste reste des **choix de gestion**. Le mapping complet champ-par-champ est dans `Context-Data.md`.

---

## 8. Décisions architecturales

- **D1 — Vision Claude plutôt qu'OCR classique** (Tesseract/Textract/Google Vision). Lecture + extraction structurée en un seul appel, multilingue et multi-devises, sortie JSON directe, clé déjà disponible. Évite un parsing fragile de texte brut. Détail : `Context-OCR.md`.
- **D2 — Séparation données + compute + stockage d'e-FORT** (base, backend et bucket dédiés ; seule la clé Anthropic reste mutualisée). Cf. §2.
- **D3 — Petite instance dédiée** pour le backend (pas un process pm2 greffé sur l'EC2 e-FORT).
- **D4 — App mobile autonome** réutilisant la toolchain et les patterns e-FORT (pas un module dans l'app e-FORT grand public).
- **D5 — Logique d'extraction isolée** dans une fonction pure `extractExpenseFromImage(buffer)`, réutilisable depuis HTTP ou depuis un buffer S3.

---

## 9. Roadmap & chantiers

| # | Chantier | Statut |
|---|---|---|
| 1 | Micro-service OCR (`POST /expenses/ocr`) — image, PDF, multi-pages | ✅ Validé sur vrais justificatifs |
| 2 | Validation extraction sur de vrais justificatifs | ✅ Faite (restaurant AUD, folio hôtel 2 pages) |
| 3 | Upload S3 + persistance Mongo (`POST`/`GET /expenses`) | ✅ Construit, attend provisionnement |
| 4 | Provisionnement Atlas (cluster séparé) + bucket S3 dédié | ⏳ En cours (Joffrey) |
| 5 | App Expo v1 : login, liste, capture multi-pages → OCR → formulaire → save | ✅ Construite (à tester en simulateur) |
| 6 | Mobile : liste + détail/édition/suppression + affichage justificatif | ✅ v1 |
| 7 | Auth JWT + comptes utilisateurs (`/auth/login`, middleware) | ✅ Construit |
| 8 | `PATCH`/`DELETE /expenses/:id` (purge S3) | ✅ Construit |
| 9 | Export comptable | ◻ Format à définir |
| 10 | Déploiement backend EC2 (`https://expenses.symbtech.net`, HTTPS) — isolé d'e-FORT | ✅ Live |

### Décisions en attente
- Distribution mobile : build EAS interne (usage Symbtech) vs stores ?
- Companion web (vue liste réutilisable) ou tout mobile ?
- Format exact d'export comptable.
- Hôte/domaine de la petite instance.

---

## 9bis. Reprise — où on en est (26 juin 2026)

**Fait & validé en réel :**
- Backend (local) : OCR (image/PDF/multi-pages, vision Claude), `POST`/`GET`/`PATCH`/`DELETE /expenses`, `GET /expenses/:id/files` (URL signées), auth JWT (`/auth/login` + middleware), upload S3, persistance Mongo. Testé sur vrais justificatifs (restaurant AUD ; folio hôtel 2 pages → montant + TVA).
- Provisionnement réel : Atlas (projet `Symbtech-Systems`, cluster `symbtech-expenses`), bucket S3 dédié `symbtech-expenses` (eu-west-3) + IAM scoppé. `.env` complet.
- Mobile v1 sur **simulateur iOS** : login, liste, ajout (capture multi-pages → OCR → save), détail/édition/suppression + affichage justificatif (URL signée).

**Backend en PROD** : `https://expenses.symbtech.net` (EC2, pm2 `symbtech-expenses` port 3003, HTTPS Let's Encrypt, Mongo Atlas + S3). App mobile bascule sur cette URL.

**Prochaine session :**
1. Finir de valider le détail/édition sur simulateur.
2. **iPhone physique** : d'abord même Wi-Fi que le Mac (`API_BASE_URL` = IP locale du Mac ; `REACT_NATIVE_PACKAGER_HOSTNAME=<IP> npx expo run:ios --device --configuration Debug`). Vraie autonomie (hors Wi-Fi du Mac) → déployer le backend sur la petite instance (chantier #10).
3. Backend restant : export comptable (format à cadrer avec le comptable).

**Rappels (durement appris) :**
- `.env` : valeurs TOUJOURS entre guillemets doubles (dotenv tronque sur `&`/caractères spéciaux — vu sur `MONGODB_URI`). Diag : `node -e "require('dotenv').config(); console.log(process.env.CLE.length)"`.
- Backend lancé depuis `backend/`, mobile depuis `mobile/`.
- Pièges mobile (Metro croisés, simulateur, run:ios) : `Context-Mobile.md` §0bis.

---

## 9ter. Vision étendue — hub financier multi-sociétés (26 juin 2026)

**Architecture cible** : une **appli web d'administration** (poste principal du back-office) + l'**app iPhone Expenses** (spécialisée capture, conserve son rôle) + une **appli plus large** englobant Expenses comme module. Mêmes backend / Mongo / S3.

**Modules visés** : Sociétés (+ comptes bancaires + moyens de paiement) · Clients (+ contrats/BC) · Fournisseurs (+ contrats) · Relevés bancaires + **rapprochement bancaire** (vs dépenses) · **Facturation** clients (PDF).

**Fait (slice 1)** : collections `companies` + `clients`, endpoints de lecture, seed des données réelles, app Expenses branchée dessus (Société/Refacturer/paiement dynamiques).

**Fait (slice 2)** : API d'admin = CRUD complet sociétés/clients/fournisseurs (+ CORS) côté backend.

**Fait (slice 3)** : appli web d'admin (React+Vite, `admin/`) — CRUD Sociétés/Clients/Fournisseurs, login JWT, à `accounting.symbtech.net` (déploiement à venir). Voir `Context-Admin.md`.

**Fait (slice 4)** : Note de frais — coche + champ Personne (fournisseurs personnes physiques) sur les dépenses (backend + mobile + admin).

**En cours (slice 5)** : déploiement admin → `accounting.symbtech.net` (kit `deploy-admin.sh` + vhost). 

**Fait (slice 6)** : pièces jointes (contrats/BC) sur clients & fournisseurs — upload S3 + UI admin (Voir/Supprimer via URL signée).

**Fait (slice 7)** : relevés bancaires — import **CSV / Excel** (mappage) et **PDF** (extraction IA Claude vision) + modèle/routes `/bank` (import lot, liste, suppression). Voir `Context-Bank.md`.

**Fait (slice 8)** : rapprochement bancaire — moteur de correspondances (montant exact/proche + date + devise), validation manuelle, écritures internes (virements/salaires/frais). Voir `Context-Bank.md`.

**Fait (slice 9)** : facturation — modèle Invoice (numérotation par entité, lignes + TVA, totaux), émission/statuts, page admin Factures avec éditeur de lignes et vue imprimable (print → PDF). Voir `Context-Invoicing.md`.

**Fait (durcissement prod)** : CORS restreint à `accounting.symbtech.net` + `localhost:5173` (env `CORS_ORIGINS`), rotation `JWT_SECRET` (généré sur l'EC2), reset du mot de passe admin via `scripts/setPassword.js` (mot de passe lu sur stdin). Script ops : `update-hardening.sh`. Reste : Atlas formule avec sauvegardes (action console MongoDB).

**Fait (slice 10)** : normes comptables par société (catalogue + proposition par pays, multi-normes). Fondation du module Grand Livre. Voir `Context-Accounting.md`.

**Fait (slice 11)** : Grand Livre brouillon en PARTIE DOUBLE — agrégation dépenses+factures+banque par société/norme/période, écritures équilibrées, provenance+détail+rejet par pièce, balance & compte de résultat. Voir `Context-Accounting.md`.

**Fait (slice 12)** : import de charges Excel/CSV (mappage colonnes, dédup, bulk) — page admin Charges, endpoint `/expenses/bulk`. Alimente Grand Livre + rapprochement. Voir `Context-Charges.md`.

**Fait (slice 13)** : brouillon Grand Livre — enregistrement (savedAt), bouton Rafraîchir incrémental, compteur de nouvelles opérations à intégrer par exercice (LedgerDraft + /ledger/refresh,/save,/status).

**Fait (slice 14)** : module Devis (Quote) — CRUD, émission numérotée {CODE}-DEV-{année}-{seq}, statuts accepté/refusé, conversion devis→facture (brouillon), vue imprimable. Voir Context-Quotes.md.

**Fait (slice 15)** : référentiel Produits & services (CRUD) + sélecteur catalogue dans les lignes de devis et factures. Voir Context-Products.md.

**Fait (slice 16)** : référentiel Contrats client (Phase 1) — contrats + avenants (versionning) + commandes, documents nommés multiples, OCR contrat/commande (lib/dococr). Voir Context-Contracts.md.

**Fait (slice 17)** : Contrats Phase 2 — lignes de commande (catalogue), endpoint /orders/:id/prefill (agrège mentions contrat+avenants+commande + lignes), factures rattachées à une commande (reprend lignes + mentions, vue imprimable avec n°, adresse, mentions obligatoires, lignes).

**Fait (slice 18)** : module CRA (comptes rendus d activité) — saisie de lignes d activité + catalogue, workflow brouillon/soumis/approuvé/refusé, génération de facture brouillon (mentions contrat+avenants reprises). Voir Context-Cra.md.

**Fait (slice 18bis)**  : CRA transformé en feuille de temps mensuelle (grille jour par jour, catégories production/absence/interne, récap, facture depuis la production). Voir Context-Cra.md.

**Fait (slice 19)** : import d historique de factures de VENTE — récap Excel/CSV (mappage colonnes) + OCR PDF facture par facture ; factures archivees (numero d origine, statut emise/payee), dedup sha1, snapshot emetteur. Voir Context-Invoice-Import.md.

**Fait (slice 20)** : import d historique de factures FOURNISSEURS — recap Excel/CSV + OCR PDF ; achats crees en charges (Expense) avec supplierId/invoiceNumber/HT, dedup sha1(company|supplier|invoiceNumber). Voir Context-Supplier-Import.md.

**Fait (slice 21)** : Factures — gestion de liste (filtre par société, filtres **texte + liste** sur toutes les colonnes, tri, sélection multiple → supprimer/exporter Excel), édition des factures importées (numéro éditable ; totaux HT/TVA/TTC saisissables sans lignes, sans remise à zéro), et **informations complémentaires** (rattachement CRA avec jours auto, devis, remboursement de frais, réalisé par, tax impact, interco + société destinataire, no cash, montant encaissé via `/invoices/:id/meta`). Voir Context-Invoice-Import.md.

**Fait (slice 22)** : Navigation restructurée en **4 domaines repliables** (Masterdata, Purchase to Pay, Order to Cash, Record to Report) ; entrées nouvelles (Contrats fournisseurs, Achats récurrents/immobilisés, Bilan/Compte de résultat/Flux de trésorerie) pointant vers un écran « à construire » (ComingSoon).

**Fait (slice 23)** : Fiches de paie **France + Maurice** — sélecteur pays/régime, employeur (pré-rempli depuis la société, logo compris), salarié, période, brut, gains ; tableau de cotisations **éditable** + « Générer le modèle » (FR : PMSS 4005, Agirc-Arrco, CSG/CRDS, cadre, net social, PAS ; MU : CSG/NSF/Training Levy, PAYE) ; calcul net/impôt/coût employeur ; **impression PDF A4** en fenêtre dédiée (logo en en-tête, nets en bas, une page). Voir Context-Paie.md.

**Fait (slice 24)** : Référentiels étendus — **Société** : Code APE/NAF, N° employeur URSSAF/ERN, Convention collective, + **logo** (upload S3, affiché sur le bulletin) ; **Fournisseur** : champs personne physique (civilité/prénom/nom/naissance/NIC) et coche **« Salarié »** avec bloc Contrat & rémunération (régime, devise, contrat, poste, classification/grade, rémunération annuelle + mensualisée, **mois supplémentaires** 13e/14e, primes/bonus). Ces données **pré-remplissent la fiche de paie**. Voir Context-Referentiels.md.

**Fait (slice 25)** : **Simulations d'impôt** (salarié & société) sous Record to Report — modèle sauvegardable (titre, pays, société/personne, **période fiscale**, notes) ; **période auto** (FR année civile, MU 1er juillet→30 juin) ; **pré-remplir depuis le réel** (bulletins/factures/charges + prévisions contrats proratisés & masse salariale) ; lignes éditables ; **barème progressif éditable** (FR/MU) ; **Fair Share Contribution** (MU) ; calcul base/impôt/Fair Share/impôt total/taux effectif/reste à payer. Voir Context-Simulations.md.

**Suite** : (feuille de route terminee — option : factures fournisseurs). import historique de factures (fournisseurs ou ventes ?). Phase 2 lien facture→commande + report des mentions ; import historique factures ; CRA→facture. import historique factures (fournisseurs ou ventes ?), comptes rendus d activité → facture. factures (historique import PDF/Excel), devis, comptes rendus d'activité → facture. (b) pièces jointes contrats/BC (upload S3) ; (c) relevés + rapprochement ; (d) facturation ; (e) appli large embarquant Expenses.

---

## 9quater. Reprise — vague paie & fiscal (11 juillet 2026)

**En ligne (prod)** : backend `https://expenses.symbtech.net` (EC2, pm2 `symbtech-expenses` port 3003) ; admin `https://accounting.symbtech.net`. Base Atlas `symbtech-expenses`, S3 `symbtech-expenses` (eu-west-3).

**Livré cette vague** : gestion & enrichissement des factures (slice 21), navigation groupée (22), fiches de paie FR+MU avec logo et impression A4 (23), référentiels Société/Fournisseur étendus dont dossier salarié qui alimente la paie (24), simulateurs d'impôt salarié & société avec Fair Share et période fiscale automatique (25).

**Barèmes/taux** : PMSS, cotisations FR/MU, barèmes d'impôt et Fair Share sont **indicatifs et éditables** — à vérifier URSSAF/BOSS (France) et MRA (Maurice).

**En attente / prochaines pistes** :
- Rattacher chaque **salarié à une société** (pour cibler la masse salariale prévisionnelle des simulations société).
- **Calcul automatique du PAYE** mauricien dans le bulletin (barème MRA 0/10/20, cumul annuel + abattements EDF).
- Modules encore en « à construire » : Contrats fournisseurs, Achats récurrents, Achats immobilisés, rapports Bilan / Compte de résultat / Flux de trésorerie.
- Sauvegardes Atlas (formule avec backups) — seul vrai point de résilience restant sur M0.

**Rappels ops (durement appris)** :
- Livraisons via scripts `.sh` (heredocs `<< 'CLAUDE_EOF'`) : fichiers nouveaux écrits en entier, fichiers existants (server.js, api.js, App.jsx) modifiés par **patchs idempotents**.
- `/health` renvoie souvent un **502 transitoire** juste après `pm2 restart` (uptime 0 s) : ce n'est pas une panne, confirmer avec `curl -s -o /dev/null -w "%{http_code}\n" https://expenses.symbtech.net/health`.
- Connexion Mongo via `lib/db` `connectDB()` (fixe le dbName `symbtech-expenses`) ; un `mongoose.connect(URI)` brut tombe sur la base `test` (vide).
- Reset mot de passe admin : script SSH → EC2 → `connectDB()` → collection `users`, champ `passwordHash` (bcrypt).

---

## 10. Glossaire


- **OCR** — ici, extraction structurée par vision Claude (pas un OCR classique caractère-par-caractère).
- **TTC / HT** — toutes taxes comprises / hors taxes. `amount` = TTC ; `vat` = part de TVA.
- **Refacturation (« Refact »)** — réémission d'une dépense vers une autre entité Symbtech.
- **Pro / Perso** — dépense professionnelle ou personnelle.
- **Tax_Impact** — indicateur d'impact fiscal de la dépense (on/off).
- **symbtech-systems** — umbrella des outils internes Symbtech ; `symbtech-expenses` en est le premier.
