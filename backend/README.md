# symbtech-expenses-ocr

Cœur du futur tracker de dépenses Symbtech : une route qui prend la **photo d'un justificatif** et renvoie ses champs structurés (titre, date, montant, TVA, devise, type) via la **vision de Claude**. Instance **séparée** d'e-FORT (base + compute distincts) ; seules la clé Anthropic, le bucket S3 et la toolchain Expo/RN sont mutualisés.

C'est le bout qui porte tout le risque : si l'extraction n'est pas fiable sur tes vrais justificatifs (flous, de travers), le reste ne sert à rien. **Teste ça d'abord.**

## Installation

```bash
npm install
cp .env.example .env      # puis renseigne ANTHROPIC_API_KEY
npm start                 # écoute sur :4000 (configurable via PORT)
```

## Tester sur un vrai justificatif

```bash
curl -s -F file=@/chemin/vers/ticket.jpg http://localhost:4000/expenses/ocr | jq
```

Réponse type :

```json
{
  "data": {
    "title": "Casque audio",
    "merchant": "Fnac",
    "date": "2025-01-24",
    "amount": 249.99,
    "vat": 41.66,
    "currency": "EUR",
    "type": "Small equipment",
    "confidence": 0.93,
    "notes": null
  },
  "model": "claude-sonnet-4-6",
  "usage": { "input_tokens": 1234, "output_tokens": 156 },
  "raw": "{ ... réponse brute du modèle ... }"
}
```

Passe en revue tes captures (Flight, Hotel, Casque audio, Rental Paris…) et les cas tordus : tickets MUR, montants à virgule, TVA absente, photos penchées. Le champ `confidence` te sert à décider quels tickets exigent une relecture humaine.

## Réglages

| Variable | Rôle | Défaut |
|---|---|---|
| `ANTHROPIC_API_KEY` | clé d'accès (requis) | — |
| `OCR_MODEL` | modèle d'extraction | `claude-sonnet-4-6` |
| `EXPENSE_TYPES` | catégories proposées (CSV) | Hotel, Restaurant, Plane, Office rental, Communication, Small equipment |
| `PORT` | port HTTP | `4000` |

Si la précision n'est pas au rendez-vous sur les justificatifs dégradés, bascule `OCR_MODEL=claude-opus-4-8`. Pour réduire le coût, `claude-haiku-4-5`.

## Ce que fait (et ne fait pas) ce service

- **Fait** : reçoit l'image → la redresse (EXIF) + redimensionne ≤ 1568 px / JPEG q80 (reste < 5 Mo, limite le coût en tokens) → l'envoie à Claude → renvoie un JSON typé et validé.
- **Ne fait pas encore** : stockage S3, persistance Mongo, auth. C'est volontaire — on valide l'extraction avant de construire autour.

## Décisions techniques

- **Vision Claude plutôt qu'OCR classique** : lecture + extraction structurée en un seul appel, multilingue et multi-devises, sortie JSON directe. Pas de parsing fragile de texte brut.
- **`temperature` omis** : non supporté sur Opus 4.7+ (erreur 400) → on l'omet pour rester agnostique au modèle.
- **Logique d'extraction isolée dans `lib/ocr.js`** : `extractExpenseFromImage(buffer)` est pure et réutilisable telle quelle depuis un buffer lu sur S3, pas seulement depuis la route HTTP.
- **iOS HEIC** : fais exporter du JPEG côté app mobile (Expo `ImagePicker`) — plus léger et décodé partout sans dépendance libheif.

## Prochaines étapes (dans l'ordre)

1. Valider l'extraction sur un lot de tes vrais justificatifs.
2. Brancher l'upload S3 (préfixe `expenses/`) + appeler `extractExpenseFromImage` sur le buffer.
3. Persister en Mongo (`symbtech-expenses`, collection `expenses`) avec `ocrRaw` + `validatedByHuman`.
4. Formulaire Expo pré-rempli par la réponse OCR + écran liste/recherche.
