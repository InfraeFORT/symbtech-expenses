// lib/bankocr.js — extraction des opérations d'un relevé bancaire (PDF/image)
// via la vision de Claude. Réutilise buildMediaBlock/isPdf de lib/ocr.js.
//
// Les relevés peuvent compter des centaines de lignes : un PDF est donc DÉCOUPÉ
// en paquets de quelques pages, chaque paquet analysé séparément (sinon la sortie
// JSON dépasse la limite de tokens et se retrouve tronquée → parsing impossible).
const Anthropic = require('@anthropic-ai/sdk');
const { PDFDocument } = require('pdf-lib');
const { buildMediaBlock, isPdf } = require('./ocr');

const MODEL = process.env.BANK_OCR_MODEL || process.env.OCR_MODEL || 'claude-sonnet-4-6';
const PAGES_PER_CHUNK = Number(process.env.BANK_OCR_PAGES_PER_CHUNK || 4);
const MAX_TOKENS = Number(process.env.BANK_OCR_MAX_TOKENS || 16000);
const anthropic = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'environnement

function buildPrompt() {
  return `Tu extrais TOUTES les opérations d'un relevé de compte bancaire.
Tu reçois une ou plusieurs pages (PDF ou image) d'un relevé. Les libellés peuvent être abrégés et dans différentes langues.

Renvoie UNIQUEMENT un tableau JSON (aucun texte autour, aucun bloc markdown), un objet par opération, avec EXACTEMENT ces clés :
- "date"     : date de l'opération au format ISO "YYYY-MM-DD". En cas d'ambiguïté JJ/MM vs MM/JJ, suppose JOUR/MOIS/ANNÉE.
- "label"    : libellé de l'opération (string), en incluant le détail/bénéficiaire s'il figure sur la ligne suivante.
- "amount"   : montant SIGNÉ — NÉGATIF pour un débit/sortie/retrait (colonne DEBIT), POSITIF pour un crédit/entrée (colonne CREDIT). Nombre avec point décimal, sans symbole ni séparateur de milliers.
- "currency" : code ISO 4217 (EUR, MUR, ZAR, USD…) si déductible de l'en-tête, sinon null.
- "balance"  : solde après opération (colonne BALANCE) s'il figure, sinon null.

Règles :
- Une entrée par ligne d'opération. N'inclus PAS les lignes "Opening Balance", "Closing Balance", ni les en-têtes/totaux.
- Respecte le signe via les colonnes DEBIT (négatif) et CREDIT (positif).
- Si la page ne contient aucune opération ou est illisible : renvoie un tableau vide [].
- N'invente jamais de valeur.`;
}

function safeParseArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Réponse du modèle non parsable (tableau JSON attendu) : ' + text.slice(0, 200));
  }
  return JSON.parse(text.slice(start, end + 1));
}

// Découpe un PDF en sous-PDF de PAGES_PER_CHUNK pages. En cas d'échec (PDF
// chiffré/atypique), repli sur le PDF entier en un seul paquet.
async function pdfChunks(buffer) {
  try {
    const src = await PDFDocument.load(buffer);
    const n = src.getPageCount();
    const chunks = [];
    for (let start = 0; start < n; start += PAGES_PER_CHUNK) {
      const sub = await PDFDocument.create();
      const idxs = [];
      for (let i = start; i < Math.min(start + PAGES_PER_CHUNK, n); i++) idxs.push(i);
      const pages = await sub.copyPages(src, idxs);
      pages.forEach((p) => sub.addPage(p));
      chunks.push(Buffer.from(await sub.save()));
    }
    return chunks.length ? chunks : [buffer];
  } catch (e) {
    console.error('[bankocr] découpage PDF impossible, envoi entier :', e.message);
    return [buffer];
  }
}

async function extractOneUnit(buffer) {
  const mediaBlock = await buildMediaBlock(buffer);
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: [mediaBlock, { type: 'text', text: buildPrompt() }] }],
  });
  const rawText = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return safeParseArray(rawText);
}

async function extractBankTransactionsFromFiles(buffers) {
  if (!Array.isArray(buffers) || buffers.length === 0) {
    throw new Error('Aucun fichier fourni.');
  }

  // Construit la liste des unités à analyser : chunks pour les PDF, image telle quelle sinon.
  let units = [];
  for (const buf of buffers) {
    if (isPdf(buf)) units = units.concat(await pdfChunks(buf));
    else units.push(buf);
  }

  // Analyse chaque unité en parallèle ; un paquet illisible ne bloque pas les autres.
  const results = await Promise.all(
    units.map(async (unit) => {
      try {
        return await extractOneUnit(unit);
      } catch (e) {
        console.error('[bankocr] paquet échoué :', e.message);
        return [];
      }
    })
  );

  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const transactions = results
    .flat()
    .map((t) => ({
      date: t.date ?? null,
      label: (t.label ?? '').toString().trim(),
      amount: num(t.amount),
      currency: t.currency ?? null,
      balance: num(t.balance),
    }))
    .filter((t) => t.amount !== null && t.date);

  return { transactions, model: MODEL, chunks: units.length };
}

module.exports = { extractBankTransactionsFromFiles };
