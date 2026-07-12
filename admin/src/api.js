// src/api.js — client HTTP du backend (auth JWT + CRUD générique).
import { API_BASE_URL } from './config';

export async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(API_BASE_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

export const getAccountingStandards = (token, country) =>
  apiRequest(`/accounting/standards${country ? `?country=${encodeURIComponent(country)}` : ''}`, { token });

// --- Charges (dépenses) ---
export const bulkImportExpenses = (body, token) => apiRequest('/expenses/bulk', { method: 'POST', token, body });

// Import d'historique de factures fournisseurs (achats → charges)
export const importSupplierInvoices = (body, token) => apiRequest('/expenses/import-supplier-invoices', { method: 'POST', token, body });
export async function ocrSupplierInvoice(file, token) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE_URL}/expenses/supplier-ocr`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}
export const listExpenses = (params, token) => apiRequest(`/expenses${params ? `?${params}` : ''}`, { token });
export const deleteExpense = (id, token) => apiRequest(`/expenses/${id}`, { method: 'DELETE', token });

// --- Grand Livre ---
export const generateLedger = (body, token) => apiRequest('/ledger/generate', { method: 'POST', token, body });
export const refreshLedger = (body, token) => apiRequest('/ledger/refresh', { method: 'POST', token, body });
export const saveLedger = (body, token) => apiRequest('/ledger/save', { method: 'POST', token, body });
export const ledgerStatus = (params, token) => apiRequest(`/ledger/status?${params}`, { token });
export const listLedgerDrafts = (company, token) =>
  apiRequest(`/ledger/drafts${company ? `?company=${encodeURIComponent(company)}` : ''}`, { token });
export const listLedger = (params, token) => apiRequest(`/ledger?${params}`, { token });
export const getLedgerEntry = (id, token) => apiRequest(`/ledger/${id}`, { token });
export const rejectLedger = (sourceKey, token) => apiRequest('/ledger/reject', { method: 'POST', token, body: { sourceKey } });
export const restoreLedger = (sourceKey, token) => apiRequest('/ledger/restore', { method: 'POST', token, body: { sourceKey } });
export const ledgerReport = (params, token) => apiRequest(`/ledger/reports/summary?${params}`, { token });

// --- Factures ---
export const listInvoices = (token, params = '') => apiRequest(`/invoices${params}`, { token });
export const getInvoice = (id, token) => apiRequest(`/invoices/${id}`, { token });
export const createInvoice = (body, token) => apiRequest('/invoices', { method: 'POST', token, body });
export const updateInvoice = (id, body, token) => apiRequest(`/invoices/${id}`, { method: 'PATCH', token, body });
export const issueInvoice = (id, token) => apiRequest(`/invoices/${id}/issue`, { method: 'POST', token });
export const setInvoiceStatus = (id, status, token) => apiRequest(`/invoices/${id}/status`, { method: 'POST', token, body: { status } });
export const deleteInvoice = (id, token) => apiRequest(`/invoices/${id}`, { method: 'DELETE', token });

// Import d'historique de factures de vente
export const importInvoices = (body, token) => apiRequest('/invoices/import', { method: 'POST', token, body });
export const bulkDeleteInvoices = (ids, token) => apiRequest('/invoices/bulk-delete', { method: 'POST', token, body: { ids } });
export const saveInvoiceMeta = (id, body, token) => apiRequest(`/invoices/${id}/meta`, { method: 'POST', token, body });
export async function ocrInvoice(file, token) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE_URL}/invoices/ocr`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

// --- Devis ---
export const listQuotes = (token, params = '') => apiRequest(`/quotes${params}`, { token });
export const getQuote = (id, token) => apiRequest(`/quotes/${id}`, { token });
export const createQuote = (body, token) => apiRequest('/quotes', { method: 'POST', token, body });
export const updateQuote = (id, body, token) => apiRequest(`/quotes/${id}`, { method: 'PATCH', token, body });
export const issueQuote = (id, token) => apiRequest(`/quotes/${id}/issue`, { method: 'POST', token });
export const setQuoteStatus = (id, status, token) => apiRequest(`/quotes/${id}/status`, { method: 'POST', token, body: { status } });
export const convertQuote = (id, token) => apiRequest(`/quotes/${id}/convert`, { method: 'POST', token });
export const deleteQuote = (id, token) => apiRequest(`/quotes/${id}`, { method: 'DELETE', token });

export const login = (email, password) =>
  apiRequest('/auth/login', { method: 'POST', body: { email, password } });

// CRUD générique par ressource ('companies' | 'clients' | 'suppliers').
export const listResource = (resource, token) => apiRequest(`/${resource}?all=1`, { token });
export const createResource = (resource, body, token) => apiRequest(`/${resource}`, { method: 'POST', token, body });
export const updateResource = (resource, id, body, token) => apiRequest(`/${resource}/${id}`, { method: 'PATCH', token, body });
export const deleteResource = (resource, id, token) => apiRequest(`/${resource}/${id}`, { method: 'DELETE', token });
// Catalogue produits actifs (pour les lignes de devis/factures)
export const listProducts = (token) => apiRequest('/products', { token });
export async function uploadProductImage(id, file, token) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE_URL}/products/${id}/image`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}
export const getProductImageUrl = (id, token) => apiRequest(`/products/${id}/image/url`, { token });
export const deleteProductImage = (id, token) => apiRequest(`/products/${id}/image`, { method: 'DELETE', token });

// --- Comptes rendus d'activité (CRA) ---
export const listCras = (token, params = '') => apiRequest(`/cra${params}`, { token });
export const getCra = (id, t) => apiRequest(`/cra/${id}`, { token: t });
export const createCra = (b, t) => apiRequest('/cra', { method: 'POST', token: t, body: b });
export const updateCra = (id, b, t) => apiRequest(`/cra/${id}`, { method: 'PATCH', token: t, body: b });
export const submitCra = (id, t) => apiRequest(`/cra/${id}/submit`, { method: 'POST', token: t });
export const approveCra = (id, note, t) => apiRequest(`/cra/${id}/approve`, { method: 'POST', token: t, body: { note } });
export const rejectCra = (id, note, t) => apiRequest(`/cra/${id}/reject`, { method: 'POST', token: t, body: { note } });
export const reopenCra = (id, t) => apiRequest(`/cra/${id}/reopen`, { method: 'POST', token: t });
export const invoiceCra = (id, t) => apiRequest(`/cra/${id}/invoice`, { method: 'POST', token: t });
export const deleteCra = (id, t) => apiRequest(`/cra/${id}`, { method: 'DELETE', token: t });

// --- Comptes rendus d'activité (fin) ---

// --- Contrats / avenants / commandes ---
export const listContracts = (token) => apiRequest('/contracts?all=1', { token });
export const createContract = (b, t) => apiRequest('/contracts', { method: 'POST', token: t, body: b });
export const updateContract = (id, b, t) => apiRequest(`/contracts/${id}`, { method: 'PATCH', token: t, body: b });
export const deleteContract = (id, t) => apiRequest(`/contracts/${id}`, { method: 'DELETE', token: t });

export const listAvenants = (contractId, t) => apiRequest(`/avenants?all=1&contract=${contractId}`, { token: t });
export const createAvenant = (b, t) => apiRequest('/avenants', { method: 'POST', token: t, body: b });
export const updateAvenant = (id, b, t) => apiRequest(`/avenants/${id}`, { method: 'PATCH', token: t, body: b });
export const deleteAvenant = (id, t) => apiRequest(`/avenants/${id}`, { method: 'DELETE', token: t });

export const listOrders = (contractId, t) => apiRequest(`/orders?all=1&contract=${contractId}`, { token: t });
export const listAllOrders = (t) => apiRequest('/orders?all=1', { token: t });
export const getOrderPrefill = (id, t) => apiRequest(`/orders/${id}/prefill`, { token: t });
export const createOrder = (b, t) => apiRequest('/orders', { method: 'POST', token: t, body: b });
export const updateOrder = (id, b, t) => apiRequest(`/orders/${id}`, { method: 'PATCH', token: t, body: b });
export const deleteOrder = (id, t) => apiRequest(`/orders/${id}`, { method: 'DELETE', token: t });

// OCR d'un document (contrat/avenant → /contracts/ocr ; commande → /orders/ocr)
export async function ocrDocument(resource, file, token) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE_URL}/${resource}/ocr`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

// --- Pièces jointes (clients & fournisseurs) ---
export async function uploadAttachment(resource, id, file, meta, token) {
  const fd = new FormData();
  fd.append('file', file);
  if (meta && meta.kind) fd.append('kind', meta.kind);
  if (meta && meta.label) fd.append('label', meta.label);
  const res = await fetch(`${API_BASE_URL}/${resource}/${id}/attachments`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token }, // pas de Content-Type : le navigateur fixe la boundary
    body: fd,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

export const getAttachmentUrl = (resource, id, key, token) =>
  apiRequest(`/${resource}/${id}/attachments/url?key=${encodeURIComponent(key)}`, { token });

export const deleteAttachment = (resource, id, key, token) =>
  apiRequest(`/${resource}/${id}/attachments?key=${encodeURIComponent(key)}`, { method: 'DELETE', token });

// --- Relevés bancaires ---
export const listBankTransactions = (params, token) => {
  const qs = new URLSearchParams(params || {}).toString();
  return apiRequest('/bank/transactions' + (qs ? `?${qs}` : ''), { token });
};
export const bulkImportBank = (body, token) => apiRequest('/bank/transactions/bulk', { method: 'POST', token, body });
export const deleteBankTransaction = (id, token) => apiRequest(`/bank/transactions/${id}`, { method: 'DELETE', token });
export const deleteBankImport = (batch, token) => apiRequest(`/bank/imports/${batch}`, { method: 'DELETE', token });

export const getBankMatches = (id, token) => apiRequest(`/bank/transactions/${id}/matches`, { token });
export const reconcileBank = (id, body, token) => apiRequest(`/bank/transactions/${id}/reconcile`, { method: 'POST', token, body });
export const unreconcileBank = (id, token) => apiRequest(`/bank/transactions/${id}/unreconcile`, { method: 'POST', token });
export const getInternalCategories = (token) => apiRequest('/bank/internal-categories', { token });

// Analyse un relevé PDF/image via l'IA → { transactions, model, usage }
export async function parseBankFile(file, token) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE_URL}/bank/parse`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

// --- Fiches de paie ---
export const listPayslips = (token, params) => apiRequest('/payslips' + (params || ''), { token });
export const getPayslip = (id, t) => apiRequest('/payslips/' + id, { token: t });
export const createPayslip = (b, t) => apiRequest('/payslips', { method: 'POST', token: t, body: b });
export const updatePayslip = (id, b, t) => apiRequest('/payslips/' + id, { method: 'PATCH', token: t, body: b });
export const finalizePayslip = (id, t) => apiRequest('/payslips/' + id + '/finalize', { method: 'POST', token: t });
export const reopenPayslip = (id, t) => apiRequest('/payslips/' + id + '/reopen', { method: 'POST', token: t });
export const deletePayslip = (id, t) => apiRequest('/payslips/' + id, { method: 'DELETE', token: t });
export const defaultPayslipContributions = (b, t) => apiRequest('/payslips/default-contributions', { method: 'POST', token: t, body: b });

// --- Logo societe ---
export async function uploadCompanyLogo(id, file, token) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(API_BASE_URL + '/companies/' + id + '/image', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd,
  });
  if (!res.ok) throw new Error(((await res.json().catch(function () { return {}; })).error) || 'Upload echoue');
  return res.json();
}
export const getCompanyLogoUrl = (id, token) => apiRequest('/companies/' + id + '/image/url', { token });
export const deleteCompanyLogo = (id, token) => apiRequest('/companies/' + id + '/image', { method: 'DELETE', token });

// --- Simulations d'impot ---
export const listSimulations = (kind, token) => apiRequest('/simulations' + (kind ? '?kind=' + kind : ''), { token });
export const getSimulation = (id, t) => apiRequest('/simulations/' + id, { token: t });
export const createSimulation = (b, t) => apiRequest('/simulations', { method: 'POST', token: t, body: b });
export const updateSimulation = (id, b, t) => apiRequest('/simulations/' + id, { method: 'PATCH', token: t, body: b });
export const deleteSimulation = (id, t) => apiRequest('/simulations/' + id, { method: 'DELETE', token: t });
export const simulationDefaults = (b, t) => apiRequest('/simulations/defaults', { method: 'POST', token: t, body: b });
export const simulationPrefill = (b, t) => apiRequest('/simulations/prefill', { method: 'POST', token: t, body: b });

// --- PAYE calcule (bareme MRA) ---
export const computePaye = (b, t) => apiRequest('/payslips/compute-paye', { method: 'POST', token: t, body: b });

// --- Compte & droits ---
export const me = (token) => apiRequest('/auth/me', { token });
export const changeMyPassword = (body, token) => apiRequest('/auth/password', { method: 'POST', token, body });

// --- Administration : utilisateurs & groupes ---
export const listAdminResources = (token) => apiRequest('/admin/resources', { token });
export const listGroups = (token) => apiRequest('/admin/groups', { token });
export const createGroup = (body, token) => apiRequest('/admin/groups', { method: 'POST', token, body });
export const updateGroup = (id, body, token) => apiRequest('/admin/groups/' + id, { method: 'PATCH', token, body });
export const deleteGroup = (id, token) => apiRequest('/admin/groups/' + id, { method: 'DELETE', token });
export const listUsers = (token) => apiRequest('/admin/users', { token });
export const createUser = (body, token) => apiRequest('/admin/users', { method: 'POST', token, body });
export const updateUser = (id, body, token) => apiRequest('/admin/users/' + id, { method: 'PATCH', token, body });
export const deleteUser = (id, token) => apiRequest('/admin/users/' + id, { method: 'DELETE', token });
export const resetUserPassword = (id, password, token) => apiRequest('/admin/users/' + id + '/password', { method: 'POST', token, body: { password } });
