// src/pages/Ledger.jsx — Grand Livre brouillon : génération, écritures par pièce
// (provenance + détail + rejet), et balance/résultat. Partie double.
import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import {
  listResource, generateLedger, refreshLedger, saveLedger, ledgerStatus, listLedgerDrafts,
  listLedger, rejectLedger, restoreLedger, ledgerReport,
} from '../api';
import Modal from '../components/Modal';

const STD_LABEL = { IFRS: 'IFRS', IFRS_SME: 'IFRS for SMEs', PCG: 'PCG (France)' };
const SRC = {
  expense: { label: 'Dépense', color: '#b45309', bg: '#fef3c7' },
  invoice: { label: 'Facture', color: '#1d4ed8', bg: '#dbeafe' },
  bank: { label: 'Banque', color: '#166534', bg: '#dcfce7' },
};
const fmt = (n, cur) =>
  n == null || n === 0 ? '' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (cur ? ' ' + cur : '');

function groupByPiece(items) {
  const order = [];
  const map = {};
  for (const e of items) {
    if (!map[e.pieceRef]) {
      map[e.pieceRef] = { pieceRef: e.pieceRef, date: e.date, label: e.label, source: e.source, status: e.status, currency: e.currency, legs: [] };
      order.push(map[e.pieceRef]);
    }
    map[e.pieceRef].legs.push(e);
  }
  return order;
}

export default function Ledger() {
  const { token } = useAuth();
  const year = new Date().getFullYear();
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState('');
  const [standard, setStandard] = useState('');
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [tab, setTab] = useState('entries');
  const [statusFilter, setStatusFilter] = useState('');
  const [groups, setGroups] = useState([]);
  const [totals, setTotals] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [genInfo, setGenInfo] = useState(null);
  const [status, setStatus] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [saveModal, setSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    listResource('companies', token).then((r) => {
      const cs = r.items || [];
      setCompanies(cs);
      if (cs.length) {
        setCompany(cs[0].name);
        const st = (cs[0].accountingStandards || [])[0] || '';
        setStandard(st);
      }
    }).catch(() => {});
    loadDrafts();
  }, []);

  const current = companies.find((c) => c.name === company);
  const stdOptions = (current && current.accountingStandards) || [];

  const onCompany = (name) => {
    setCompany(name);
    const c = companies.find((x) => x.name === name);
    setStandard(((c && c.accountingStandards) || [])[0] || '');
    setGroups([]); setTotals(null); setReport(null); setGenInfo(null);
  };

  const params = () => `company=${encodeURIComponent(company)}&standard=${encodeURIComponent(standard)}&from=${from}&to=${to}`;

  const loadEntries = async (status = statusFilter) => {
    const p = params() + (status ? `&status=${status}` : '');
    const r = await listLedger(p, token);
    setGroups(groupByPiece(r.items || []));
    setTotals(r.totals || null);
  };
  const loadReport = async () => setReport(await ledgerReport(params(), token));
  const loadStatus = async () => {
    try { setStatus(await ledgerStatus(params(), token)); } catch (e) { setStatus(null); }
  };

  // Recharge le brouillon enregistré quand on change de société/norme.
  useEffect(() => {
    if (company && standard) {
      setGenInfo(null);
      loadEntries().catch(() => {});
      if (tab === 'reports') loadReport().catch(() => {});
    }
  }, [company, standard]);

  // Met à jour le compteur de données à intégrer pour l'exercice (période incluse).
  useEffect(() => {
    if (company && standard && from && to) loadStatus();
  }, [company, standard, from, to]);

  const doRefresh = async () => {
    setBusy(true);
    try {
      const r = await refreshLedger({ company, standard, from, to }, token);
      setGenInfo({ pieces: r.added, legs: r.legs, refreshed: true });
      await loadEntries();
      await loadStatus();
      if (tab === 'reports') await loadReport();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const loadDrafts = async () => {
    try { setDrafts((await listLedgerDrafts('', token)).items || []); } catch (e) { /* */ }
  };

  const openSaveModal = () => {
    const def = (status && status.draft && status.draft.label)
      || `${company} · ${STD_LABEL[standard] || standard} · ${(from || '').slice(0, 4)}`;
    setSaveName(def);
    setSaveModal(true);
  };

  const doSave = async () => {
    setBusy(true);
    try {
      await saveLedger({ company, standard, from, to, label: saveName }, token);
      setSaveModal(false);
      await loadStatus();
      await loadDrafts();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const openDraft = (id) => {
    const d = drafts.find((x) => x._id === id);
    if (!d) return;
    setCompany(d.company); setStandard(d.standard); setFrom(d.from); setTo(d.to);
  };

  const generate = async () => {
    if (!company || !standard) { alert('Choisis une société et une norme.'); return; }
    setBusy(true);
    try {
      const r = await generateLedger({ company, standard, from, to }, token);
      setGenInfo(r);
      await loadEntries();
      await loadStatus();
      if (tab === 'reports') await loadReport();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const toggleReject = async (g) => {
    setBusy(true);
    try {
      if (g.status === 'rejected') await restoreLedger(g.pieceRef, token);
      else await rejectLedger(g.pieceRef, token);
      await loadEntries();
      await loadStatus();
      if (tab === 'reports') await loadReport();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const switchTab = async (t) => {
    setTab(t);
    if (t === 'reports' && company && standard) { try { await loadReport(); } catch (e) { /* */ } }
  };

  const onStatusFilter = async (v) => { setStatusFilter(v); try { await loadEntries(v); } catch (e) { /* */ } };

  return (
    <div>
      <div className="card-block" style={{ marginBottom: 16 }}>
        {drafts.length > 0 && (
          <div className="field">
            <label>Brouillons enregistrés</label>
            <select value="" onChange={(e) => { if (e.target.value) openDraft(e.target.value); }}>
              <option value="">— ouvrir un enregistrement —</option>
              {drafts.map((d) => (
                <option key={d._id} value={d._id}>
                  {(d.label || `${d.company} · ${d.standard}`)} ({d.from} → {d.to})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid2">
          <div className="field">
            <label>Société</label>
            <select value={company} onChange={(e) => onCompany(e.target.value)}>
              {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Norme comptable</label>
            {stdOptions.length === 0 ? (
              <div className="muted" style={{ padding: 8 }}>Aucune norme — à définir dans <strong>Sociétés</strong>.</div>
            ) : (
              <select value={standard} onChange={(e) => setStandard(e.target.value)}>
                {stdOptions.map((s) => <option key={s} value={s}>{STD_LABEL[s] || s}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="grid2">
          <div className="field"><label>Du</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label>Au</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={generate} disabled={busy || !standard}>Générer le brouillon</button>
          <button className="btn" onClick={doRefresh} disabled={busy || !standard || !(status && status.pending && status.pending.total)}>
            Rafraîchir{status && status.pending && status.pending.total ? ` (${status.pending.total})` : ''}
          </button>
          <button
            className="btn"
            style={{ background: '#166534', color: '#fff', borderColor: '#166534', fontWeight: 600, opacity: (busy || !standard) ? 0.5 : 1 }}
            onClick={openSaveModal}
            disabled={busy || !standard}
          >
            Enregistrer…
          </button>
          {genInfo && (
            <span className="muted">
              {genInfo.refreshed ? `${genInfo.pieces} nouvelle(s) intégrée(s)` : `${genInfo.pieces} opération(s) · ${genInfo.legs} écriture(s)`}
            </span>
          )}
        </div>

        {status && (
          <div style={{ marginTop: 10, fontSize: 14 }}>
            {status.pending && status.pending.total > 0 ? (
              <span style={{ color: '#b45309', fontWeight: 600 }}>
                {status.pending.total} nouvelle(s) opération(s) à intégrer pour l'exercice
                <span className="muted" style={{ fontWeight: 400 }}>
                  {' '}({status.pending.expense} dépenses · {status.pending.invoice} factures · {status.pending.bank} banque) — clique « Rafraîchir »
                </span>
              </span>
            ) : (
              <span style={{ color: '#166534' }}>Brouillon à jour — aucune nouvelle opération à intégrer.</span>
            )}
            {status.draft && status.draft.savedAt && (
              <span className="muted"> · Enregistré le {new Date(status.draft.savedAt).toLocaleString('fr-FR')}</span>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className={'btn ' + (tab === 'entries' ? 'btn-primary' : 'btn-ghost')} onClick={() => switchTab('entries')}>Écritures</button>
        <button className={'btn ' + (tab === 'reports' ? 'btn-primary' : 'btn-ghost')} onClick={() => switchTab('reports')}>Balance &amp; Résultat</button>
      </div>

      {tab === 'entries' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <select value={statusFilter} onChange={(e) => onStatusFilter(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">Toutes les écritures</option>
              <option value="included">Incluses</option>
              <option value="rejected">Rejetées</option>
            </select>
            {totals && (
              <span className="muted">
                Total débit {fmt(totals.debit)} · crédit {fmt(totals.credit)} ·{' '}
                <strong style={{ color: totals.debit === totals.credit ? '#166534' : '#b91c1c' }}>
                  {totals.debit === totals.credit ? 'équilibré' : 'déséquilibré'}
                </strong>
              </span>
            )}
          </div>

          {groups.length === 0 ? (
            <p className="muted">Aucune écriture. Choisis une période puis « Générer le brouillon ».</p>
          ) : (
            groups.map((g) => {
              const src = SRC[g.source?.type] || { label: g.source?.type, color: '#555', bg: '#eee' };
              const rejected = g.status === 'rejected';
              return (
                <div key={g.pieceRef} className="card-block" style={{ marginBottom: 10, opacity: rejected ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ background: src.bg, color: src.color, fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{src.label}</span>
                      <span className="muted">{g.date}</span>
                      <strong style={{ textDecoration: rejected ? 'line-through' : 'none' }}>{g.label}</strong>
                    </div>
                    <div style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost" onClick={() => setDetail(g)}>Détail</button>{' '}
                      <button className={'btn ' + (rejected ? 'btn-ghost' : 'btn-danger')} onClick={() => toggleReject(g)} disabled={busy}>
                        {rejected ? 'Restaurer' : 'Rejeter'}
                      </button>
                    </div>
                  </div>
                  <table className="table" style={{ boxShadow: 'none', margin: 0 }}>
                    <tbody>
                      {g.legs.map((l) => (
                        <tr key={l._id}>
                          <td style={{ width: 90, color: '#666' }}>{l.account?.code || ''}</td>
                          <td>{l.account?.label}</td>
                          <td style={{ textAlign: 'right', width: 140 }}>{fmt(l.debit, l.currency)}</td>
                          <td style={{ textAlign: 'right', width: 140 }}>{fmt(l.credit, l.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <ReportView report={report} />
      )}

      {detail && (
        <Modal title="Détail de l'opération" onClose={() => setDetail(null)}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ background: (SRC[detail.source?.type] || {}).bg, color: (SRC[detail.source?.type] || {}).color, fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
              {(SRC[detail.source?.type] || {}).label}
            </span>{' '}
            <strong>{detail.label}</strong> · {detail.date}
          </div>
          <div className="fieldlist" style={{ marginBottom: 12 }}>
            <div className="fieldlist-head"><span>Provenance</span></div>
            {Object.entries(detail.source?.snapshot || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 14 }}>
                <span className="muted">{k}</span><span>{String(v)}</span>
              </div>
            ))}
          </div>
          <div className="fieldlist-head"><span>Écritures</span></div>
          <table className="table" style={{ boxShadow: 'none' }}>
            <thead><tr><th>Compte</th><th>Libellé</th><th style={{ textAlign: 'right' }}>Débit</th><th style={{ textAlign: 'right' }}>Crédit</th></tr></thead>
            <tbody>
              {detail.legs.map((l) => (
                <tr key={l._id}>
                  <td>{l.account?.code || ''}</td><td>{l.account?.label}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(l.debit, l.currency)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(l.credit, l.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
      {saveModal && (
        <Modal title="Enregistrer le brouillon" onClose={() => setSaveModal(false)}>
          <div className="field">
            <label>Nom de l'enregistrement</label>
            <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus />
          </div>
          <div className="muted" style={{ fontSize: 13 }}>{company} · {STD_LABEL[standard] || standard} · {from} → {to}</div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setSaveModal(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={doSave} disabled={busy || !saveName.trim()}>Enregistrer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ReportView({ report }) {
  if (!report) return <p className="muted">Génère le brouillon puis ouvre cet onglet.</p>;
  const { balance, totals, pl } = report;
  return (
    <div>
      <div className="card-block" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, color: 'var(--primary)' }}>Compte de résultat (synthèse)</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span>Produits</span><strong>{fmt(pl.revenue)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span>Charges</span><strong>{fmt(pl.expense)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid var(--primary)', fontSize: 18, color: 'var(--primary)' }}>
          <span>Résultat</span><strong>{fmt(pl.result)}</strong>
        </div>
      </div>

      <div className="card-block">
        <h3 style={{ marginTop: 0, color: 'var(--primary)' }}>Balance par compte</h3>
        <table className="table" style={{ boxShadow: 'none' }}>
          <thead><tr><th>Compte</th><th>Libellé</th><th style={{ textAlign: 'right' }}>Débit</th><th style={{ textAlign: 'right' }}>Crédit</th><th style={{ textAlign: 'right' }}>Solde</th></tr></thead>
          <tbody>
            {(balance || []).map((a, i) => (
              <tr key={i}>
                <td>{a.code || ''}</td><td>{a.label}</td>
                <td style={{ textAlign: 'right' }}>{fmt(a.debit)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(a.credit)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(a.solde)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, borderTop: '2px solid var(--primary)' }}>
              <td colSpan={2}>Totaux</td>
              <td style={{ textAlign: 'right' }}>{fmt(totals.debit)}</td>
              <td style={{ textAlign: 'right' }}>{fmt(totals.credit)}</td>
              <td style={{ textAlign: 'right', color: totals.balanced ? '#166534' : '#b91c1c' }}>{totals.balanced ? 'équilibré' : 'écart'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
