# Context-OCR — symbtech-expenses

> Domaine : l'extraction structurée d'un justificatif par la vision de Claude — le **cœur et le principal risque** du projet.
> Voir aussi : `Context-Backend.md` (service hôte), `Context-Data.md` (champs cibles).
> Dernière mise à jour : 25 juin 2026.

---

## 1. Pourquoi la vision Claude plutôt qu'un OCR classique

Un OCR classique (Tesseract, AWS Textract, Google Vision) rend du **texte brut** qu'il faut ensuite parser avec des règles fragiles : où est le total ? quelle ligne est la TVA ? quelle devise ?

La vision de Claude fait **lecture + extraction structurée en un seul appel** : image + prompt « renvoie ce JSON » → objet directement exploitable. Gère nativement le multilingue, les devises (EUR/MUR/ZAR…), les mises en page variables et les photos dégradées. Clé déjà disponible (mutualisée e-FORT) et approche déjà éprouvée côté e-FORT (pipeline OCR→FIT).

**Limite assumée** : pas de score de confiance « machine » comme un OCR dédié → on demande au modèle une auto-évaluation (`confidence`) et on prévoit une **relecture humaine** des cas à faible confiance.

---

## 2. Modèle

Défaut : **`claude-sonnet-4-6`** — bon équilibre précision/coût pour de l'extraction de tickets. Surchargeable via `OCR_MODEL` :
- `claude-opus-4-8` → justificatifs très dégradés (précision maximale).
- `claude-haiku-4-5` → réduction du coût.

> `temperature` / `top_p` **omis** : non supportés sur Opus 4.7+ (erreur 400). On les omet pour rester agnostique au modèle.

---

## 2bis. Formats d'entrée

- **Image** (`image/*`) : redressée (EXIF) + redimensionnée ≤ 1568 px avant envoi.
- **PDF** (`application/pdf`) : envoyé nativement comme bloc `document` (pas de rasterisation), jusqu'à ~20 Mo.
- **Multi-pages** : 1..n fichiers transmis ensemble = UNE dépense (le total est souvent sur la dernière page). Détection PDF par signature `%PDF`.

---

## 3. Champs extraits

JSON renvoyé par `extractExpenseFromFiles` (image, PDF, ou plusieurs pages d'un même justificatif) :

| Clé | Type | Règle |
|---|---|---|
| `title` | string\|null | libellé court (enseigne ou nature) |
| `merchant` | string\|null | raison sociale / enseigne |
| `date` | string\|null | ISO `YYYY-MM-DD` ; ambiguïté → **JOUR/MOIS/ANNÉE** |
| `amount` | number\|null | **total TTC** payé (jamais le sous-total HT) |
| `vat` | number\|null | montant TVA/taxe si indiqué séparément |
| `currency` | string\|null | ISO 4217 (EUR, MUR, ZAR, USD…) |
| `type` | string\|null | catégorie la plus proche parmi `EXPENSE_TYPES`, ou null |
| `confidence` | number | auto-évaluation 0–1 |
| `notes` | string\|null | remarque si valeur douteuse/illisible |

Garde-fous de typage côté code : les nombres renvoyés en string sont reconvertis ; clés absentes → null.

---

## 4. Normalisation de l'image (avant l'appel)

`sharp` applique l'orientation **EXIF** (`.rotate()` — les photos mobiles arrivent souvent tournées) puis redimensionne à **≤ 1568 px** sur le grand côté et ré-encode en **JPEG q80**. Objectif : rester sous la limite de 5 Mo de l'API et **limiter le coût en tokens** (le coût croît avec la résolution). Au-delà de ~1568 px l'API redimensionne de toute façon.

---

## 5. Robustesse du parsing

`safeParseJson` extrait le bloc entre le premier `{` et le dernier `}` → tolère un éventuel fence ```json``` ou du texte parasite. Échec de parsing → erreur captée → 502 propre.

---

## 6. Limites connues (vision)

- Manuscrit stylisé / pattes de mouche : lecture aléatoire.
- Très petits caractères (< ~12pt @72dpi) : augmenter la résolution si nécessaire.
- Pas de coordonnées pixel exactes (non requis ici).

**Stratégie** : seuil de `confidence` en deçà duquel la dépense est marquée « à relire » (`validatedByHuman=false`) dans l'UI mobile.

---

## 7. Réglages (env)

| Variable | Défaut | Effet |
|---|---|---|
| `OCR_MODEL` | `claude-sonnet-4-6` | modèle d'extraction |
| `EXPENSE_TYPES` | Hotel, Restaurant, Plane, Office rental, Communication, Small equipment | catégories proposées (CSV) |

---

## 8. Protocole de validation (à exécuter)

1. Constituer un lot de **vrais justificatifs** (inclure : Flight MUR, Hotel, Casque audio 249,99 €, Rental Paris, photos penchées).
2. `curl -F file=@ticket.jpg http://localhost:4000/expenses/ocr | jq`.
3. Comparer `data` aux valeurs réelles ; noter les erreurs par champ.
4. Si précision insuffisante : passer `OCR_MODEL=claude-opus-4-8`, ou enrichir le prompt (`buildPrompt` dans `lib/ocr.js`).
5. Caler le seuil de `confidence` pour la relecture humaine.
