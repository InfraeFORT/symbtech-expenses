// lib/ocr.js
// Cœur du système : extraction structurée d'un justificatif de dépense
// (ticket, facture, reçu) à partir d'une photo, via la vision de Claude.
//
// Expose une fonction pure `extractExpenseFromImage(buffer)` qui prend les
// octets bruts d'une image et renvoie un objet métier + la réponse brute.
// Réutilisable telle quelle depuis une route HTTP OU depuis un buffer lu sur S3.

const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');

// Modèle par défaut : Sonnet 4.6 = bon équilibre précision/coût pour de
// l'extraction de tickets. Surchargeable (ex: claude-opus-4-8 pour les
// justificatifs vraiment illisibles, claude-haiku-4-5 pour réduire le coût).
const MODEL = process.env.OCR_MODEL || 'claude-sonnet-4-6';

// Au-delà de ~1568 px sur le grand côté, l'API redimensionne de toute façon :
// on le fait nous-mêmes pour rester < 5 Mo et limiter la facture de tokens.
const MAX_EDGE = 1568;
const JPEG_QUALITY = 80;

// Catégories métier — élargies pour le rapprochement comptable.
// Surchargeable via env (CSV). DOIT rester aligné avec EXPENSE_TYPES côté mobile.
const EXPENSE_TYPES = (
  process.env.EXPENSE_TYPES ||
  'Hotel,Restaurant,Plane,Train,Taxi / Rideshare,Car rental,Fuel,Tolls / Parking,Public transport,Office rental,Office supplies,Small equipment,IT hardware,Software / Subscriptions,Communication,Postage / Shipping,Marketing / Advertising,Professional services,Bank fees,Insurance,Training,Client entertainment,Gifts,Memberships / Dues,Taxes & duties,Other'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Le SDK lit ANTHROPIC_API_KEY dans l'environnement.
const anthropic = new Anthropic();

function buildPrompt() {
  return `Tu extrais des données structurées depuis un justificatif de dépense (ticket, facture, reçu).
Tu reçois UNE OU PLUSIEURS images/pages qui constituent UN SEUL et même justificatif : agrège-les pour produire UNE seule dépense (le total figure souvent sur la dernière page).
Les photos peuvent être floues, de travers, mal éclairées ou rédigées dans différentes langues.

Renvoie UNIQUEMENT un objet JSON (aucun texte autour, aucun bloc markdown) avec EXACTEMENT ces clés :
- "title"      : libellé court de la dépense (enseigne ou nature). string ou null.
- "merchant"   : raison sociale / enseigne du fournisseur. string ou null.
- "date"       : date de la dépense au format ISO "YYYY-MM-DD". En cas d'ambiguïté JJ/MM vs MM/JJ, suppose JOUR/MOIS/ANNÉE. null si introuvable.
- "amount"     : montant TOTAL payé, TVA comprise. Nombre (point décimal, sans symbole, sans séparateur de milliers). null si introuvable.
- "vat"        : montant de la TVA / taxe si indiqué séparément. Nombre ou null.
- "currency"   : code ISO 4217 (ex : EUR, MUR, ZAR, USD), déduit du symbole ou du pays. null si incertain.
- "type"       : la catégorie la PLUS proche parmi [${EXPENSE_TYPES.join(', ')}], ou null si aucune ne convient.
- "confidence" : ta confiance globale dans l'extraction, nombre entre 0 et 1.
- "notes"      : courte remarque si une valeur est douteuse/illisible, sinon null.

Règles :
- "amount" = total TTC réellement payé, jamais le sous-total HT. Si plusieurs pages, cherche le total final sur l'ensemble.
- Si le justificatif n'est pas lisible : tous les champs à null et "confidence" bas.
- N'invente jamais une valeur : dans le doute, null.`;
}

// Tolère un éventuel fence ```json ... ``` ou du texte parasite autour du JSON.
function safeParseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Réponse du modèle non parsable en JSON : ' + text.slice(0, 200));
  }
  return JSON.parse(text.slice(start, end + 1));
}

// Redimensionne + ré-encode en JPEG. `.rotate()` applique l'orientation EXIF
// (les photos mobiles arrivent souvent tournées) avant le resize.
async function normaliseImage(buffer) {
  const out = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return { data: out.toString('base64'), mediaType: 'image/jpeg' };
}

// Détecte un PDF par sa signature (« %PDF » en tête de fichier).
function isPdf(buffer) {
  return (
    buffer && buffer.length > 4 &&
    buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
  );
}

// Construit le bloc de contenu adapté : « document » pour un PDF (lu nativement
// par l'API, sans rasterisation), « image » redimensionnée sinon.
async function buildMediaBlock(buffer) {
  if (isPdf(buffer)) {
    // base64 ≈ 4/3 de la taille brute ; au-delà de ~20 Mo, passer par la Files API.
    if (buffer.length > 20 * 1024 * 1024) {
      throw new Error('PDF trop volumineux (> 20 Mo) — utiliser la Files API.');
    }
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') },
    };
  }
  const { data, mediaType } = await normaliseImage(buffer);
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

async function extractExpenseFromFiles(buffers) {
  if (!Array.isArray(buffers) || buffers.length === 0) {
    throw new Error('Aucun fichier fourni.');
  }
  // Un bloc média par page, puis le prompt. Toutes les pages = une seule dépense.
  const mediaBlocks = await Promise.all(buffers.map(buildMediaBlock));

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [...mediaBlocks, { type: 'text', text: buildPrompt() }],
      },
    ],
  });

  const rawText = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const parsed = safeParseJson(rawText);

  // Garde-fous de typage : le modèle peut renvoyer des nombres sous forme de string.
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

  const expense = {
    title: parsed.title ?? null,
    merchant: parsed.merchant ?? null,
    date: parsed.date ?? null,
    amount: num(parsed.amount),
    vat: num(parsed.vat),
    currency: parsed.currency ?? null,
    type: parsed.type ?? null,
    confidence: num(parsed.confidence),
    notes: parsed.notes ?? null,
  };

  return { data: expense, model: MODEL, usage: resp.usage, raw: rawText };
}

// Wrapper mono-fichier (rétrocompatible) — délègue à la version multi-pages.
async function extractExpenseFromFile(buffer) {
  return extractExpenseFromFiles([buffer]);
}

// `extractExpenseFromImage` conservé comme alias rétrocompatible (gère image, PDF, et multi-pages).
module.exports = {
  extractExpenseFromFiles,
  extractExpenseFromFile,
  extractExpenseFromImage: extractExpenseFromFile,
  buildMediaBlock, // réutilisé par lib/bankocr.js (PDF/image → bloc message)
  isPdf, // réutilisé par lib/bankocr.js (détection PDF pour le découpage)
  EXPENSE_TYPES,
};
