// src/pages/Charges.jsx — import de charges depuis Excel/CSV (mappage colonnes) + liste.
import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useAuth } from '../auth';
import { listResource, bulkImportExpenses, listExpenses, deleteExpense, importSupplierInvoices, ocrSupplierInvoice } from '../api';
import Modal from '../components/Modal';

function parseAmount(raw, decimalSep) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/\s/g, '').replace(/[€$£]/g, '');
  if (decimalSep === ',') s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return neg ? -n : n;
}
function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}
function guessColumns(headers) {
  const find = (re) => headers.find((h) => re.test(String(h).toLowerCase())) || '';
  return {
    date: find(/date|jour|valeur/),
    label: find(/libell|label|description|intitul|fournisseur|marchand|merchant|tiers|objet|nature/),
    amount: find(/montant|amount|ttc|total|prix|sum/),
    vat: find(/tva|vat|taxe/),
    currency: find(/devise|currency|monnaie|ccy/),
    type: find(/type|cat[ée]gorie|category|poste|compte/),
  };
}
const fmt = (n, c) =>
  n === null || n === undefined ? '—' : `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${c ? ' ' + c : ''}`;

export default function Charges() {
  const { token } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [map, setMap] = useState(null);
  const [decimalSep, setDecimalSep] = useState(',');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showSupplierImport, setShowSupplierImport] = useState(false);

  const loadList = async (comp = company) => {
    try {
      const r = await listExpenses(`${comp ? `company=${encodeURIComponent(comp)}&` : ''}limit=200`, token);
      setItems(r.items || []);
    } catch (e) { /* */ }
  };

  useEffect(() => {
    listResource('companies', token).then((r) => {
      const cs = r.items || [];
      setCompanies(cs);
      if (cs.length) { setCompany(cs[0].name); loadList(cs[0].name); }
    }).catch(() => {});
    listResource('suppliers', token).then((r) => setSuppliers(r.items || [])).catch(() => {});
  }, []);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const done = (hdrs, data) => {
      setHeaders(hdrs);
      setRows(data);
      setMap(guessColumns(hdrs));
    };
    if (/\.csv$/i.test(file.name)) {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: (res) => done((res.meta.fields || []).filter(Boolean), res.data || []),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        done(json.length ? Object.keys(json[0]) : [], json);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const mapped = !map ? [] : rows.map((r) => ({
    date: parseDate(r[map.date]),
    merchant: map.label ? String(r[map.label] ?? '').trim() : null,
    amount: parseAmount(r[map.amount], decimalSep),
    vat: map.vat ? parseAmount(r[map.vat], decimalSep) : null,
    currency: map.currency ? String(r[map.currency] ?? '').trim() : null,
    type: map.type ? String(r[map.type] ?? '').trim() : null,
  })).filter((x) => x.amount !== null || x.merchant);

  const doImport = async () => {
    if (!company) { alert('Choisis une société.'); return; }
    if (mapped.length === 0) { alert('Aucune ligne exploitable.'); return; }
    setBusy(true);
    try {
      const r = await bulkImportExpenses({ company, items: mapped }, token);
      setResult(r);
      setHeaders([]); setRows([]); setMap(null); setFileName('');
      await loadList();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer cette charge ?')) return;
    try { await deleteExpense(id, token); await loadList(); } catch (e) { alert(e.message); }
  };

  const ColSelect = ({ field, label, optional }) => (
    <div className="field">
      <label>{label}{optional ? ' (optionnel)' : ''}</label>
      <select value={map[field]} onChange={(e) => setMap({ ...map, [field]: e.target.value })}>
        <option value="">—</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Charges</h3>
        <button className="btn" onClick={() => setShowSupplierImport(true)}>Importer des factures fournisseurs</button>
      </div>

      {showSupplierImport && (
        <SupplierImportModal
          token={token} companies={companies} suppliers={suppliers} defaultCompany={company}
          onClose={() => setShowSupplierImport(false)}
          onDone={async () => { setShowSupplierImport(false); await loadList(); }}
        />
      )}

      <div className="card-block" style={{ marginBottom: 16 }}>
        <div className="grid2">
          <div className="field">
            <label>Société</label>
            <select value={company} onChange={(e) => { setCompany(e.target.value); loadList(e.target.value); }}>
              {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Fichier récapitulatif (CSV ou Excel)</label>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} />
          </div>
        </div>

        {map && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>{fileName} · {rows.length} ligne(s). Associe les colonnes :</p>
            <div className="grid2">
              <ColSelect field="date" label="Date" />
              <ColSelect field="label" label="Libellé / fournisseur" />
              <ColSelect field="amount" label="Montant" />
              <ColSelect field="vat" label="TVA" optional />
              <ColSelect field="currency" label="Devise" optional />
              <ColSelect field="type" label="Type / catégorie" optional />
            </div>
            <div className="field" style={{ maxWidth: 220 }}>
              <label>Séparateur décimal</label>
              <select value={decimalSep} onChange={(e) => setDecimalSep(e.target.value)}>
                <option value=",">Virgule (1 234,56)</option>
                <option value=".">Point (1,234.56)</option>
              </select>
            </div>

            <p className="muted">Aperçu ({mapped.length} ligne(s) exploitables) :</p>
            <div style={{ overflowX: 'auto', maxWidth: '100%' }}><table className="table" style={{ boxShadow: 'none', minWidth: 460 }}>
              <thead><tr><th>Date</th><th>Libellé</th><th style={{ textAlign: 'right' }}>Montant</th><th style={{ textAlign: 'right' }}>TVA</th><th>Devise</th><th>Type</th></tr></thead>
              <tbody>
                {mapped.slice(0, 8).map((m, i) => (
                  <tr key={i}>
                    <td>{m.date || '—'}</td><td>{m.merchant || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(m.amount)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(m.vat)}</td>
                    <td>{m.currency || '—'}</td><td>{m.type || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {mapped.length > 8 && <p className="muted">… et {mapped.length - 8} de plus.</p>}

            <button className="btn btn-primary" onClick={doImport} disabled={busy}>
              {busy ? 'Import…' : `Importer ${mapped.length} charge(s)`}
            </button>
          </>
        )}

        {result && (
          <p style={{ color: '#166534', marginBottom: 0 }}>
            {result.inserted} charge(s) importée(s){result.skipped ? ` · ${result.skipped} doublon(s) ignoré(s)` : ''}.
          </p>
        )}
      </div>

      <p className="muted">{items.length} charge(s) pour cette société</p>
      <table className="table">
        <thead><tr><th>Date</th><th>Libellé</th><th>Type</th><th style={{ textAlign: 'right' }}>Montant</th><th>Source</th><th></th></tr></thead>
        <tbody>
          {items.map((e) => (
            <tr key={e._id}>
              <td>{e.date || '—'}</td>
              <td>{e.merchant || e.title}</td>
              <td>{e.type || '—'}</td>
              <td style={{ textAlign: 'right' }}>{fmt(e.amount, e.currency)}</td>
              <td><span className="muted">{e.source || 'manual'}</span></td>
              <td><button className="link-danger" onClick={() => remove(e._id)} title="Supprimer">×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Import d'historique de factures FOURNISSEURS (achats → charges) ----
function SupplierImportModal({ token, companies, suppliers, defaultCompany, onClose, onDone }) {
  const [tab, setTab] = useState('recap');
  const [company, setCompany] = useState(defaultCompany || (companies[0] ? companies[0].name : ''));
  const [supplierId, setSupplierId] = useState('');
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

  const supplierName = supplierId ? (suppliers.find((s) => s._id === supplierId) || {}).name : '';

  const onFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setFileName(file.name);
    const done = (json) => {
      const hs = json.length ? Object.keys(json[0]) : [];
      setHeaders(hs); setRows(json);
      setMap({ number: hs[0] || '', date: '', supplier: '', currency: '', ht: '', vat: '', ttc: '' });
    };
    if (/\.csv$/i.test(file.name)) Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => done(r.data) });
    else { const rd = new FileReader(); rd.onload = (ev) => { const wb = XLSX.read(ev.target.result, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; done(XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })); }; rd.readAsArrayBuffer(file); }
  };

  const recapItems = (!map ? [] : rows.map((r) => ({
    invoiceNumber: r[map.number], date: parseDate(r[map.date]),
    supplierName: map.supplier ? r[map.supplier] : (supplierName || null),
    currency: map.currency ? (r[map.currency] || null) : null,
    subtotal: map.ht ? parseAmount(r[map.ht], sep) : null,
    vat: map.vat ? parseAmount(r[map.vat], sep) : null,
    total: map.ttc ? parseAmount(r[map.ttc], sep) : null,
  })).filter((x) => x.invoiceNumber));

  const ColSelect = ({ field, label, optional }) => (
    <div className="field"><label>{label}{optional ? ' (opt.)' : ''}</label>
      <select value={map[field]} onChange={(e) => setMap({ ...map, [field]: e.target.value })}>
        <option value="">—</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );

  const doImport = async (itemsToImport) => {
    if (!itemsToImport.length) { alert('Aucune facture exploitable.'); return; }
    if (!company) { alert('Choisis une société.'); return; }
    setBusy(true);
    try {
      // supplierId par défaut seulement si aucune colonne fournisseur n'est mappée
      const body = { company, items: itemsToImport };
      if (supplierId && (!map || !map.supplier)) body.supplierId = supplierId;
      const r = await importSupplierInvoices(body, token);
      setResult(r);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const analyze = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setAiBusy(true);
    try {
      const out = await ocrSupplierInvoice(file, token); const d = out.data || {};
      setDraft({ invoiceNumber: d.invoiceNumber || '', date: d.date || '', supplierName: d.supplierName || supplierName || '', currency: d.currency || 'EUR', subtotal: d.subtotal, vat: d.vatTotal, total: d.total, category: d.category || '' });
    } catch (err) { alert(err.message); } finally { setAiBusy(false); e.target.value = ''; }
  };
  const addStaged = () => { if (!draft || !draft.invoiceNumber) { alert('Numéro de facture requis.'); return; } setStaged((s) => [...s, draft]); setDraft(null); };

  return (
    <Modal title="Importer des factures fournisseurs" onClose={onClose}>
      {result ? (
        <div>
          <p style={{ color: '#166534' }}>{result.inserted} facture(s) importée(s){result.skipped ? ` · ${result.skipped} doublon(s) ignoré(s)` : ''}.</p>
          {result.errors && result.errors.length > 0 && <ul className="muted">{result.errors.slice(0, 5).map((m, i) => <li key={i}>{m}</li>)}</ul>}
          <div className="modal-actions"><button className="btn btn-primary" onClick={onDone}>Terminer</button></div>
        </div>
      ) : (
        <>
          <div className="grid2">
            <div className="field"><label>Société (qui supporte la charge)</label>
              <select value={company} onChange={(e) => setCompany(e.target.value)}>
                <option value="">— choisir —</option>
                {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Fournisseur par défaut (opt.)</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— aucun / par colonne —</option>
                {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
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
                    <ColSelect field="supplier" label="Fournisseur" optional />
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
                    <thead><tr><th>N°</th><th>Date</th><th>Fournisseur</th><th style={{ textAlign: 'right' }}>HT</th><th style={{ textAlign: 'right' }}>TVA</th><th style={{ textAlign: 'right' }}>TTC</th></tr></thead>
                    <tbody>{recapItems.slice(0, 8).map((m, i) => (
                      <tr key={i}><td>{m.invoiceNumber}</td><td>{m.date || '—'}</td><td>{m.supplierName || '—'}</td>
                        <td style={{ textAlign: 'right' }}>{m.subtotal == null ? '—' : m.subtotal}</td><td style={{ textAlign: 'right' }}>{m.vat == null ? '—' : m.vat}</td><td style={{ textAlign: 'right' }}>{m.total == null ? '—' : m.total}</td></tr>
                    ))}</tbody>
                  </table></div>
                  {recapItems.length > 8 && <p className="muted">… et {recapItems.length - 8} de plus.</p>}
                  <div className="modal-actions">
                    <button className="btn btn-primary" onClick={() => doImport(recapItems)} disabled={busy || !company}>{busy ? 'Import…' : `Importer ${recapItems.length} facture(s)`}</button>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'pdf' && (
            <>
              <div className="field" style={{ background: '#faf7f8', padding: 10, borderRadius: 8 }}>
                <label>{aiBusy ? <><span className="spinner" />Analyse OCR en cours…</> : 'Facture fournisseur (PDF ou image)'}</label>
                <input type="file" accept="application/pdf,image/*" onChange={analyze} disabled={aiBusy} />
                <span className="muted" style={{ fontSize: 12 }}>Les champs reconnus pré-remplissent la ligne ci-dessous ; corrige puis « Ajouter ».</span>
              </div>
              {draft && (
                <div className="card-block" style={{ marginTop: 10 }}>
                  <div className="grid2">
                    <div className="field"><label>N° de facture</label><input value={draft.invoiceNumber} onChange={(e) => setDraft({ ...draft, invoiceNumber: e.target.value })} /></div>
                    <div className="field"><label>Date</label><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></div>
                  </div>
                  <div className="grid2">
                    <div className="field"><label>Fournisseur</label><input value={draft.supplierName} onChange={(e) => setDraft({ ...draft, supplierName: e.target.value })} /></div>
                    <div className="field"><label>Devise</label><input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></div>
                  </div>
                  <div className="grid2">
                    <div className="field"><label>Total HT</label><input type="number" step="any" value={draft.subtotal == null ? '' : draft.subtotal} onChange={(e) => setDraft({ ...draft, subtotal: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                    <div className="field"><label>Total TTC</label><input type="number" step="any" value={draft.total == null ? '' : draft.total} onChange={(e) => setDraft({ ...draft, total: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                  </div>
                  <div className="modal-actions"><button className="btn" onClick={() => setDraft(null)}>Annuler</button><button className="btn btn-primary" onClick={addStaged}>Ajouter à la liste</button></div>
                </div>
              )}
              {staged.length > 0 && (
                <>
                  <p className="muted">{staged.length} facture(s) prête(s) :</p>
                  <div style={{ overflowX: 'auto', maxWidth: '100%' }}><table className="table" style={{ boxShadow: 'none', minWidth: 460 }}>
                    <thead><tr><th>N°</th><th>Date</th><th>Fournisseur</th><th style={{ textAlign: 'right' }}>TTC</th><th></th></tr></thead>
                    <tbody>{staged.map((m, i) => (
                      <tr key={i}><td>{m.invoiceNumber}</td><td>{m.date || '—'}</td><td>{m.supplierName || '—'}</td><td style={{ textAlign: 'right' }}>{m.total == null ? '—' : m.total}</td>
                        <td><button className="link-danger" onClick={() => setStaged((s) => s.filter((_, j) => j !== i))}>×</button></td></tr>
                    ))}</tbody>
                  </table></div>
                  <div className="modal-actions"><button className="btn btn-primary" onClick={() => doImport(staged)} disabled={busy || !company}>{busy ? 'Import…' : `Importer ${staged.length} facture(s)`}</button></div>
                </>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
