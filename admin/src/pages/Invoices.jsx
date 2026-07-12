// src/pages/Invoices.jsx — factures : liste, éditeur de lignes, émission, vue imprimable.
import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useAuth } from '../auth';
import {
  listResource, listProducts, listInvoices, createInvoice, updateInvoice,
  issueInvoice, setInvoiceStatus, deleteInvoice, listAllOrders, getOrderPrefill,
  importInvoices, ocrInvoice, bulkDeleteInvoices, saveInvoiceMeta,
  listCras, listQuotes, getCompanyLogoUrl,
} from '../api';
import Modal from '../components/Modal';

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d, n) => {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const fmtMoney = (n, cur) =>
  n == null || n === '' ? '' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (cur ? ' ' + cur : '');

function totals(lines) {
  let s = 0, v = 0;
  for (const l of lines || []) {
    const ht = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
    s += ht;
    v += (ht * (Number(l.vatRate) || 0)) / 100;
  }
  const rd = (x) => Math.round(x * 100) / 100;
  return { subtotal: rd(s), vatTotal: rd(v), total: rd(s + v) };
}

function companyToIssuer(c) {
  return {
    name: c.name || null, code: c.code || null,
    address1: c.address1 || c.address || null, address2: c.address2 || null,
    postalCode: c.postalCode || c.zip || null, city: c.city || null, country: c.country || null,
    regNumber: c.regNumber || c.registration || c.reg || null,
    vatNumber: c.vatNumber || c.vat || null,
    bankAccounts: (c.bankAccounts || []).map((b) => ({
      bankName: b.bankName || b.bank || null, swift: b.swift || b.bic || null,
      iban: b.iban || null, accountNumber: b.accountNumber || b.account || null, currency: b.currency || null,
    })),
  };
}
function clientToParty(c) {
  return {
    name: c.name || null, code: c.code || null,
    address1: c.address1 || c.address || null, address2: c.address2 || null,
    postalCode: c.postalCode || c.zip || null, city: c.city || null, country: c.country || null,
    regNumber: c.regNumber || c.registration || c.reg || null,
    vatNumber: c.vatNumber || c.vat || null, bankAccounts: [],
  };
}

const STATUS = {
  draft: { label: 'Brouillon', color: '#6b7280' },
  issued: { label: 'Émise', color: '#1d4ed8' },
  paid: { label: 'Payée', color: '#166534' },
  cancelled: { label: 'Annulée', color: '#b91c1c' },
};

function blankInvoice() {
  return {
    issuerCompany: '', issuer: {}, clientId: '', client: {},
    date: today(), dueDate: plusDays(today(), 30), currency: 'EUR',
    lines: [{ description: '', quantity: 1, unitPrice: 0, vatRate: 0 }],
    notes: '', paymentTerms: 'Paiement à 30 jours.', status: 'draft',
    orderId: '', orderNumber: '', contractId: '', mentions: '',
  };
}

export default function Invoices() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [clients, setClients] = useState([]);
  const [edit, setEdit] = useState(null);
  const [printInv, setPrintInv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cras, setCras] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [metaBusy, setMetaBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [filterCompany, setFilterCompany] = useState('');
  const [colFilter, setColFilter] = useState({ number: '', issuer: '', client: '', date: '', total: '', status: '' });
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(() => new Set());

  const load = async () => {
    setLoading(true);
    try {
      const r = await listInvoices(token);
      setItems(r.items || []);
    } catch (e) { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    (async () => {
      try { setCompanies((await listResource('companies', token)).items || []); } catch (e) { /* */ }
      try { setClients((await listResource('clients', token)).items || []); } catch (e) { /* */ }
      try { setProducts((await listProducts(token)).items || []); } catch (e) { /* */ }
      try { setOrders((await listAllOrders(token)).items || []); } catch (e) { /* */ }
      try { setCras((await listCras(token)).items || []); } catch (e) { /* */ }
      try { setQuotes((await listQuotes(token)).items || []); } catch (e) { /* */ }
      try { setSuppliers((await listResource('suppliers', token)).items || []); } catch (e) { /* */ }
    })();
  }, []);

  const issuerOptions = Array.from(new Set(items.map((i) => i.issuerCompany).filter(Boolean))).sort();
  const inc = (v, f) => !f || String(v ?? '').toLowerCase().includes(String(f).toLowerCase());
  const totalStr = (i) => `${i.total ?? ''}${i.currency ? ' ' + i.currency : ''}`;
  const statusLabel = (i) => (STATUS[i.status] || {}).label || '';
  const viewItems = (() => {
    let arr = items.filter((i) =>
      (!filterCompany || i.issuerCompany === filterCompany) &&
      inc(i.number, colFilter.number) &&
      inc(i.issuerCompany, colFilter.issuer) &&
      inc(i.client?.name, colFilter.client) &&
      inc(i.date, colFilter.date) &&
      inc(totalStr(i), colFilter.total) &&
      inc(statusLabel(i), colFilter.status)
    );
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (i) => {
      switch (sortKey) {
        case 'number': return (i.number || '').toLowerCase();
        case 'issuer': return (i.issuerCompany || '').toLowerCase();
        case 'client': return (i.client?.name || '').toLowerCase();
        case 'date': return i.date || '';
        case 'total': return Number(i.total) || 0;
        case 'status': return i.status || '';
        default: return '';
      }
    };
    return arr.sort((a, b) => { const x = val(a), y = val(b); return x < y ? -dir : x > y ? dir : 0; });
  })();

  // Listes déroulantes alimentées par le contenu de chaque colonne (sur la société filtrée).
  const filterBase = items.filter((i) => !filterCompany || i.issuerCompany === filterCompany);
  const uniq = (vals) => Array.from(new Set(vals.filter((v) => v !== null && v !== undefined && v !== ''))).sort();
  const dl = {
    number: uniq(filterBase.map((i) => i.number)),
    issuer: uniq(filterBase.map((i) => i.issuerCompany)),
    client: uniq(filterBase.map((i) => i.client?.name)),
    date: uniq(filterBase.map((i) => i.date)),
    total: uniq(filterBase.map((i) => totalStr(i))),
    status: uniq(filterBase.map((i) => statusLabel(i))),
  };
  const fcell = (col) => (
    <th key={col}>
      <input list={`dl-${col}`} placeholder="filtrer" value={colFilter[col]} onChange={(e) => setColFilter({ ...colFilter, [col]: e.target.value })} style={{ width: '100%', padding: 4, fontSize: 13 }} />
      <datalist id={`dl-${col}`}>{(dl[col] || []).map((v, i) => <option key={i} value={v} />)}</datalist>
    </th>
  );

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  const sortArrow = (key) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShownSelected = viewItems.length > 0 && viewItems.every((i) => selected.has(i._id));
  const toggleSelAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allShownSelected) viewItems.forEach((i) => n.delete(i._id));
    else viewItems.forEach((i) => n.add(i._id));
    return n;
  });

  const exportRows = (list) => {
    const rows = list.map((i) => ({
      Numéro: i.number || '', Émetteur: i.issuerCompany || '', Client: i.client?.name || '',
      Date: i.date || '', Échéance: i.dueDate || '', Devise: i.currency || '',
      HT: i.subtotal ?? '', TVA: i.vatTotal ?? '', TTC: i.total ?? '', Statut: i.status || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Factures');
    XLSX.writeFile(wb, `factures_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const doExport = () => {
    const list = selected.size ? viewItems.filter((i) => selected.has(i._id)) : viewItems;
    if (!list.length) { alert('Aucune facture à exporter.'); return; }
    exportRows(list);
  };
  const doBulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!window.confirm(`Supprimer ${ids.length} facture(s) ? Action irréversible.`)) return;
    try { await bulkDeleteInvoices(ids, token); setSelected(new Set()); await load(); }
    catch (e) { alert(e.message); }
  };

  const t = edit ? totals(edit.lines) : null;

  const onIssuer = (name) => {
    const c = companies.find((x) => x.name === name);
    setEdit((e) => ({
      ...e, issuerCompany: name, issuer: c ? companyToIssuer(c) : {},
      currency: (c && c.bankAccounts && c.bankAccounts[0] && c.bankAccounts[0].currency) || e.currency || 'EUR',
    }));
  };
  const onClient = (name) => {
    const c = clients.find((x) => x.name === name);
    setEdit((e) => ({ ...e, clientId: c ? c._id : '', client: c ? clientToParty(c) : {} }));
  };
  const onOrder = async (id) => {
    if (!id) { setEdit((e) => ({ ...e, orderId: '', orderNumber: '', contractId: '', mentions: '' })); return; }
    try {
      const p = await getOrderPrefill(id, token);
      const cl = clients.find((c) => c.name === p.clientName);
      setEdit((e) => ({
        ...e,
        orderId: p.orderId, orderNumber: p.orderNumber || '', contractId: p.contractId || '',
        mentions: p.mentions || '',
        currency: p.currency || e.currency,
        client: cl ? clientToParty(cl) : (e.client && e.client.name ? e.client : { name: p.clientName }),
        clientId: cl ? cl._id : e.clientId,
        lines: (p.lines && p.lines.length) ? p.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate })) : e.lines,
      }));
    } catch (err) { alert(err.message); }
  };

  const setLine = (i, field, val) =>
    setEdit((e) => ({ ...e, lines: e.lines.map((l, j) => (j === i ? { ...l, [field]: val } : l)) }));
  const addLine = () =>
    setEdit((e) => ({ ...e, lines: [...e.lines, { description: '', quantity: 1, unitPrice: 0, vatRate: 0 }] }));
  const removeLine = (i) =>
    setEdit((e) => ({ ...e, lines: e.lines.filter((_, j) => j !== i) }));

  const addFromCatalog = (id) => {
    const p = products.find((x) => x._id === id);
    if (!p) return;
    setEdit((e) => ({
      ...e,
      lines: [...e.lines, {
        description: [p.name, p.description].filter(Boolean).join(' — '),
        quantity: 1, unitPrice: Number(p.unitPrice) || 0, vatRate: Number(p.vatRate) || 0,
      }],
      currency: e.currency || p.currency || 'EUR',
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        number: edit.number, issuerCompany: edit.issuerCompany, issuer: edit.issuer, clientId: edit.clientId, client: edit.client,
        date: edit.date, dueDate: edit.dueDate, currency: edit.currency,
        lines: edit.lines, notes: edit.notes, paymentTerms: edit.paymentTerms,
        orderId: edit.orderId, orderNumber: edit.orderNumber, contractId: edit.contractId, mentions: edit.mentions,
        subtotal: edit.subtotal, vatTotal: edit.vatTotal, total: edit.total,
      };
      const saved = edit._id ? await updateInvoice(edit._id, body, token) : await createInvoice(body, token);
      setEdit(saved);
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const saveMeta = async () => {
    if (!edit._id) { alert('Enregistrez d’abord la facture, puis renseignez les infos.'); return; }
    setMetaBusy(true);
    try {
      const body = {
        craId: edit.craId || null, craLabel: edit.craLabel || null,
        quoteId: edit.quoteId || null, quoteNumber: edit.quoteNumber || null,
        prestationDays: edit.prestationDays === '' ? null : edit.prestationDays,
        expenseReimbursement: edit.expenseReimbursement === '' ? null : edit.expenseReimbursement,
        performedById: edit.performedById || null, performedBy: edit.performedBy || null,
        taxImpact: !!edit.taxImpact, interco: !!edit.interco, intercoCompany: edit.interco ? (edit.intercoCompany || null) : null,
        noCash: !!edit.noCash, amountPaid: edit.amountPaid === '' ? null : edit.amountPaid,
      };
      const saved = await saveInvoiceMeta(edit._id, body, token);
      setEdit(saved); await load();
    } catch (e) { alert(e.message); } finally { setMetaBusy(false); }
  };
  const onCra = (id) => {
    const c = cras.find((x) => x._id === id);
    setEdit((e) => ({ ...e, craId: id,
      craLabel: c ? [c.reference, c.title, c.periodLabel || c.month].filter(Boolean).join(' · ') : '',
      prestationDays: c ? (c.productionDays ?? e.prestationDays) : e.prestationDays }));
  };
  const onQuote = (id) => { const q = quotes.find((x) => x._id === id); setEdit((e) => ({ ...e, quoteId: id, quoteNumber: q ? (q.number || '') : '' })); };
  const onPerformer = (id) => { const s = suppliers.find((x) => x._id === id); setEdit((e) => ({ ...e, performedById: id, performedBy: s ? s.name : '' })); };

  const issue = async () => {
    if (!edit._id) { alert('Enregistrez d’abord le brouillon.'); return; }
    if (!edit.issuerCompany) { alert('Choisissez la société émettrice.'); return; }
    if (!window.confirm('Émettre la facture ? Un numéro sera attribué et la facture ne sera plus modifiable.')) return;
    setBusy(true);
    try {
      const r = await issueInvoice(edit._id, token);
      setEdit(r);
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const mark = async (s) => {
    setBusy(true);
    try {
      const r = await setInvoiceStatus(edit._id, s, token);
      setEdit(r);
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer cette facture ?')) return;
    try { await deleteInvoice(id, token); await load(); } catch (e) { alert(e.message); }
  };
  const removeFromEditor = async () => {
    if (!window.confirm('Supprimer cette facture ?')) return;
    try { await deleteInvoice(edit._id, token); setEdit(null); await load(); } catch (e) { alert(e.message); }
  };

  const isDraft = edit && edit.status === 'draft';
  const editable = isDraft || (edit && edit.source === 'import');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted">{viewItems.length} / {items.length} facture(s)</span>
          <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
            <option value="">Toutes les sociétés</option>
            {issuerOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <span style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={doExport}>Exporter{selected.size ? ` (${selected.size})` : ''}</button>
          <button className="btn" onClick={() => setShowImport(true)}>Importer l’historique</button>
          <button className="btn btn-primary" onClick={() => setEdit(blankInvoice())}>+ Nouvelle facture</button>
        </span>
      </div>

      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: '#faf3f5', borderRadius: 8 }}>
          <strong>{selected.size} sélectionnée(s)</strong>
          <button className="btn btn-danger" onClick={doBulkDelete}>Supprimer la sélection</button>
          <button className="btn" onClick={doExport}>Exporter la sélection</button>
          <button className="btn btn-ghost" onClick={() => setSelected(new Set())}>Tout désélectionner</button>
        </div>
      )}

      {showImport && (
        <ImportModal token={token} companies={companies} onClose={() => setShowImport(false)} onDone={async () => { setShowImport(false); await load(); }} />
      )}

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="muted">Aucune facture pour l’instant.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 32 }}><input type="checkbox" checked={allShownSelected} onChange={toggleSelAll} /></th>
              <th className="clickable" onClick={() => toggleSort('number')}>Numéro{sortArrow('number')}</th>
              <th className="clickable" onClick={() => toggleSort('issuer')}>Émetteur{sortArrow('issuer')}</th>
              <th className="clickable" onClick={() => toggleSort('client')}>Client{sortArrow('client')}</th>
              <th className="clickable" onClick={() => toggleSort('date')}>Date{sortArrow('date')}</th>
              <th className="clickable" style={{ textAlign: 'right' }} onClick={() => toggleSort('total')}>Total{sortArrow('total')}</th>
              <th className="clickable" onClick={() => toggleSort('status')}>Statut{sortArrow('status')}</th>
              <th></th>
            </tr>
            <tr>
              <th></th>
              {fcell('number')}
              {fcell('issuer')}
              {fcell('client')}
              {fcell('date')}
              {fcell('total')}
              {fcell('status')}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {viewItems.map((inv) => {
              const st = STATUS[inv.status] || STATUS.draft;
              return (
                <tr key={inv._id} className="clickable" onClick={() => setEdit(inv)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(inv._id)} onChange={() => toggleSel(inv._id)} /></td>
                  <td>{inv.number || <span className="muted">— brouillon</span>}{inv.source === 'import' && <span className="muted" style={{ fontSize: 11 }}> · importée</span>}</td>
                  <td>{inv.issuerCompany || '—'}</td>
                  <td>{inv.client?.name || '—'}</td>
                  <td>{inv.date || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(inv.total, inv.currency)}</td>
                  <td><span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span></td>
                  <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost" onClick={() => setPrintInv(inv)}>Voir</button>{' '}
                    <button className="link-danger" onClick={() => remove(inv._id)} title="Supprimer">×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {edit && (
        <Modal title={edit.number ? `Facture ${edit.number}` : (edit._id ? 'Brouillon' : 'Nouvelle facture')} onClose={() => setEdit(null)}>
          {!isDraft && (
            <div style={{ marginBottom: 14, padding: 10, background: '#f8f7f8', borderRadius: 8 }}>
              <span style={{ color: (STATUS[edit.status] || {}).color, fontWeight: 600 }}>{(STATUS[edit.status] || {}).label}</span>
              {edit.source === 'import' ? ' · Facture importée — modifiable, puis Enregistrer.' : ' · Facture verrouillée. Annulez-la pour la modifier.'}
            </div>
          )}

          {editable && edit.source === 'import' && (
            <div className="field"><label>Numéro de facture (importée)</label>
              <input type="text" value={edit.number || ''} onChange={(e) => setEdit({ ...edit, number: e.target.value })} />
            </div>
          )}

          <div className="grid2">
            <div className="field">
              <label>Société émettrice</label>
              <select value={edit.issuerCompany} disabled={!editable} onChange={(e) => onIssuer(e.target.value)}>
                <option value="">— choisir —</option>
                {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Client</label>
              <select value={edit.client?.name || ''} disabled={!editable} onChange={(e) => onClient(e.target.value)}>
                <option value="">— choisir —</option>
                {clients.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid2">
            <div className="field"><label>Date</label><input type="date" value={edit.date || ''} disabled={!editable} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></div>
            <div className="field"><label>Échéance</label><input type="date" value={edit.dueDate || ''} disabled={!editable} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} /></div>
          </div>
          <div className="field" style={{ maxWidth: 160 }}>
            <label>Devise</label>
            <input type="text" value={edit.currency || ''} disabled={!editable} onChange={(e) => setEdit({ ...edit, currency: e.target.value.toUpperCase() })} />
          </div>

          <div className="field">
            <label>Commande rattachée (reprend lignes + mentions)</label>
            <select value={edit.orderId || ''} disabled={!editable} onChange={(e) => onOrder(e.target.value)}>
              <option value="">— aucune —</option>
              {orders.map((o) => (
                <option key={o._id} value={o._id}>{[o.clientName, o.number || o.name, o.amount ? `${o.amount} ${o.currency || ''}` : ''].filter(Boolean).join(' · ')}</option>
              ))}
            </select>
          </div>

          <div className="fieldlist">
            <div className="fieldlist-head">
            <span>Lignes</span>
            {editable && (
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {products.length > 0 && (
                  <select value="" onChange={(e) => addFromCatalog(e.target.value)} style={{ maxWidth: 240 }}>
                    <option value="">+ depuis le catalogue…</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>{p.name}{p.unitPrice ? ` — ${p.unitPrice} ${p.currency || ''}` : ''}</option>
                    ))}
                  </select>
                )}
                <button className="btn btn-ghost" onClick={addLine}>+ Ligne</button>
              </span>
            )}
          </div>
            {edit.lines.map((l, i) => {
              const ht = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
              return (
                <div key={i} style={{ borderBottom: '1px solid #f0eef0', paddingBottom: 8, marginBottom: 8 }}>
                  <input style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, marginBottom: 6 }}
                    placeholder="Description" value={l.description} disabled={!editable}
                    onChange={(e) => setLine(i, 'description', e.target.value)} />
                  <div className="fieldlist-row" style={{ marginBottom: 0 }}>
                    <input style={{ flex: '0 0 70px' }} type="number" step="any" placeholder="Qté" value={l.quantity} disabled={!editable} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
                    <input style={{ flex: '1 1 110px' }} type="number" step="any" placeholder="P.U." value={l.unitPrice} disabled={!editable} onChange={(e) => setLine(i, 'unitPrice', e.target.value)} />
                    <input style={{ flex: '0 0 80px' }} type="number" step="any" placeholder="TVA %" value={l.vatRate} disabled={!editable} onChange={(e) => setLine(i, 'vatRate', e.target.value)} />
                    <span style={{ flex: '1 1 100px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(ht, edit.currency)}</span>
                    {editable && <button className="link-danger" onClick={() => removeLine(i)} title="Retirer">×</button>}
                  </div>
                </div>
              );
            })}
            {editable && edit.lines.length === 0 ? (
              <div style={{ marginTop: 8 }}>
                <p className="muted" style={{ margin: '0 0 6px' }}>Aucune ligne détaillée — montants saisis directement :</p>
                <div className="grid2">
                  <div className="field"><label>Sous-total HT</label><input type="number" step="any" value={edit.subtotal ?? ''} onChange={(e) => setEdit({ ...edit, subtotal: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                  <div className="field"><label>TVA</label><input type="number" step="any" value={edit.vatTotal ?? ''} onChange={(e) => setEdit({ ...edit, vatTotal: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                </div>
                <div className="field" style={{ maxWidth: 240 }}><label>Total TTC</label><input type="number" step="any" value={edit.total ?? ''} onChange={(e) => setEdit({ ...edit, total: e.target.value === '' ? null : Number(e.target.value) })} /></div>
              </div>
            ) : (
              <div style={{ textAlign: 'right', marginTop: 8, lineHeight: 1.7 }}>
                <div>Sous-total HT : <strong>{fmtMoney(t.subtotal, edit.currency)}</strong></div>
                <div>TVA : <strong>{fmtMoney(t.vatTotal, edit.currency)}</strong></div>
                <div style={{ fontSize: 18, color: 'var(--primary)' }}>Total TTC : <strong>{fmtMoney(t.total, edit.currency)}</strong></div>
              </div>
            )}
          </div>

          <div className="field"><label>Conditions de paiement</label><input type="text" value={edit.paymentTerms || ''} disabled={!editable} onChange={(e) => setEdit({ ...edit, paymentTerms: e.target.value })} /></div>
          <div className="field"><label>Notes</label><input type="text" value={edit.notes || ''} disabled={!editable} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
          <div className="field"><label>Mentions obligatoires (contrat / commande)</label>
            <textarea rows="2" value={edit.mentions || ''} disabled={!editable} onChange={(e) => setEdit({ ...edit, mentions: e.target.value })}
              style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, resize: 'vertical' }} />
          </div>

          {edit._id && (
            <div className="card-block" style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong>Informations complémentaires</strong>
                <button className="btn btn-primary" onClick={saveMeta} disabled={metaBusy}>{metaBusy ? 'Enregistrement…' : 'Enregistrer les infos'}</button>
              </div>
              <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>Ces informations de gestion sont modifiables quel que soit le statut de la facture.</p>
              <div className="grid2">
                <div className="field"><label>CRA rattaché</label>
                  <select value={edit.craId || ''} onChange={(e) => onCra(e.target.value)}>
                    <option value="">— aucun —</option>
                    {cras.map((c) => <option key={c._id} value={c._id}>{[c.reference, c.title, c.periodLabel || c.month, c.person].filter(Boolean).join(' · ') || c._id}</option>)}
                  </select>
                </div>
                <div className="field"><label>Devis rattaché</label>
                  <select value={edit.quoteId || ''} onChange={(e) => onQuote(e.target.value)}>
                    <option value="">— aucun —</option>
                    {quotes.map((q) => <option key={q._id} value={q._id}>{[q.number, q.client?.name].filter(Boolean).join(' · ') || q._id}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid2">
                <div className="field"><label>Jours de prestation{edit.craId ? ' (CRA)' : ''}</label><input type="number" step="any" value={edit.prestationDays ?? ''} onChange={(e) => setEdit({ ...edit, prestationDays: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
                <div className="field"><label>Remboursement de frais{edit.currency ? ` (${edit.currency})` : ''}</label><input type="number" step="any" value={edit.expenseReimbursement ?? ''} onChange={(e) => setEdit({ ...edit, expenseReimbursement: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
              </div>
              <div className="grid2">
                <div className="field"><label>Réalisé par (fournisseur)</label>
                  <select value={edit.performedById || ''} onChange={(e) => onPerformer(e.target.value)}>
                    <option value="">— aucun —</option>
                    {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="field"><label>Montant encaissé (rapprochement)</label><input type="number" step="any" value={edit.amountPaid ?? ''} onChange={(e) => setEdit({ ...edit, amountPaid: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
              </div>
              <div className="grid2">
                <div className="field"><label>Tax impact</label>
                  <select value={edit.taxImpact ? 'yes' : 'no'} onChange={(e) => setEdit({ ...edit, taxImpact: e.target.value === 'yes' })}><option value="no">Non</option><option value="yes">Oui</option></select>
                </div>
                <div className="field"><label>No cash</label>
                  <select value={edit.noCash ? 'yes' : 'no'} onChange={(e) => setEdit({ ...edit, noCash: e.target.value === 'yes' })}><option value="no">Non</option><option value="yes">Oui</option></select>
                </div>
              </div>
              <div className="grid2">
                <div className="field"><label>Interco</label>
                  <select value={edit.interco ? 'yes' : 'no'} onChange={(e) => setEdit({ ...edit, interco: e.target.value === 'yes' })}><option value="no">Non</option><option value="yes">Oui</option></select>
                </div>
                {edit.interco && (
                  <div className="field"><label>Société destinataire (interco)</label>
                    <select value={edit.intercoCompany || ''} onChange={(e) => setEdit({ ...edit, intercoCompany: e.target.value })}>
                      <option value="">— choisir —</option>
                      {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="modal-actions">
            {edit._id && <button className="btn btn-danger" onClick={removeFromEditor} disabled={busy}>Supprimer</button>}
            <button className="btn btn-ghost" onClick={() => setPrintInv(edit)}>Voir / Imprimer</button>
            {editable && <button className="btn" onClick={save} disabled={busy}>Enregistrer</button>}
            {isDraft && <button className="btn btn-primary" onClick={issue} disabled={busy}>Émettre</button>}
            {!isDraft && edit.status === 'issued' && <button className="btn btn-primary" onClick={() => mark('paid')} disabled={busy}>Marquer payée</button>}
            {!isDraft && edit.status !== 'cancelled' && <button className="btn" onClick={() => mark('cancelled')} disabled={busy}>Annuler la facture</button>}
          </div>
        </Modal>
      )}

      {printInv && <InvoicePrint inv={printInv} companies={companies} token={token} onClose={() => setPrintInv(null)} />}
    </div>
  );
}

function InvoicePrint({ inv, companies, token, onClose }) {
  const t = (inv.lines && inv.lines.length) ? totals(inv.lines) : { subtotal: inv.subtotal || 0, vatTotal: inv.vatTotal || 0, total: inv.total || 0 };
  const cur = inv.currency;
  const issuer = inv.issuer || {};
  const client = inv.client || {};
  const addr = (p) => [p.address1, p.address2, [p.postalCode, p.city].filter(Boolean).join(' '), p.country].filter(Boolean);
  const [logoUrl, setLogoUrl] = useState(null);
  useEffect(() => {
    let on = true;
    const c = (companies || []).find((x) => x.name === inv.issuerCompany);
    if (c && c._id && c.imageKey) {
      getCompanyLogoUrl(c._id, token).then((r) => { if (on) setLogoUrl(r.url); }).catch(() => { if (on) setLogoUrl(null); });
    } else { setLogoUrl(null); }
    return () => { on = false; };
  }, [companies]);

  return (
    <div className="print-overlay">
      <div className="print-toolbar no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>Imprimer / Enregistrer en PDF</button>
        <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
      </div>
      <div className="invoice-print">
        <div className="inv-head">
          <div className="inv-issuer">
            {logoUrl && <img src={logoUrl} alt="" className="inv-logo" style={{ maxHeight: 60, maxWidth: 200, objectFit: 'contain', display: 'block', marginBottom: 8 }} />}
            <div className="inv-name">{issuer.name || '—'}</div>
            {addr(issuer).map((l, i) => <div key={i}>{l}</div>)}
            {issuer.regNumber && <div>Reg. : {issuer.regNumber}</div>}
            {issuer.vatNumber && <div>TVA : {issuer.vatNumber}</div>}
          </div>
          <div className="inv-meta">
            <h1>FACTURE</h1>
            <div><strong>{inv.number || 'BROUILLON'}</strong></div>
            <div>Date : {inv.date || '—'}</div>
            {inv.dueDate && <div>Échéance : {inv.dueDate}</div>}
            {inv.orderNumber && <div>Commande : {inv.orderNumber}</div>}
          </div>
        </div>

        <div className="inv-billto">
          <div className="inv-label">Facturé à</div>
          <div className="inv-name">{client.name || '—'}</div>
          {addr(client).map((l, i) => <div key={i}>{l}</div>)}
          {client.vatNumber && <div>TVA : {client.vatNumber}</div>}
        </div>

        <table className="inv-table">
          <thead>
            <tr><th>Description</th><th className="r">Qté</th><th className="r">P.U.</th><th className="r">TVA</th><th className="r">Montant HT</th></tr>
          </thead>
          <tbody>
            {(inv.lines || []).map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td className="r">{l.quantity}</td>
                <td className="r">{fmtMoney(l.unitPrice, cur)}</td>
                <td className="r">{(Number(l.vatRate) || 0)} %</td>
                <td className="r">{fmtMoney((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-totals">
          <div><span>Sous-total HT</span><span>{fmtMoney(t.subtotal, cur)}</span></div>
          <div><span>TVA</span><span>{fmtMoney(t.vatTotal, cur)}</span></div>
          <div className="grand"><span>Total TTC</span><span>{fmtMoney(t.total, cur)}</span></div>
        </div>

        {inv.mentions && (
          <div className="inv-foot" style={{ marginTop: 8 }}>
            <strong>Mentions obligatoires :</strong>
            {inv.mentions.split('\n').map((m, i) => <div key={i}>{m}</div>)}
          </div>
        )}

        {(inv.paymentTerms || (issuer.bankAccounts && issuer.bankAccounts.length) || inv.notes) && (
          <div className="inv-foot">
            {inv.paymentTerms && <div>{inv.paymentTerms}</div>}
            {issuer.bankAccounts && issuer.bankAccounts.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <strong>Coordonnées bancaires :</strong>
                {issuer.bankAccounts.map((b, i) => (
                  <div key={i}>
                    {[b.bankName, b.iban && `IBAN ${b.iban}`, b.swift && `SWIFT ${b.swift}`, b.accountNumber && `Cpte ${b.accountNumber}`, b.currency].filter(Boolean).join(' · ')}
                  </div>
                ))}
              </div>
            )}
            {inv.notes && <div style={{ marginTop: 6 }}>{inv.notes}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Import d'historique de factures de vente ----
function parseNum(raw, sep) {
  if (raw == null || raw === '') return null;
  let s = String(raw).trim().replace(/[^\d.,-]/g, '');
  if (sep === ',') s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parseImpDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return s;
}

function ImportModal({ token, companies, onClose, onDone }) {
  const [tab, setTab] = useState('recap');
  const [issuerCompany, setIssuerCompany] = useState(companies[0] ? companies[0].name : '');
  const [status, setStatus] = useState('issued');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState(null);
  const [sep, setSep] = useState(',');

  const [aiBusy, setAiBusy] = useState(false);
  const [staged, setStaged] = useState([]);
  const [draft, setDraft] = useState(null);

  useEffect(() => { if (!issuerCompany && companies[0]) setIssuerCompany(companies[0].name); }, [companies]);

  const onFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setFileName(file.name);
    const done = (json) => {
      const hs = json.length ? Object.keys(json[0]) : [];
      setHeaders(hs); setRows(json);
      setMap({ number: hs[0] || '', date: '', client: '', currency: '', ht: '', vat: '', ttc: '' });
    };
    if (/\.csv$/i.test(file.name)) Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => done(r.data) });
    else { const rd = new FileReader(); rd.onload = (ev) => { const wb = XLSX.read(ev.target.result, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; done(XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })); }; rd.readAsArrayBuffer(file); }
  };

  const recapItems = (!map ? [] : rows.map((r) => ({
    number: r[map.number], date: parseImpDate(r[map.date]),
    clientName: map.client ? r[map.client] : null, currency: map.currency ? (r[map.currency] || null) : null,
    subtotal: map.ht ? parseNum(r[map.ht], sep) : null, vatTotal: map.vat ? parseNum(r[map.vat], sep) : null, total: map.ttc ? parseNum(r[map.ttc], sep) : null,
  })).filter((x) => x.number));

  const ColSelect = ({ field, label, optional }) => (
    <div className="field"><label>{label}{optional ? ' (opt.)' : ''}</label>
      <select value={map[field]} onChange={(e) => setMap({ ...map, [field]: e.target.value })}>
        <option value="">—</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );

  const doImport = async (itemsToImport) => {
    if (!itemsToImport.length) { alert('Aucune facture exploitable.'); return; }
    if (!issuerCompany) { alert('Choisis une société émettrice.'); return; }
    setBusy(true);
    try { const r = await importInvoices({ issuerCompany, status, items: itemsToImport }, token); setResult(r); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const analyze = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setAiBusy(true);
    try {
      const out = await ocrInvoice(file, token); const d = out.data || {};
      setDraft({ number: d.number || '', date: d.date || '', clientName: d.clientName || '', currency: d.currency || 'EUR', subtotal: d.subtotal, vatTotal: d.vatTotal, total: d.total, lines: d.lines || [], paymentTerms: d.paymentTerms || '', mentions: d.mentions || '' });
    } catch (err) { alert(err.message); } finally { setAiBusy(false); e.target.value = ''; }
  };
  const addStaged = () => { if (!draft || !draft.number) { alert('Numéro requis.'); return; } setStaged((s) => [...s, draft]); setDraft(null); };

  return (
    <Modal title="Importer l'historique de factures de vente" onClose={onClose}>
      {result ? (
        <div>
          <p style={{ color: '#166534' }}>{result.inserted} facture(s) importée(s){result.skipped ? ` · ${result.skipped} doublon(s) ignoré(s)` : ''}.</p>
          {result.errors && result.errors.length > 0 && <ul className="muted">{result.errors.slice(0, 5).map((m, i) => <li key={i}>{m}</li>)}</ul>}
          <div className="modal-actions"><button className="btn btn-primary" onClick={onDone}>Terminer</button></div>
        </div>
      ) : (
        <>
          <div className="grid2">
            <div className="field"><label>Société émettrice</label>
              <select value={issuerCompany} onChange={(e) => setIssuerCompany(e.target.value)}>
                <option value="">— choisir —</option>
                {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Statut à l'import</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="issued">Émise</option><option value="paid">Payée</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, margin: '6px 0 12px' }}>
            <button className={`btn ${tab === 'recap' ? 'btn-primary' : ''}`} onClick={() => setTab('recap')}>Récap Excel / CSV</button>
            <button className={`btn ${tab === 'pdf' ? 'btn-primary' : ''}`} onClick={() => setTab('pdf')}>PDF (OCR)</button>
          </div>

          {tab === 'recap' && (
            <>
              <div className="field"><label>Fichier récapitulatif (CSV ou Excel)</label>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} />
              </div>
              {map && (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>{fileName} · {rows.length} ligne(s). Associe les colonnes :</p>
                  <div className="grid2">
                    <ColSelect field="number" label="N° de facture" />
                    <ColSelect field="date" label="Date" />
                    <ColSelect field="client" label="Client" optional />
                    <ColSelect field="currency" label="Devise" optional />
                    <ColSelect field="ht" label="Total HT" optional />
                    <ColSelect field="vat" label="TVA" optional />
                    <ColSelect field="ttc" label="Total TTC" optional />
                  </div>
                  <div className="field" style={{ maxWidth: 220 }}><label>Séparateur décimal</label>
                    <select value={sep} onChange={(e) => setSep(e.target.value)}><option value=",">Virgule</option><option value=".">Point</option></select>
                  </div>
                  <p className="muted">Aperçu ({recapItems.length} exploitables) :</p>
                  <div style={{ overflowX: 'auto', maxWidth: '100%' }}><table className="table" style={{ boxShadow: 'none', minWidth: 460 }}>
                    <thead><tr><th>N°</th><th>Date</th><th>Client</th><th style={{ textAlign: 'right' }}>HT</th><th style={{ textAlign: 'right' }}>TVA</th><th style={{ textAlign: 'right' }}>TTC</th></tr></thead>
                    <tbody>{recapItems.slice(0, 8).map((m, i) => (
                      <tr key={i}><td>{m.number}</td><td>{m.date || '—'}</td><td>{m.clientName || '—'}</td>
                        <td style={{ textAlign: 'right' }}>{m.subtotal == null ? '—' : m.subtotal}</td><td style={{ textAlign: 'right' }}>{m.vatTotal == null ? '—' : m.vatTotal}</td><td style={{ textAlign: 'right' }}>{m.total == null ? '—' : m.total}</td></tr>
                    ))}</tbody>
                  </table></div>
                  {recapItems.length > 8 && <p className="muted">… et {recapItems.length - 8} de plus.</p>}
                  <div className="modal-actions">
                    <button className="btn btn-primary" onClick={() => doImport(recapItems)} disabled={busy || !issuerCompany}>{busy ? 'Import…' : `Importer ${recapItems.length} facture(s)`}</button>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'pdf' && (
            <>
              <div className="field" style={{ background: '#faf7f8', padding: 10, borderRadius: 8 }}>
                <label>{aiBusy ? <><span className="spinner" />Analyse OCR en cours…</> : 'Facture PDF ou image'}</label>
                <input type="file" accept="application/pdf,image/*" onChange={analyze} disabled={aiBusy} />
                <span className="muted" style={{ fontSize: 12 }}>Les champs reconnus pré-remplissent la ligne ci-dessous ; corrige puis « Ajouter ».</span>
              </div>
              {draft && (
                <div className="card-block" style={{ marginTop: 10 }}>
                  <div className="grid2">
                    <div className="field"><label>N° de facture</label><input value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} /></div>
                    <div className="field"><label>Date</label><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></div>
                  </div>
                  <div className="grid2">
                    <div className="field"><label>Client</label><input value={draft.clientName} onChange={(e) => setDraft({ ...draft, clientName: e.target.value })} /></div>
                    <div className="field"><label>Devise</label><input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></div>
                  </div>
                  <div className="grid2">
                    <div className="field"><label>Total HT</label><input type="number" step="any" value={draft.subtotal == null ? '' : draft.subtotal} onChange={(e) => setDraft({ ...draft, subtotal: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                    <div className="field"><label>Total TTC</label><input type="number" step="any" value={draft.total == null ? '' : draft.total} onChange={(e) => setDraft({ ...draft, total: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                  </div>
                  <p className="muted" style={{ margin: 0 }}>{(draft.lines || []).length} ligne(s) détaillée(s) détectée(s).</p>
                  <div className="modal-actions"><button className="btn" onClick={() => setDraft(null)}>Annuler</button><button className="btn btn-primary" onClick={addStaged}>Ajouter à la liste</button></div>
                </div>
              )}
              {staged.length > 0 && (
                <>
                  <p className="muted">{staged.length} facture(s) prête(s) :</p>
                  <div style={{ overflowX: 'auto', maxWidth: '100%' }}><table className="table" style={{ boxShadow: 'none', minWidth: 460 }}>
                    <thead><tr><th>N°</th><th>Date</th><th>Client</th><th style={{ textAlign: 'right' }}>TTC</th><th></th></tr></thead>
                    <tbody>{staged.map((m, i) => (
                      <tr key={i}><td>{m.number}</td><td>{m.date || '—'}</td><td>{m.clientName || '—'}</td><td style={{ textAlign: 'right' }}>{m.total == null ? '—' : m.total}</td>
                        <td><button className="link-danger" onClick={() => setStaged((s) => s.filter((_, j) => j !== i))}>×</button></td></tr>
                    ))}</tbody>
                  </table></div>
                  <div className="modal-actions"><button className="btn btn-primary" onClick={() => doImport(staged)} disabled={busy || !issuerCompany}>{busy ? 'Import…' : `Importer ${staged.length} facture(s)`}</button></div>
                </>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
