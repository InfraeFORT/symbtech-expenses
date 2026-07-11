// lib/dococr.js — extraction structurée des éléments clés d'un contrat / avenant / commande
// via la vision de Claude. Réutilise buildMediaBlock de lib/ocr.js (PDF natif ou image).
const Anthropic = require('@anthropic-ai/sdk');
const { buildMediaBlock } = require('./ocr');

const MODEL = process.env.DOC_OCR_MODEL || process.env.OCR_MODEL || 'claude-sonnet-4-6';
const anthropic = new Anthropic();

function safeParseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Réponse non parsable en JSON : ' + text.slice(0, 200));
  }
  return JSON.parse(text.slice(start, end + 1));
}

const CONTRACT_PROMPT = `Tu analyses un CONTRAT (ou un AVENANT) commercial entre un prestataire et un client.
Tu peux recevoir plusieurs pages : agrège-les pour décrire UN seul contrat.
Renvoie UNIQUEMENT un objet JSON (aucun texte ni markdown autour) avec EXACTEMENT ces clés :
- "reference"     : numéro / référence du contrat. string ou null.
- "title"         : intitulé court du contrat. string ou null.
- "object"        : objet du contrat (description de la prestation). string ou null.
- "clientName"    : raison sociale du client (le donneur d'ordre). string ou null.
- "providerName"  : raison sociale du prestataire. string ou null.
- "startDate"     : date de début / signature, ISO "YYYY-MM-DD". null si absent.
- "endDate"       : date de fin / échéance, ISO "YYYY-MM-DD". null si absent.
- "value"         : montant total / valeur du contrat. Nombre (point décimal, sans symbole). null si absent.
- "currency"      : code ISO 4217 (EUR, MUR, ZAR, USD…). null si incertain.
- "paymentTerms"  : conditions de paiement (délai, échéancier). string ou null.
- "mentions"      : mentions à reporter obligatoirement sur les factures (référence contrat, bon de commande exigé, pénalités, RIB imposé, etc.). string ou null.
- "noticePeriod"  : préavis / reconduction. string ou null.
- "confidence"    : confiance globale, nombre entre 0 et 1.
- "notes"         : remarque si un élément est douteux, sinon null.
N'invente jamais : dans le doute, null.`;

const ORDER_PROMPT = `Tu analyses une COMMANDE CLIENT (bon de commande / purchase order).
Tu peux recevoir plusieurs pages : agrège-les pour décrire UNE seule commande.
Renvoie UNIQUEMENT un objet JSON (aucun texte ni markdown autour) avec EXACTEMENT ces clés :
- "number"       : numéro de commande / bon de commande. string ou null.
- "date"         : date de la commande, ISO "YYYY-MM-DD". null si absent.
- "clientName"   : raison sociale du client émetteur. string ou null.
- "description"  : objet / description de la commande. string ou null.
- "amount"       : montant total de la commande. Nombre (point décimal, sans symbole). null si absent.
- "currency"     : code ISO 4217. null si incertain.
- "paymentTerms" : conditions de paiement. string ou null.
- "notes"        : remarque si un élément est douteux, sinon null.
N'invente jamais : dans le doute, null.`;

const INVOICE_PROMPT = `Tu analyses une FACTURE DE VENTE déjà émise (archive d'historique).
Tu peux recevoir plusieurs pages : agrège-les pour décrire UNE seule facture.
Renvoie UNIQUEMENT un objet JSON (aucun texte ni markdown autour) avec EXACTEMENT ces clés :
- "number"       : numéro de la facture. string ou null.
- "date"         : date d'émission, ISO "YYYY-MM-DD". null si absent.
- "dueDate"      : date d'échéance, ISO "YYYY-MM-DD". null si absent.
- "clientName"   : raison sociale du CLIENT destinataire (le payeur). string ou null.
- "issuerName"   : raison sociale de l'ÉMETTEUR (le vendeur). string ou null.
- "currency"     : code ISO 4217 (EUR, USD, MUR…). null si incertain.
- "lines"        : tableau des lignes de prestation/produit. Chaque élément :
                   { "description": string, "quantity": nombre, "unitPrice": nombre HT, "vatRate": nombre en % }.
                   Tableau vide [] si non détaillées.
- "subtotal"     : total HT. Nombre (point décimal, sans symbole). null si absent.
- "vatTotal"     : total TVA. Nombre. null si absent.
- "total"        : total TTC. Nombre. null si absent.
- "paymentTerms" : conditions de paiement. string ou null.
- "mentions"     : mentions/références figurant sur la facture (n° commande, contrat…). string ou null.
- "confidence"   : confiance globale, nombre entre 0 et 1.
- "notes"        : remarque si un élément est douteux, sinon null.
N'invente jamais : dans le doute, null.`;

async function runVision(buffers, prompt) {
  if (!Array.isArray(buffers) || buffers.length === 0) throw new Error('Aucun fichier fourni.');
  const mediaBlocks = await Promise.all(buffers.map(buildMediaBlock));
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: [...mediaBlocks, { type: 'text', text: prompt }] }],
  });
  const rawText = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return { parsed: safeParseJson(rawText), raw: rawText, usage: resp.usage, model: MODEL };
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

async function extractContract(buffers) {
  const { parsed, raw, usage, model } = await runVision(buffers, CONTRACT_PROMPT);
  return {
    data: {
      reference: parsed.reference ?? null,
      title: parsed.title ?? null,
      object: parsed.object ?? null,
      clientName: parsed.clientName ?? null,
      providerName: parsed.providerName ?? null,
      startDate: parsed.startDate ?? null,
      endDate: parsed.endDate ?? null,
      value: num(parsed.value),
      currency: parsed.currency ?? null,
      paymentTerms: parsed.paymentTerms ?? null,
      mentions: parsed.mentions ?? null,
      noticePeriod: parsed.noticePeriod ?? null,
      confidence: num(parsed.confidence),
      notes: parsed.notes ?? null,
    },
    model, usage, raw,
  };
}

async function extractOrder(buffers) {
  const { parsed, raw, usage, model } = await runVision(buffers, ORDER_PROMPT);
  return {
    data: {
      number: parsed.number ?? null,
      date: parsed.date ?? null,
      clientName: parsed.clientName ?? null,
      description: parsed.description ?? null,
      amount: num(parsed.amount),
      currency: parsed.currency ?? null,
      paymentTerms: parsed.paymentTerms ?? null,
      mentions: parsed.mentions ?? null,
      confidence: num(parsed.confidence),
      notes: parsed.notes ?? null,
    },
    model, usage, raw,
  };
}

async function extractInvoice(buffers) {
  const { parsed, raw, usage, model } = await runVision(buffers, INVOICE_PROMPT);
  const lines = Array.isArray(parsed.lines) ? parsed.lines.map((l) => ({
    description: l.description ?? '',
    quantity: num(l.quantity) ?? 1,
    unitPrice: num(l.unitPrice) ?? 0,
    vatRate: num(l.vatRate) ?? 0,
  })) : [];
  return {
    data: {
      number: parsed.number ?? null,
      date: parsed.date ?? null,
      dueDate: parsed.dueDate ?? null,
      clientName: parsed.clientName ?? null,
      issuerName: parsed.issuerName ?? null,
      currency: parsed.currency ?? null,
      lines,
      subtotal: num(parsed.subtotal),
      vatTotal: num(parsed.vatTotal),
      total: num(parsed.total),
      paymentTerms: parsed.paymentTerms ?? null,
      mentions: parsed.mentions ?? null,
      confidence: num(parsed.confidence),
      notes: parsed.notes ?? null,
    },
    model, usage, raw,
  };
}

const SUPPLIER_INVOICE_PROMPT = `Tu analyses une FACTURE FOURNISSEUR (un ACHAT reçu par l'entreprise).
Tu peux recevoir plusieurs pages : agrège-les pour décrire UNE seule facture.
Renvoie UNIQUEMENT un objet JSON (aucun texte ni markdown autour) avec EXACTEMENT ces clés :
- "supplierName" : raison sociale du FOURNISSEUR (l'émetteur de la facture). string ou null.
- "invoiceNumber": numéro de la facture fournisseur. string ou null.
- "date"         : date d'émission, ISO "YYYY-MM-DD". null si absent.
- "dueDate"      : date d'échéance, ISO "YYYY-MM-DD". null si absent.
- "currency"     : code ISO 4217 (EUR, USD, MUR…). null si incertain.
- "subtotal"     : total HT. Nombre (point décimal, sans symbole). null si absent.
- "vatTotal"     : total TVA. Nombre. null si absent.
- "total"        : total TTC. Nombre. null si absent.
- "category"     : nature de l'achat (ex : prestation, télécom, fournitures, logiciel…). string ou null.
- "confidence"   : confiance globale, nombre entre 0 et 1.
- "notes"        : remarque si un élément est douteux, sinon null.
N'invente jamais : dans le doute, null.`;

async function extractSupplierInvoice(buffers) {
  const { parsed, raw, usage, model } = await runVision(buffers, SUPPLIER_INVOICE_PROMPT);
  return {
    data: {
      supplierName: parsed.supplierName ?? null,
      invoiceNumber: parsed.invoiceNumber ?? null,
      date: parsed.date ?? null,
      dueDate: parsed.dueDate ?? null,
      currency: parsed.currency ?? null,
      subtotal: num(parsed.subtotal),
      vatTotal: num(parsed.vatTotal),
      total: num(parsed.total),
      category: parsed.category ?? null,
      confidence: num(parsed.confidence),
      notes: parsed.notes ?? null,
    },
    model, usage, raw,
  };
}

module.exports = { extractContract, extractOrder, extractInvoice, extractSupplierInvoice };
