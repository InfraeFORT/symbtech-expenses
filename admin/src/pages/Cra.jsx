// src/pages/Cra.jsx — feuille de temps / CRA : grille mensuelle, activités par catégorie,
// récapitulatif Production / Absence / Interne, workflow d'approbation et génération de facture.
import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import {
  listResource, listProducts, listContracts, listAllOrders,
  listCras, createCra, updateCra, submitCra, approveCra, rejectCra, reopenCra, invoiceCra, deleteCra,
} from '../api';

const WD = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const CATS = { production: 'Production', absence: 'Absence', internal: 'Interne' };

const fmtMoney = (n, c) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (c ? ' ' + c : ''));
const curMonth = () => new Date().toISOString().slice(0, 7);
const monthLabel = (m) => { if (!m) return ''; const [y, mo] = m.split('-').map(Number); return `${MONTHS[mo - 1]} ${y}`; };

function isoWeek(dt) {
  const date = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = (date - firstThursday) / 86400000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}
function buildDays(month) {
  if (!month) return [];
  const [y, mo] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const arr = [];
  for (let day = 1; day <= n; day++) {
    const dt = new Date(Date.UTC(y, mo - 1, day));
    const dow = (dt.getUTCDay() + 6) % 7;
    arr.push({ day, dow, abbr: WD[dow], week: isoWeek(dt), weekend: dow >= 5 });
  }
  return arr;
}
const dayTotal = (days) => { let s = 0; for (const k in (days || {})) s += Number(days[k]) || 0; return s; };

function totals(activities) {
  let subtotal = 0, vatTotal = 0, prod = 0, abs = 0, intr = 0;
  for (const a of activities || []) {
    const d = dayTotal(a.days);
    if (a.category === 'production') { const ht = d * (Number(a.unitPrice) || 0); subtotal += ht; vatTotal += ht * (Number(a.vatRate) || 0) / 100; prod += d; }
    else if (a.category === 'absence') abs += d; else intr += d;
  }
  const r = (x) => Math.round(x * 100) / 100;
  return { subtotal: r(subtotal), vatTotal: r(vatTotal), total: r(subtotal + vatTotal), prod: r(prod), abs: r(abs), intr: r(intr) };
}

const STATUS = {
  draft: { label: 'Brouillon', color: '#6b7280' },
  submitted: { label: 'Soumise', color: '#1d4ed8' },
  approved: { label: 'Approuvée', color: '#166534' },
  rejected: { label: 'Refusée', color: '#b91c1c' },
  invoiced: { label: 'Facturée', color: '#7c3aed' },
};

function blank() {
  return {
    company: '', clientId: '', clientName: '', contractId: '', orderId: '', orderNumber: '',
    reference: '', title: '', person: '', month: curMonth(), periodLabel: '', currency: 'EUR',
    activities: [], notes: '', status: 'draft',
  };
}

export default function Cra() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refs, setRefs] = useState({ companies: [], clients: [], contracts: [], orders: [], products: [] });
  const [current, setCurrent] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setItems((await listCras(token)).items || []); } catch (e) { /* */ } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    (async () => {
      const r = {};
      try { r.companies = (await listResource('companies', token)).items || []; } catch (e) { r.companies = []; }
      try { r.clients = (await listResource('clients', token)).items || []; } catch (e) { r.clients = []; }
      try { r.contracts = (await listContracts(token)).items || []; } catch (e) { r.contracts = []; }
      try { r.orders = (await listAllOrders(token)).items || []; } catch (e) { r.orders = []; }
      try { r.products = (await listProducts(token)).items || []; } catch (e) { r.products = []; }
      setRefs(r);
    })();
  }, []);

  if (current) {
    return <Sheet token={token} refs={refs} initial={current} onBack={() => { setCurrent(null); load(); }} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>{items.length} feuille(s) de temps</p>
        <button className="btn btn-primary" onClick={() => setCurrent(blank())}>+ Nouvelle feuille</button>
      </div>
      {loading ? <p className="muted">Chargement…</p> : items.length === 0 ? (
        <p className="muted">Aucune feuille de temps.</p>
      ) : (
        <table className="table">
          <thead><tr><th>Période</th><th>Intervenant</th><th>Client</th><th style={{ textAlign: 'right' }}>Prod.</th><th style={{ textAlign: 'right' }}>Total TTC</th><th>Statut</th></tr></thead>
          <tbody>
            {items.map((c) => {
              const st = STATUS[c.status] || STATUS.draft;
              return (
                <tr key={c._id} className="clickable" onClick={() => setCurrent(c)}>
                  <td>{monthLabel(c.month) || c.periodLabel || '—'}</td>
                  <td>{c.person || '—'}</td>
                  <td>{c.clientName || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{c.productionDays || 0} j</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(c.total, c.currency)}</td>
                  <td><span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Sheet({ token, refs, initial, onBack }) {
  const [c, setC] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [actModal, setActModal] = useState(null);
  const isDraft = c.status === 'draft';
  const days = buildDays(c.month);
  const t = totals(c.activities);

  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const setDay = (ai, day, val) => {
    setC((x) => ({
      ...x,
      activities: x.activities.map((a, i) => {
        if (i !== ai) return a;
        const d = { ...(a.days || {}) };
        const v = val === '' ? 0 : Number(val);
        if (!v) delete d[day]; else d[day] = v;
        return { ...a, days: d };
      }),
    }));
  };

  const onClient = (name) => { const cl = refs.clients.find((x) => x.name === name); setC((x) => ({ ...x, clientName: name, clientId: cl ? cl._id : '' })); };
  const onContract = (id) => {
    const ct = refs.contracts.find((x) => x._id === id);
    setC((x) => ({ ...x, contractId: id, clientName: x.clientName || (ct ? ct.clientName : '') || '', clientId: x.clientId || (ct ? ct.clientId : '') || '', company: x.company || (ct ? ct.company : '') || '' }));
  };
  const onOrder = (id) => { const o = refs.orders.find((x) => x._id === id); setC((x) => ({ ...x, orderId: id, orderNumber: o ? (o.number || '') : '' })); };

  const saveActivity = (data, index) => {
    setC((x) => {
      const acts = [...x.activities];
      if (index == null) acts.push({ ...data, days: {} });
      else acts[index] = { ...acts[index], ...data };
      return { ...x, activities: acts };
    });
    setActModal(null);
  };
  const removeActivity = (index) => setC((x) => ({ ...x, activities: x.activities.filter((_, i) => i !== index) }));

  const persist = async () => {
    setBusy(true);
    try {
      const body = {
        company: c.company, clientId: c.clientId, clientName: c.clientName, contractId: c.contractId,
        orderId: c.orderId, orderNumber: c.orderNumber, reference: c.reference, title: c.title, person: c.person,
        month: c.month, periodLabel: c.periodLabel, currency: c.currency, activities: c.activities, notes: c.notes,
      };
      const saved = c._id ? await updateCra(c._id, body, token) : await createCra(body, token);
      setC(saved); return saved;
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const act = async (fn) => { setBusy(true); try { const r = await fn(); if (r && r._id) setC(r); } catch (e) { alert(e.message); } finally { setBusy(false); } };
  const submit = () => {
    if (issues.length) { alert('Corrigez les incohérences avant de soumettre :\n\n• ' + issues.slice(0, 10).join('\n• ')); return; }
    act(() => submitCra(c._id, token));
  };
  const approve = () => { const n = window.prompt('Note d’approbation (facultatif) :', '') || ''; act(() => approveCra(c._id, n, token)); };
  const reject = () => { const n = window.prompt('Motif du refus (facultatif) :', '') || ''; act(() => rejectCra(c._id, n, token)); };
  const reopen = () => act(() => reopenCra(c._id, token));
  const genInvoice = async () => {
    if (!window.confirm('Générer une facture brouillon depuis la production de cette feuille ?')) return;
    setBusy(true);
    try {
      const r = await invoiceCra(c._id, token);
      setC((x) => ({ ...x, status: 'invoiced', invoiceId: r.invoiceId }));
      alert(r.alreadyInvoiced ? 'Déjà facturée.' : 'Facture brouillon créée (onglet Factures). Sélectionnez-y la société émettrice pour compléter ses coordonnées.');
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const remove = async () => { if (!c._id) { onBack(); return; } if (!window.confirm('Supprimer cette feuille ?')) return; try { await deleteCra(c._id, token); onBack(); } catch (e) { alert(e.message); } };

  const weekGroups = [];
  for (const d of days) {
    const last = weekGroups[weekGroups.length - 1];
    if (last && last.week === d.week) last.span += 1;
    else weekGroups.push({ week: d.week, span: 1 });
  }
  const expectedTotal = days.filter((d) => !d.weekend).length;
  const realised = (day) => c.activities.reduce((s, a) => s + (Number((a.days || {})[day]) || 0), 0);
  const realisedTotal = c.activities.reduce((s, a) => s + dayTotal(a.days), 0);
  const byCat = (cat) => c.activities.map((a, i) => ({ a, i })).filter((o) => o.a.category === cat);

  // Contrôles de cohérence : un jour ne peut pas dépasser 1 j cumulé ; une cellule ne peut pas dépasser 1.
  const EPS = 1e-6;
  const overDays = days.filter((d) => realised(d.day) > 1 + EPS);
  const cellBad = (v) => v !== '' && v != null && (Number(v) < 0 || Number(v) > 1 + EPS);
  const issues = [];
  for (const d of overDays) issues.push(`Jour ${d.day} : ${realised(d.day)} j cumulés (maximum 1 j/jour).`);
  for (const a of c.activities) {
    for (const k in (a.days || {})) {
      const v = Number(a.days[k]);
      if (v < 0 || v > 1 + EPS) issues.push(`« ${a.label || 'Activité'} » — jour ${k} : ${v} (valeur attendue entre 0 et 1).`);
    }
  }

  return (
    <div>
      <button className="btn btn-ghost" onClick={onBack}>← Retour aux feuilles</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '10px 0' }}>
        <div>
          <h2 style={{ margin: 0 }}>{monthLabel(c.month)}{c.person ? ` — ${c.person}` : ''}</h2>
          <p className="muted" style={{ margin: '2px 0 0' }}>Feuille de temps{c.company ? ` · ${c.company}` : ''}{c.clientName ? ` · ${c.clientName}` : ''}</p>
        </div>
        <span style={{ color: (STATUS[c.status] || {}).color, fontWeight: 700 }}>{(STATUS[c.status] || {}).label}</span>
      </div>

      {isDraft && (
        <div className="card-block" style={{ marginBottom: 14 }}>
          <div className="grid2">
            <div className="field"><label>Société émettrice</label>
              <select value={c.company || ''} onChange={(e) => set('company', e.target.value)}>
                <option value="">— choisir —</option>
                {refs.companies.map((x) => <option key={x._id} value={x.name}>{x.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Client</label>
              <select value={c.clientName || ''} onChange={(e) => onClient(e.target.value)}>
                <option value="">— choisir —</option>
                {refs.clients.map((x) => <option key={x._id} value={x.name}>{x.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid2">
            <div className="field"><label>Contrat (mentions facture)</label>
              <select value={c.contractId || ''} onChange={(e) => onContract(e.target.value)}>
                <option value="">— aucun —</option>
                {refs.contracts.map((x) => <option key={x._id} value={x._id}>{[x.reference, x.name, x.clientName].filter(Boolean).join(' · ')}</option>)}
              </select>
            </div>
            <div className="field"><label>Commande (facultative)</label>
              <select value={c.orderId || ''} onChange={(e) => onOrder(e.target.value)}>
                <option value="">— aucune —</option>
                {refs.orders.filter((o) => !c.clientName || o.clientName === c.clientName).map((o) => <option key={o._id} value={o._id}>{[o.number || o.name, o.clientName].filter(Boolean).join(' · ')}</option>)}
              </select>
            </div>
          </div>
          <div className="grid2">
            <div className="field"><label>Intervenant</label><input value={c.person || ''} onChange={(e) => set('person', e.target.value)} /></div>
            <div className="field"><label>Mois</label><input type="month" value={c.month || ''} onChange={(e) => set('month', e.target.value)} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Référence</label><input value={c.reference || ''} onChange={(e) => set('reference', e.target.value)} /></div>
            <div className="field"><label>Devise</label><input value={c.currency || ''} onChange={(e) => set('currency', (e.target.value || '').toUpperCase())} /></div>
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="ts-alert">
          <strong>Incohérences à corriger</strong> (une journée ne peut pas dépasser 1 jour) :
          <ul>{issues.slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}</ul>
          {issues.length > 8 && <div className="muted">… et {issues.length - 8} autre(s).</div>}
        </div>
      )}

      <div className="ts-wrap">
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-label" rowSpan={3}>Activité</th>
              {weekGroups.map((g, i) => <th key={i} className="ts-week" colSpan={g.span}>S{g.week}</th>)}
            </tr>
            <tr>{days.map((d) => <th key={d.day} className={d.weekend ? 'ts-weekend' : ''}>{d.abbr}</th>)}</tr>
            <tr>{days.map((d) => <th key={d.day} className={d.weekend ? 'ts-weekend' : ''}>{d.day}</th>)}</tr>
          </thead>
          <tbody>
            <tr className="ts-total">
              <td className="ts-label">Total attendu — {expectedTotal} j</td>
              {days.map((d) => <td key={d.day} className={d.weekend ? 'ts-weekend' : ''}>{d.weekend ? '' : 1}</td>)}
            </tr>

            {c.activities.length === 0 && (
              <tr><td className="ts-label muted">Aucune activité</td><td colSpan={days.length} className="muted" style={{ textAlign: 'left' }}>{isDraft ? 'Cliquez « + Activité » pour commencer.' : '—'}</td></tr>
            )}

            {c.activities.map((a, ai) => (
              <tr key={ai}>
                <td className="ts-label">
                  <div className={`ts-cat ${a.category}`}>{CATS[a.category]}{a.category === 'production' && a.unitPrice ? ` · ${a.unitPrice} ${c.currency}/${a.unit || 'j'}` : ''}</div>
                  <div style={{ fontWeight: 600 }}>{a.label || '—'} <span className="muted">— {dayTotal(a.days)} j</span></div>
                  {a.clientRef && <div className="muted" style={{ fontSize: 12 }}>{a.clientRef}</div>}
                  {isDraft && (
                    <div style={{ marginTop: 3 }}>
                      <button className="btn btn-ghost" style={{ padding: '0 6px', fontSize: 12 }} onClick={() => setActModal({ index: ai, data: { ...a } })}>modifier</button>
                      <button className="link-danger" onClick={() => removeActivity(ai)} title="Retirer">×</button>
                    </div>
                  )}
                </td>
                {days.map((d) => {
                  const cv = (a.days || {})[d.day];
                  const bad = cellBad(cv);
                  return (
                    <td key={d.day} className={`${d.weekend ? 'ts-weekend' : ''}${bad ? ' ts-invalid' : ''}`}>
                      {isDraft ? (
                        <input className={`ts-cell${bad ? ' bad' : ''}`} type="number" step="0.5" min="0" max="1"
                          value={cv ?? ''} onChange={(e) => setDay(ai, d.day, e.target.value)} />
                      ) : (cv || '')}
                    </td>
                  );
                })}
              </tr>
            ))}

            <tr className="ts-total">
              <td className="ts-label">Total réalisé — {realisedTotal} j</td>
              {days.map((d) => { const rv = realised(d.day); return <td key={d.day} className={`${d.weekend ? 'ts-weekend' : ''}${rv > 1 + EPS ? ' ts-invalid' : ''}`}>{rv || ''}</td>; })}
            </tr>
          </tbody>
        </table>
      </div>

      {isDraft && (
        <div style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => setActModal({ index: null, data: { label: '', category: 'production', clientRef: '', contractId: c.contractId || '', orderId: c.orderId || '', orderNumber: c.orderNumber || '', unit: 'jour', unitPrice: 0, vatRate: 0 } })}>+ Activité</button>
        </div>
      )}

      <div className="ts-recap">
        {['production', 'absence', 'internal'].map((cat) => {
          const list = byCat(cat);
          const tot = list.reduce((s, o) => s + dayTotal(o.a.days), 0);
          return (
            <div className="box" key={cat}>
              <h4>{CATS[cat]}</h4>
              {list.length === 0 ? <div className="row"><span className="muted">—</span><span>0 j</span></div> : list.map((o, k) => (
                <div className="row" key={k}><span>{o.a.label || '—'}{o.a.clientRef ? <span className="muted"> · {o.a.clientRef}</span> : ''}</span><span>{dayTotal(o.a.days)} j</span></div>
              ))}
              <div className="row total"><span>TOTAL</span><span>{tot} j</span></div>
            </div>
          );
        })}
      </div>

      <div className="card-block" style={{ marginTop: 14, textAlign: 'right' }}>
        <div>Production facturable : <strong>{t.prod} j</strong></div>
        <div>Sous-total HT : <strong>{fmtMoney(t.subtotal, c.currency)}</strong></div>
        <div>TVA : <strong>{fmtMoney(t.vatTotal, c.currency)}</strong></div>
        <div style={{ fontSize: 18, color: 'var(--primary)' }}>Total TTC : <strong>{fmtMoney(t.total, c.currency)}</strong></div>
      </div>

      {c.status !== 'draft' && c.approverNote && (
        <p className="muted" style={{ marginTop: 8 }}>Note : {c.approverNote}</p>
      )}

      <div className="modal-actions" style={{ marginTop: 14 }}>
        {c._id && isDraft && <button className="btn btn-danger" onClick={remove} disabled={busy}>Supprimer</button>}
        {isDraft && <button className="btn" onClick={persist} disabled={busy}>Enregistrer</button>}
        {isDraft && c._id && <button className="btn btn-primary" onClick={submit} disabled={busy}>Soumettre</button>}
        {c.status === 'submitted' && <>
          <button className="btn btn-danger" onClick={reject} disabled={busy}>Refuser</button>
          <button className="btn btn-primary" onClick={approve} disabled={busy}>Approuver</button>
        </>}
        {c.status === 'rejected' && <button className="btn" onClick={reopen} disabled={busy}>Rouvrir</button>}
        {c.status === 'approved' && <button className="btn btn-primary" onClick={genInvoice} disabled={busy}>Générer la facture</button>}
      </div>

      {actModal && (
        <ActivityModal
          refs={refs} currency={c.currency} init={actModal.data} index={actModal.index}
          onClose={() => setActModal(null)} onSave={saveActivity}
        />
      )}
    </div>
  );
}

function ActivityModal({ refs, currency, init, index, onClose, onSave }) {
  const [d, setD] = useState(init);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const fromCatalog = (id) => {
    const p = refs.products.find((x) => x._id === id);
    if (!p) return;
    setD((x) => ({ ...x, label: x.label || p.name, unit: p.unit || x.unit || 'jour', unitPrice: Number(p.unitPrice) || 0, vatRate: Number(p.vatRate) || 0 }));
  };
  return (
    <Modal title={index == null ? 'Nouvelle activité' : 'Modifier l’activité'} onClose={onClose}>
      <div className="field"><label>Catégorie</label>
        <select value={d.category} onChange={(e) => set('category', e.target.value)}>
          <option value="production">Production (facturable)</option>
          <option value="absence">Absence (non facturé)</option>
          <option value="internal">Interne</option>
        </select>
      </div>
      <div className="field"><label>Libellé</label><input value={d.label || ''} onChange={(e) => set('label', e.target.value)} placeholder="ex : Normale, Congés, R&D interne…" /></div>
      <div className="field"><label>Référence / projet</label><input value={d.clientRef || ''} onChange={(e) => set('clientRef', e.target.value)} placeholder="ex : SAFRAN - MIS1991" /></div>

      {d.category === 'production' && (
        <>
          <div className="field"><label>Depuis le catalogue</label>
            <select value="" onChange={(e) => fromCatalog(e.target.value)}>
              <option value="">— choisir un produit —</option>
              {refs.products.map((p) => <option key={p._id} value={p._id}>{p.name}{p.unitPrice ? ` — ${p.unitPrice} ${p.currency || ''}` : ''}</option>)}
            </select>
          </div>
          <div className="grid2">
            <div className="field"><label>Unité</label><input value={d.unit || ''} onChange={(e) => set('unit', e.target.value)} /></div>
            <div className="field"><label>Prix unitaire HT ({currency})</label><input type="number" step="any" value={d.unitPrice ?? 0} onChange={(e) => set('unitPrice', Number(e.target.value))} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>TVA %</label><input type="number" step="any" value={d.vatRate ?? 0} onChange={(e) => set('vatRate', Number(e.target.value))} /></div>
            <div className="field"><label>Commande</label>
              <select value={d.orderId || ''} onChange={(e) => { const o = refs.orders.find((x) => x._id === e.target.value); set('orderId', e.target.value); set('orderNumber', o ? (o.number || '') : ''); }}>
                <option value="">— aucune —</option>
                {refs.orders.map((o) => <option key={o._id} value={o._id}>{[o.number || o.name, o.clientName].filter(Boolean).join(' · ')}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={() => onSave(d, index)} disabled={!d.label && d.category === 'production'}>{index == null ? 'Ajouter' : 'Enregistrer'}</button>
      </div>
    </Modal>
  );
}
