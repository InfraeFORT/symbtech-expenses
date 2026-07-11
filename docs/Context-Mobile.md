# Context-Mobile — symbtech-expenses

> Domaine : application mobile Expo / React Native (capture, OCR, saisie, liste).
> Voir aussi : `Context-Backend.md` (API consommée), `Context-Data.md` (référentiels des menus).
> Dernière mise à jour : 25 juin 2026 — v1 construite (Expo blank + React Navigation).

---

## 0. État v1 (construite)

Stack : Expo (template blank) + React Navigation native-stack, `expo-image-picker` (capture/galerie), `expo-secure-store` (token JWT). Code sous `mobile/` (séparé du backend).

Écrans livrés : **Login** (email/mot de passe → token), **Liste** (GET /expenses, pull-to-refresh, badge « à relire »), **Ajout** (capture multi-pages → `/expenses/ocr` → champs éditables → `POST /expenses`), **Détail** (ouvre en **consultation** lecture seule ; bouton **Modifier** → édition `PATCH` ; **Annuler** restaure ; **Refacturer** attribuable/modifiable même si vide ; suppression `DELETE`). `createdBy` vient du token côté serveur. Composant `Chips` partagé Ajout/Détail.

Config : `src/config.js` → `API_BASE_URL = https://expenses.symbtech.net` (backend déployé ; repasser à `http://localhost:4000` pour le dev local simulateur). Référentiels (types, devises, sociétés, paiements) codés en dur en v1, à migrer vers le backend ensuite.

Lancement : `cd mobile && npx expo start`, touche `i` pour le simulateur iOS. Le backend doit tourner en parallèle.

À tester/itérer sur appareil : permissions caméra, rendu des écrans, comportement multi-pages réel.

---

## 0bis. Lancer en dev (procédure éprouvée + pièges)

**Workflow = build natif de dev** (comme e-FORT), PAS Expo Go. Modules natifs présents : `react-native-gesture-handler`, `expo-image-picker`, `expo-secure-store`.

Lancer / réinstaller :
```
cd mobile && npx expo run:ios
```
- Première compile : prebuild + CocoaPods (quelques min). Ensuite quasi instantané. Les changements JS = simple reload Metro (`r`), pas de rebuild.
- **Toujours depuis `mobile/`** (sinon « module expo not installed »).
- Cibler un **iPhone**, jamais l'Apple Watch (Expo Go refusait l'install sur la watch — d'où le passage en build natif).

Pièges rencontrés (et corrigés) :
- **Metro qui se croisent** : e-FORT tourne sur 8081 ; lancer un 2e Metro charge parfois le mauvais bundle (`Cannot find native module 'ExpoLocalization'` = bundle e-FORT). Fix : `lsof -ti:8081 | xargs kill` puis relancer.
- **« No development build installed »** après un `simctl terminate` ou app effacée → réparer avec `npx expo run:ios` (PAS `expo start`, qui suppose l'app déjà installée).
- **« No apps connected »** → `xcrun simctl terminate booted net.symbtech.expenses` puis relancer (§ leçon e-FORT 15.148).
- `react-native-gesture-handler` : requis par React Navigation, **import en 1ʳᵉ ligne d'`App.js`**, et module natif → `expo install` + rebuild.

BundleId : `net.symbtech.expenses` (neutre, distinct de `com.symbtech.efort`).

---

## 0ter. Build sur iPhone physique (mode autonome)

Backend public en HTTPS → l'app fonctionne partout, Mac éteint. Build natif **Release** (bundle JS embarqué, pas de Metro) :
```
cd mobile && npx expo run:ios --device --configuration Release
```
- Sélectionner l'iPhone connecté (USB ou Wi-Fi).
- Signature : équipe Apple ID dans Xcode (Signing & Capabilities) ; faire confiance au profil sur l'iPhone (Réglages → Général → VPN et gestion de l'appareil).
- Apple ID gratuit = profil valable **7 jours** (app à réinstaller après) ; compte payant + EAS/TestFlight pour du durable.

---

## 1. Principe

App **autonome** (décision D4) — pas un module de l'app e-FORT grand public — mais **réutilisant la toolchain et les patterns** d'e-FORT : Expo SDK 54, RN 0.81.5, auth JWT, structure d'écrans. On repart d'un terrain maîtrisé, sans entanglement.

Identifiant d'application : **TBD** (ex. `com.symbtech.expenses` — distinct de `com.symbtech.efort`).

---

## 2. Flux utilisateur

```
[Capture] caméra / galerie
     │  (export JPEG)
     ▼
[Upload] vers S3 expenses/
     ▼
[OCR] POST /expenses/ocr → JSON
     ▼
[Formulaire] pré-rempli (title, date, amount, vat, currency, type)
     │  l'utilisateur complète les champs métier
     │  (company, paymentMethod, proOrPerso, taxImpact, refactTo)
     ▼
[Enregistrement] POST /expenses
     ▼
[Liste / recherche]  ← reproduit « List of Expenses »
```

---

## 3. Écrans

| Écran | Rôle | Réf. PowerApps |
|---|---|---|
| Capture | caméra (tap to take) + « saved photo » | « Add new Expense » (haut) |
| Saisie | formulaire pré-rempli par l'OCR + champs métier | « Add new Expense » / « Modify data » |
| Liste | dépenses, recherche, vignette justificatif | « List of Expenses » |
| Détail / édition | relecture, correction, validation | « Modify data » |

Les menus déroulants (type, société, devise, paiement, refacturation) sont alimentés par les **référentiels** de `Context-Data.md`.

---

## 4. Auth

JWT (même approche qu'e-FORT, `JWT_SECRET` côté backend). À câbler quand l'API CRUD existe.

---

## 5. Points techniques

- **Export JPEG** : faire produire du JPEG par `expo-image-picker` (option qualité) plutôt que du HEIC iOS — plus léger et décodé partout sans dépendance libheif côté `sharp`.
- **Indicateur de confiance** : afficher visuellement les dépenses à `ocrConfidence` faible comme « à relire ».
- **Hors-ligne** (prospectif) : file d'attente locale d'uploads si pas de réseau au moment de la capture.

---

## 6. Décisions en attente

- **Distribution** : build EAS interne (usage Symbtech, quelques personnes) vs publication stores. Penche vers EAS interne tant que l'usage reste interne.
- **Companion web** : reproduire la vue liste côté web (réutilisable depuis un front Vite) ou rester 100 % mobile ?


## Ajout — Note de frais
Add & Détail : coche **Note de frais** → champ **Personne** (sélecteur alimenté par les fournisseurs `isIndividual`, via `useReferentials().persons`). Stocké sur la dépense (`isExpenseReport`, `person`).
