// src/pages/Bank.jsx — import de relevés (CSV / Excel via mappage, PDF via IA) + lignes.
import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useAuth } from '../auth';
import {
  listResource, listBankTransactions, bulkImportBank, deleteBankTransaction, parseBankFile,
  getBankMatches, reconcileBank, unreconcileBank, getInternalCategories,
} from '../api';
import Modal from '../components/Modal';

// --- Helpers de normalisation (CSV/Excel) ---
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
  const debit = find(/d[ée]bit|withdraw|sortie|retrait/);
  const credit = find(/cr[ée]dit|deposit|entr[ée]e|versement/);
  return {
    date: find(/date|jour|valeur|operation/),
    label: find(/libell|label|description|intitul|motif|nature|d[ée]tail|narrative|wording/),
    amountSingle: find(/montant|amount|sum/),
    debit,
    credit,
    currency: find(/devise|currency|monnaie|ccy/),
    balance: find(/solde|balance/),
    amountMode: debit && credit ? 'debit_credit' : 'single',
  };
}

const fmt = (n, c) =>
  n === null || n === undefined ? '—' : `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${c ? ' ' + c : ''}`;

function acctLabel(a) {
  const tail = a.iban || a.accountNumber || a.currency || '';
  return `${a.bankName || 'Compte'}${tail ? ' · ' + tail : ''}`;
}

export default function Bank() {
  const { token } = useAuth();
  const [companies, setCompanies] = useState([]);

  // Import
  const [companySel, setCompanySel] = useState('');
  const [customCompany, setCustomCompany] = useState('');
  const [accountSel, setAccountSel] = useState('');
  const [customAccount, setCustomAccount] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [map, setMap] = useState(null);
  const [decimalSep, setDecimalSep] = useState(',');
  const [defaultCurrency, setDefaultCurrency] = useState('EUR');
  const [parsedTx, setParsedTx] = useState(null); // lignes déjà normalisées (PDF/IA)
  const [aiBusy, setAiBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  // Liste
  const [items, setItems] = useState([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterRecon, setFilterRecon] = useState('');
  const [loading, setLoading] = useState(true);

  // Rapprochement
  const [reconcileTx, setReconcileTx] = useState(null);
  const [matches, setMatches] = useState([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [internalCats, setInternalCats] = useState([]);
  const [reconBusy, setReconBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await listResource('companies', token);
        const cs = r.items || [];
        setCompanies(cs);
        if (cs.length) setCompanySel(cs[0].name);
      } catch (e) { /* ignore */ }
      try {
        const c = await getInternalCategories(token);
        setInternalCats(c.items || []);
      } catch (e) { /* ignore */ }
    })();
  }, []);

  const openReconcile = async (tx) => {
    setReconcileTx(tx);
    setMatches([]);
    if (!tx.reconciled) {
      setMatchLoading(true);
      try {
        const r = await getBankMatches(tx._id, token);
        setMatches(r.items || []);
      } catch (e) {
        setMatches([]);
      } finally {
        setMatchLoading(false);
      }
    }
  };

  const doReconcile = async (body) => {
    setReconBusy(true);
    try {
      await reconcileBank(reconcileTx._id, body, token);
      setReconcileTx(null);
      await loadTx();
    } catch (e) {
      alert(e.message);
    } finally {
      setReconBusy(false);
    }
  };

  const doUnreconcile = async () => {
    setReconBusy(true);
    try {
      await unreconcileBank(reconcileTx._id, token);
      setReconcileTx(null);
      await loadTx();
    } catch (e) {
      alert(e.message);
    } finally {
      setReconBusy(false);
    }
  };

  const loadTx = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterCompany) params.company = filterCompany;
      if (filterRecon) params.reconciled = filterRecon;
      const r = await listBankTransactions(params, token);
      setItems(r.items || []);
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTx(); }, [filterCompany, filterRecon]);

  const resetImportZone = () => {
    setHeaders([]); setRows([]); setMap(null); setParsedTx(null);
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    resetImportZone();
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) parsePdf(file);
    else if (name.endsWith('.xlsx') || name.endsWith('.xls')) parseExcel(file);
    else parseCsv(file);
  };

  const parseCsv = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const flds = (res.meta.fields || []).filter(Boolean);
        setHeaders(flds);
        setRows(res.data || []);
        setMap(guessColumns(flds));
      },
      error: (err) => alert('Lecture CSV échouée : ' + err.message),
    });
  };

  const parseExcel = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        if (!json.length) return alert('Feuille Excel vide.');
        const flds = Object.keys(json[0]).filter(Boolean);
        setHeaders(flds);
        setRows(json);
        setMap(guessColumns(flds));
      } catch (err) {
        alert('Lecture Excel échouée : ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parsePdf = async (file) => {
    setAiBusy(true);
    try {
      const r = await parseBankFile(file, token);
      setParsedTx(r.transactions || []);
      if (!(r.transactions || []).length) alert("Aucune opération détectée. Le document est-il bien un relevé lisible ?");
    } catch (e) {
      alert('Analyse du relevé échouée : ' + e.message);
      setFileName('');
    } finally {
      setAiBusy(false);
    }
  };

  const setMapField = (k, v) => setMap((m) => ({ ...m, [k]: v }));

  // Société / compte : valeurs effectives + comptes de la société choisie.
  const OTHER = '__other__';
  const companyObj = companies.find((c) => c.name === companySel);
  const bankAccts = (companyObj && companyObj.bankAccounts) || [];
  const effectiveCompany = companySel === OTHER ? customCompany.trim() : companySel;
  const useAccountList = companySel !== OTHER && bankAccts.length > 0;
  const accountIsFree = !useAccountList || accountSel === OTHER;
  const effectiveAccount = accountIsFree ? customAccount.trim() : accountSel;

  const onCompanyChange = (v) => {
    setCompanySel(v);
    setAccountSel('');
    setCustomAccount('');
  };

  const normalize = (raw) =>
    raw.map((r) => {
      let amount = null;
      if (map.amountMode === 'debit_credit') {
        const d = parseAmount(r[map.debit], decimalSep);
        const c = parseAmount(r[map.credit], decimalSep);
        amount = (c || 0) - (d || 0);
        if (d === null && c === null) amount = null;
      } else {
        amount = parseAmount(r[map.amountSingle], decimalSep);
      }
      return {
        date: parseDate(r[map.date]),
        label: (r[map.label] || '').toString().trim(),
        amount,
        currency: (map.currency && r[map.currency]) || defaultCurrency,
        balance: map.balance ? parseAmount(r[map.balance], decimalSep) : null,
      };
    });

  // Lignes candidates : soit issues de l'IA (PDF), soit du mappage (CSV/Excel).
  const txAll = parsedTx !== null ? parsedTx : (map ? normalize(rows) : []);
  const preview = txAll.slice(0, 8);
  const validCount = txAll.filter((t) => t.date && t.amount !== null).length;

  const doImport = async () => {
    if (!effectiveCompany) return alert('Choisissez ou saisissez une société.');
    const transactions = txAll.filter((t) => t.date && t.amount !== null);
    if (!transactions.length) return alert('Aucune ligne valide à importer.');
    setImporting(true);
    try {
      const r = await bulkImportBank({ company: effectiveCompany, account: effectiveAccount, source: fileName, transactions }, token);
      setResult(r);
      resetImportZone();
      setFileName('');
      await loadTx();
    } catch (e) {
      alert(e.message);
    } finally {
      setImporting(false);
    }
  };

  const removeTx = async (id) => {
    if (!confirm('Supprimer cette ligne ?')) return;
    try {
      await deleteBankTransaction(id, token);
      await loadTx();
    } catch (e) { alert(e.message); }
  };

  const showMapping = map && parsedTx === null;
  const showPreview = txAll.length > 0;

  return (
    <div>
      {/* ---- Import ---- */}
      <div className="card-block">
        <h3 style={{ marginTop: 0, color: 'var(--primary)' }}>Importer un relevé</h3>
        <div className="grid2">
          <div className="field">
            <label>Société</label>
            <select value={companySel} onChange={(e) => onCompanyChange(e.target.value)}>
              {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
              <option value={OTHER}>Autre…</option>
            </select>
            {companySel === OTHER && (
              <input style={{ marginTop: 8 }} value={customCompany} onChange={(e) => setCustomCompany(e.target.value)} placeholder="Nom de la société / du compte" />
            )}
          </div>
          <div className="field">
            <label>Compte (banque / IBAN)</label>
            {useAccountList ? (
              <>
                <select value={accountSel} onChange={(e) => setAccountSel(e.target.value)}>
                  <option value="">— Choisir un compte —</option>
                  {bankAccts.map((a, i) => {
                    const lab = acctLabel(a);
                    return <option key={i} value={lab}>{lab}</option>;
                  })}
                  <option value={OTHER}>Autre…</option>
                </select>
                {accountSel === OTHER && (
                  <input style={{ marginTop: 8 }} value={customAccount} onChange={(e) => setCustomAccount(e.target.value)} placeholder="Compte (banque / IBAN)" />
                )}
              </>
            ) : (
              <input value={customAccount} onChange={(e) => setCustomAccount(e.target.value)} placeholder="ex. FNB courant, Wise EUR…" />
            )}
          </div>
        </div>

        <div className="field">
          <label>Fichier (CSV, Excel ou PDF)</label>
          <input type="file" accept=".csv,.tsv,.xls,.xlsx,.pdf,text/csv,application/pdf" onChange={onFile} />
          {fileName && <span className="muted"> {fileName}{rows.length ? ` · ${rows.length} lignes` : ''}</span>}
        </div>

        {aiBusy && (
          <div style={{ margin: '8px 0', color: 'var(--accent)', fontWeight: 600 }}>
            <span className="spinner" />Analyse du relevé par l’IA en cours… (PDF/scan)
          </div>
        )}

        {parsedTx !== null && !aiBusy && (
          <div className="muted" style={{ margin: '8px 0' }}>
            Lignes extraites automatiquement par l’IA — vérifiez l’aperçu avant d’importer.
          </div>
        )}

        {showMapping && (
          <>
            <div style={{ borderTop: '1px dashed var(--border)', margin: '12px 0', paddingTop: 12 }}>
              <strong style={{ color: 'var(--accent)' }}>Mappage des colonnes</strong>
            </div>
            <div className="grid2">
              <div className="field">
                <label>Date</label>
                <ColSelect headers={headers} value={map.date} onChange={(v) => setMapField('date', v)} />
              </div>
              <div className="field">
                <label>Libellé</label>
                <ColSelect headers={headers} value={map.label} onChange={(v) => setMapField('label', v)} />
              </div>
            </div>

            <div className="field">
              <label>Montant</label>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                <label style={{ display: 'flex', gap: 6, fontWeight: 400 }}>
                  <input type="radio" checked={map.amountMode === 'single'} onChange={() => setMapField('amountMode', 'single')} /> Une colonne signée
                </label>
                <label style={{ display: 'flex', gap: 6, fontWeight: 400 }}>
                  <input type="radio" checked={map.amountMode === 'debit_credit'} onChange={() => setMapField('amountMode', 'debit_credit')} /> Débit / Crédit séparés
                </label>
              </div>
              {map.amountMode === 'single' ? (
                <ColSelect headers={headers} value={map.amountSingle} onChange={(v) => setMapField('amountSingle', v)} />
              ) : (
                <div className="grid2">
                  <ColSelect headers={headers} value={map.debit} onChange={(v) => setMapField('debit', v)} placeholder="Colonne Débit" />
                  <ColSelect headers={headers} value={map.credit} onChange={(v) => setMapField('credit', v)} placeholder="Colonne Crédit" />
                </div>
              )}
            </div>

            <div className="grid2">
              <div className="field">
                <label>Séparateur décimal</label>
                <select value={decimalSep} onChange={(e) => setDecimalSep(e.target.value)}>
                  <option value=",">Virgule (1 234,56)</option>
                  <option value=".">Point (1,234.56)</option>
                </select>
              </div>
              <div className="field">
                <label>Devise par défaut</label>
                <input value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} />
              </div>
            </div>
            <div className="grid2">
              <div className="field">
                <label>Colonne Devise (optionnel)</label>
                <ColSelect headers={headers} value={map.currency} onChange={(v) => setMapField('currency', v)} />
              </div>
              <div className="field">
                <label>Colonne Solde (optionnel)</label>
                <ColSelect headers={headers} value={map.balance} onChange={(v) => setMapField('balance', v)} />
              </div>
            </div>
          </>
        )}

        {showPreview && (
          <>
            <div style={{ margin: '8px 0' }}>
              <strong style={{ color: 'var(--accent)' }}>Aperçu</strong>{' '}
              <span className="muted">({validCount} ligne(s) valide(s){parsedTx === null ? ` sur ${rows.length}` : ''})</span>
            </div>
            <table className="table">
              <thead><tr><th>Date</th><th>Libellé</th><th style={{ textAlign: 'right' }}>Montant</th><th>Devise</th></tr></thead>
              <tbody>
                {preview.map((t, i) => (
                  <tr key={i}>
                    <td>{t.date || <span className="muted">?</span>}</td>
                    <td>{t.label}</td>
                    <td style={{ textAlign: 'right', color: t.amount < 0 ? '#b91c1c' : '#166534' }}>{fmt(t.amount)}</td>
                    <td>{t.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={doImport} disabled={importing || !validCount}>
              {importing ? '…' : `Importer ${validCount} ligne(s)`}
            </button>
          </>
        )}

        {result && (
          <div style={{ marginTop: 14, color: '#166534', fontWeight: 600 }}>
            Import terminé : {result.imported} ligne(s) ajoutée(s){result.skipped ? `, ${result.skipped} doublon(s) ignoré(s)` : ''}.
          </div>
        )}
      </div>

      {/* ---- Lignes ---- */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '24px 0 12px' }}>
        <h3 style={{ margin: 0, color: 'var(--primary)' }}>Lignes</h3>
        <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
          <option value="">Toutes sociétés</option>
          {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={filterRecon} onChange={(e) => setFilterRecon(e.target.value)}>
          <option value="">Tous états</option>
          <option value="false">Non rapprochées</option>
          <option value="true">Rapprochées</option>
        </select>
      </div>

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Date</th><th>Libellé</th><th>Société</th><th>Compte</th><th style={{ textAlign: 'right' }}>Montant</th><th>Rappr.</th><th></th></tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className="muted">Aucune ligne. Importez un relevé ci-dessus.</td></tr>
            ) : (
              items.map((t) => (
                <tr key={t._id} className="clickable" onClick={() => openReconcile(t)}>
                  <td>{t.date}</td>
                  <td>{t.label}</td>
                  <td>{t.company}</td>
                  <td>{t.account}</td>
                  <td style={{ textAlign: 'right', color: t.amount < 0 ? '#b91c1c' : '#166534' }}>{fmt(t.amount, t.currency)}</td>
                  <td>{t.reconciled ? <span style={{ color: '#166534' }}>✓ {t.matchedLabel || ''}</span> : <span className="muted">—</span>}</td>
                  <td><button className="link-danger" onClick={(e) => { e.stopPropagation(); removeTx(t._id); }} title="Supprimer">×</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
      {reconcileTx && (
        <Modal title="Rapprochement" onClose={() => setReconcileTx(null)}>
          <div style={{ marginBottom: 14 }}>
            <div className="muted">{reconcileTx.date} · {reconcileTx.account || '—'}</div>
            <div style={{ fontWeight: 600 }}>{reconcileTx.label}</div>
            <div style={{ color: reconcileTx.amount < 0 ? '#b91c1c' : '#166534', fontWeight: 700 }}>
              {fmt(reconcileTx.amount, reconcileTx.currency)}
            </div>
          </div>

          {reconcileTx.reconciled ? (
            <div>
              <p>
                Rapproché à : <strong>{reconcileTx.matchedLabel || reconcileTx.reconcileCategory || 'Dépense'}</strong>
                {reconcileTx.reconcileType === 'internal' ? ' (écriture interne)' : ''}.
              </p>
              <button className="btn btn-danger" onClick={doUnreconcile} disabled={reconBusy}>
                Annuler le rapprochement
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 600, color: 'var(--accent)', margin: '8px 0' }}>Dépenses suggérées</div>
              {matchLoading ? (
                <p className="muted">Recherche…</p>
              ) : matches.length === 0 ? (
                <p className="muted">Aucune dépense correspondante trouvée.</p>
              ) : (
                <table className="table">
                  <tbody>
                    {matches.map((m) => (
                      <tr key={m.expenseId}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{m.title || m.merchant || 'Dépense'}</div>
                          <div className="muted" style={{ fontSize: 13 }}>
                            {m.date || '—'} · {fmt(m.amount, m.currency)} ·{' '}
                            {m.exact ? 'montant exact' : `≈ (Δ ${m.amountDiff})`}
                            {m.dateDiff != null ? ` · ${m.dateDiff} j` : ''}
                            {!m.currencyMatch ? ' · devise ≠' : ''}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-primary" onClick={() => doReconcile({ expenseId: m.expenseId })} disabled={reconBusy}>
                            Rapprocher
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div style={{ fontWeight: 600, color: 'var(--accent)', margin: '16px 0 8px' }}>Ou classer comme écriture interne</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {internalCats.map((c) => (
                  <button key={c} className="btn" onClick={() => doReconcile({ category: c })} disabled={reconBusy}>{c}</button>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function ColSelect({ headers, value, onChange, placeholder }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder || '—'}</option>
      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  );
}
