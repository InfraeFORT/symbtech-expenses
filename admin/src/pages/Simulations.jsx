// src/pages/Simulations.jsx — simulations d'impôt (kind: 'employee' | 'company').
import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import {
  listResource,
  listSimulations, createSimulation, updateSimulation, deleteSimulation, simulationDefaults, simulationPrefill,
} from '../api';

const SYM = { EUR: '€', MUR: 'Rs', USD: '$', ZAR: 'R', GBP: '£' };
const money = (n, c) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (SYM[c] || c || ''));
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const KIND = { employee: { word: 'salarié', title: 'Simulation impôt salarié' }, company: { word: 'société', title: 'Simulation impôt société' } };

function progressive(base, brackets) {
  base = Math.max(0, Number(base) || 0);
  const sorted = [...(brackets || [])].sort((a, b) => (a.upTo == null || a.upTo === '' ? Infinity : Number(a.upTo)) - (b.upTo == null || b.upTo === '' ? Infinity : Number(b.upTo)));
  let tax = 0, prev = 0;
  for (const b of sorted) {
    const cap = (b.upTo == null || b.upTo === '') ? Infinity : Number(b.upTo);
    tax += Math.max(0, Math.min(base, cap) - prev) * (Number(b.rate) || 0) / 100;
    prev = cap;
    if (base <= cap) break;
  }
  return r2(tax);
}
function compute(sim) {
  const lines = sim.lines || [];
  const sum = (t) => lines.filter((l) => l.type === t).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const income = sum('income'), charge = sum('charge'), relief = sum('relief');
  const base = r2(income - charge - relief);
  const parts = (sim.kind === 'employee' && sim.country === 'FR' && Number(sim.parts) > 0) ? Number(sim.parts) : 1;
  const tax = parts > 1 ? r2(parts * progressive(base / parts, sim.brackets)) : progressive(base, sim.brackets);
  let fairShare = 0;
  if (sim.fairShareEnabled) {
    const rate = Number(sim.fairShareRate) || 0;
    const thr = Number(sim.fairShareThreshold) || 0;
    const trigger = sim.kind === 'company' ? income : base;
    if (rate > 0 && trigger > thr) fairShare = r2(base * rate / 100);
  }
  const totalTax = r2(tax + fairShare);
  const effectiveRate = base > 0 ? r2((totalTax / base) * 100) : 0;
  const remaining = sim.kind === 'employee' ? r2(totalTax - (Number(sim.withheld) || 0)) : totalTax;
  return { totalIncome: r2(income), totalCharge: r2(charge), totalRelief: r2(relief), base, tax, fairShare, totalTax, effectiveRate, remaining };
}

function defaultFairShare(country, kind) {
  if (country !== 'MU') return { enabled: false, threshold: 0, rate: 0 };
  return kind === 'company' ? { enabled: true, threshold: 24000000, rate: 5 } : { enabled: true, threshold: 12000000, rate: 15 };
}

function primaryYear(label) {
  const m = String(label || '').match(/\d{4}/);
  return m ? Number(m[0]) : new Date().getFullYear();
}
// Période fiscale par défaut : France = année civile ; Maurice = 1er juillet → 30 juin (année de revenu).
function autoPeriod(country, kind, label) {
  const y = primaryYear(label);
  if (country === 'MU') return { from: `${y}-07-01`, to: `${y + 1}-06-30`, label: `${y}/${y + 1}` };
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
}

function blank(kind) {
  const fs = defaultFairShare('MU', kind);
  const per = autoPeriod('MU', kind, String(new Date().getFullYear()));
  return {
    kind, title: '', country: 'MU', currency: 'MUR', company: '', person: '', supplierId: '',
    fiscalYearLabel: per.label, periodFrom: per.from, periodTo: per.to, notes: '',
    lines: [], brackets: [], parts: 1, withheld: 0,
    fairShareEnabled: fs.enabled, fairShareThreshold: fs.threshold, fairShareRate: fs.rate,
    status: 'draft',
  };
}

export default function Simulations({ kind }) {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [current, setCurrent] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setItems((await listSimulations(kind, token)).items || []); } catch (e) { /* */ } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    listResource('companies', token).then((r) => setCompanies(r.items || [])).catch(() => {});
    listResource('suppliers', token).then((r) => setSuppliers(r.items || [])).catch(() => {});
  }, [kind]);

  if (current) return <Editor kind={kind} token={token} companies={companies} suppliers={suppliers} initial={current} onBack={() => { setCurrent(null); load(); }} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>{items.length} simulation(s) — impôt {KIND[kind].word}</p>
        <button className="btn btn-primary" onClick={() => setCurrent(blank(kind))}>+ Nouvelle simulation</button>
      </div>
      {loading ? <p className="muted">Chargement…</p> : items.length === 0 ? (
        <p className="muted">Aucune simulation.</p>
      ) : (
        <table className="table">
          <thead><tr><th>Titre</th><th>Période</th><th>{kind === 'employee' ? 'Salarié' : 'Société'}</th><th>Pays</th><th style={{ textAlign: 'right' }}>Base</th><th style={{ textAlign: 'right' }}>Impôt estimé</th></tr></thead>
          <tbody>
            {items.map((s) => (
              <tr key={s._id} className="clickable" onClick={() => setCurrent(s)}>
                <td>{s.title || '—'}</td>
                <td>{s.fiscalYearLabel || '—'}</td>
                <td>{(kind === 'employee' ? s.person : s.company) || '—'}</td>
                <td>{s.country}</td>
                <td style={{ textAlign: 'right' }}>{money(s.base, s.currency)}</td>
                <td style={{ textAlign: 'right' }}>{money(s.tax, s.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Editor({ kind, token, companies, suppliers, initial, onBack }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const t = compute({ ...s });
  const cur = s.currency || (s.country === 'MU' ? 'MUR' : 'EUR');
  const m = (n) => money(n, cur);
  const isEmp = kind === 'employee';
  const individuals = (suppliers || []).filter((x) => x.isIndividual);

  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const onCountry = (c) => { const fs = defaultFairShare(c, kind); const per = autoPeriod(c, kind, s.fiscalYearLabel); setS((x) => ({ ...x, country: c, currency: c === 'MU' ? 'MUR' : 'EUR', fairShareEnabled: fs.enabled, fairShareThreshold: fs.threshold, fairShareRate: fs.rate, fiscalYearLabel: per.label, periodFrom: per.from, periodTo: per.to })); };
  const onLabel = (v) => { const per = autoPeriod(s.country, kind, v); setS((x) => ({ ...x, fiscalYearLabel: v, periodFrom: per.from, periodTo: per.to })); };
  const onPerson = (id) => {
    const sup = individuals.find((x) => x._id === id);
    if (!sup) { setS((x) => ({ ...x, supplierId: '', person: '' })); return; }
    const name = [sup.civility, sup.firstName, sup.lastName].filter(Boolean).join(' ').trim() || sup.name;
    const emp = sup.employment || {};
    setS((x) => ({ ...x, supplierId: id, person: name, country: emp.country || x.country, currency: emp.currency || (emp.country === 'MU' ? 'MUR' : emp.country === 'FR' ? 'EUR' : x.currency) }));
  };

  const setLine = (i, k, v) => setS((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const addLine = (type) => setS((x) => ({ ...x, lines: [...x.lines, { label: '', type: type || 'income', nature: 'adjust', amount: 0, note: '' }] }));
  const rmLine = (i) => setS((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }));

  const setBr = (i, k, v) => setS((x) => ({ ...x, brackets: x.brackets.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const addBr = () => setS((x) => ({ ...x, brackets: [...x.brackets, { upTo: null, rate: 0 }] }));
  const rmBr = (i) => setS((x) => ({ ...x, brackets: x.brackets.filter((_, j) => j !== i) }));
  const loadDefaults = async () => {
    try {
      const r = await simulationDefaults({ country: s.country, kind }, token);
      const fs = r.fairShare || {};
      setS((x) => ({ ...x, brackets: r.brackets || [], fairShareEnabled: !!fs.enabled, fairShareThreshold: fs.threshold || 0, fairShareRate: fs.rate || 0 }));
    } catch (e) { alert(e.message); }
  };

  const prefill = async () => {
    setBusy(true);
    try {
      const r = await simulationPrefill({ kind, country: s.country, company: s.company, person: s.person, supplierId: s.supplierId, periodFrom: s.periodFrom, periodTo: s.periodTo, currency: s.currency }, token);
      setS((x) => {
        const fs = r.fairShare || {};
        const hasBr = x.brackets && x.brackets.length;
        return {
          ...x,
          lines: [...x.lines, ...(r.lines || [])],
          withheld: isEmp ? (r.withheld || x.withheld) : x.withheld,
          currency: x.currency || r.currency || cur,
          brackets: hasBr ? x.brackets : (r.brackets || []),
          fairShareEnabled: hasBr ? x.fairShareEnabled : !!fs.enabled,
          fairShareThreshold: hasBr ? x.fairShareThreshold : (fs.threshold || 0),
          fairShareRate: hasBr ? x.fairShareRate : (fs.rate || 0),
        };
      });
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const save = async () => {
    if (!s.title) { alert('Donne un titre à la simulation.'); return; }
    setBusy(true);
    try {
      const body = { ...s, status: 'saved' };
      const saved = s._id ? await updateSimulation(s._id, body, token) : await createSimulation(body, token);
      setS(saved);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const remove = async () => { if (!s._id) { onBack(); return; } if (!window.confirm('Supprimer cette simulation ?')) return; try { await deleteSimulation(s._id, token); onBack(); } catch (e) { alert(e.message); } };

  return (
    <div>
      <button className="btn btn-ghost" onClick={onBack}>← Retour aux simulations</button>
      <h2 style={{ margin: '10px 0' }}>{KIND[kind].title}</h2>

      <div className="card-block" style={{ marginBottom: 12 }}>
        <div className="field"><label>Titre</label><input value={s.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="ex. Simulation IR 2026 — J. Vitière" /></div>
        <div className="grid2">
          <div className="field"><label>Pays / régime</label>
            <select value={s.country} onChange={(e) => onCountry(e.target.value)}><option value="MU">Maurice</option><option value="FR">France</option></select>
          </div>
          <div className="field"><label>Devise</label><input value={s.currency || ''} onChange={(e) => set('currency', (e.target.value || '').toUpperCase())} /></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Société{isEmp ? ' (employeur)' : ''}</label>
            <select value={s.company || ''} onChange={(e) => set('company', e.target.value)}>
              <option value="">— choisir —</option>
              {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          {isEmp ? (
            <div className="field"><label>Salarié</label>
              <select value={s.supplierId || ''} onChange={(e) => onPerson(e.target.value)}>
                <option value="">— choisir —</option>
                {individuals.map((x) => <option key={x._id} value={x._id}>{[x.civility, x.firstName, x.lastName].filter(Boolean).join(' ').trim() || x.name}</option>)}
              </select>
            </div>
          ) : <div className="field" />}
        </div>
        <div className="grid2">
          <div className="field"><label>Période fiscale (année)</label><input value={s.fiscalYearLabel || ''} onChange={(e) => onLabel(e.target.value)} placeholder="2026" /></div>
          <div className="field" />
        </div>
        <div className="grid2">
          <div className="field"><label>Du</label><input type="date" value={s.periodFrom || ''} onChange={(e) => set('periodFrom', e.target.value)} /></div>
          <div className="field"><label>Au</label><input type="date" value={s.periodTo || ''} onChange={(e) => set('periodTo', e.target.value)} /></div>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 4px' }}>
          {s.country === 'MU' ? 'Maurice : année de revenu du 1er juillet au 30 juin.' : 'France : année civile (1er janvier – 31 décembre).'} Dates ajustables si l’exercice diffère.
        </p>
        <div className="field"><label>Notes (champ libre)</label>
          <textarea value={s.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={2} style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, resize: 'vertical' }} />
        </div>
      </div>

      <div className="card-block" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <strong>Éléments {isEmp ? '(revenus & abattements)' : '(produits & charges)'}</strong>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={prefill} disabled={busy}>Pré-remplir depuis le réel</button>
            <button className="btn btn-ghost" onClick={() => addLine('income')}>+ {isEmp ? 'Revenu' : 'Produit'}</button>
            <button className="btn btn-ghost" onClick={() => addLine('charge')}>+ Charge</button>
            <button className="btn btn-ghost" onClick={() => addLine('relief')}>+ Abattement</button>
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ boxShadow: 'none', minWidth: 720 }}>
            <thead><tr><th>Libellé</th><th>Type</th><th>Nature</th><th style={{ textAlign: 'right' }}>Montant</th><th></th></tr></thead>
            <tbody>
              {(s.lines || []).map((l, i) => (
                <tr key={i}>
                  <td style={{ minWidth: 240 }}><input style={{ width: '100%', padding: 3, fontSize: 13 }} value={l.label || ''} onChange={(e) => setLine(i, 'label', e.target.value)} />{l.note ? <div className="muted" style={{ fontSize: 11 }}>{l.note}</div> : null}</td>
                  <td>
                    <select value={l.type} onChange={(e) => setLine(i, 'type', e.target.value)} style={{ padding: 3, fontSize: 13 }}>
                      <option value="income">{isEmp ? 'Revenu' : 'Produit'}</option>
                      <option value="charge">Charge</option>
                      <option value="relief">Abattement</option>
                    </select>
                  </td>
                  <td>
                    <select value={l.nature} onChange={(e) => setLine(i, 'nature', e.target.value)} style={{ padding: 3, fontSize: 13 }}>
                      <option value="real">Réel</option>
                      <option value="forecast">Prévision</option>
                      <option value="adjust">Ajustement</option>
                    </select>
                  </td>
                  <td><input style={{ width: 130, padding: 3, textAlign: 'right', fontSize: 13 }} type="number" step="any" value={l.amount} onChange={(e) => setLine(i, 'amount', e.target.value === '' ? '' : Number(e.target.value))} /></td>
                  <td><button className="link-danger" onClick={() => rmLine(i)}>×</button></td>
                </tr>
              ))}
              {(s.lines || []).length === 0 && <tr><td colSpan={5} className="muted">Aucun élément — « Pré-remplir depuis le réel » ou ajoute des lignes.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-block" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
          <strong>Barème d'imposition</strong>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={loadDefaults}>Barème par défaut ({s.country})</button>
            <button className="btn btn-ghost" onClick={addBr}>+ Tranche</button>
          </span>
        </div>
        <table className="table" style={{ boxShadow: 'none', maxWidth: 420 }}>
          <thead><tr><th>Jusqu'à (vide = au-delà)</th><th style={{ textAlign: 'right' }}>Taux %</th><th></th></tr></thead>
          <tbody>
            {(s.brackets || []).map((b, i) => (
              <tr key={i}>
                <td><input style={{ width: 150, padding: 3, fontSize: 13 }} type="number" step="any" value={b.upTo ?? ''} onChange={(e) => setBr(i, 'upTo', e.target.value === '' ? null : Number(e.target.value))} /></td>
                <td><input style={{ width: 80, padding: 3, textAlign: 'right', fontSize: 13 }} type="number" step="any" value={b.rate} onChange={(e) => setBr(i, 'rate', e.target.value === '' ? 0 : Number(e.target.value))} /></td>
                <td><button className="link-danger" onClick={() => rmBr(i)}>×</button></td>
              </tr>
            ))}
            {(s.brackets || []).length === 0 && <tr><td colSpan={3} className="muted">Aucune tranche — clique « Barème par défaut ».</td></tr>}
          </tbody>
        </table>
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={!!s.fairShareEnabled} onChange={(e) => set('fairShareEnabled', e.target.checked)} style={{ width: 'auto' }} />
            Fair Share Contribution {isEmp ? '(> 12 M : 15 %)' : '(CA > 24 M : 5 %)'}
          </label>
          {s.fairShareEnabled && (
            <div className="grid2" style={{ marginTop: 6 }}>
              <div className="field"><label>Seuil de déclenchement ({isEmp ? 'revenu imposable' : 'chiffre d’affaires'})</label><input type="number" step="any" value={s.fairShareThreshold ?? 0} onChange={(e) => set('fairShareThreshold', e.target.value === '' ? 0 : Number(e.target.value))} /></div>
              <div className="field"><label>Taux (%) sur base imposable</label><input type="number" step="any" value={s.fairShareRate ?? 0} onChange={(e) => set('fairShareRate', e.target.value === '' ? 0 : Number(e.target.value))} /></div>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Maurice, en vigueur du 1er juillet 2025 au 30 juin 2028. Ne s'applique qu'au-delà du seuil.</p>
        </div>

        {isEmp && (
          <div className="grid2" style={{ marginTop: 8 }}>
            {s.country === 'FR' && <div className="field"><label>Parts (quotient familial)</label><input type="number" step="any" value={s.parts ?? 1} onChange={(e) => set('parts', e.target.value === '' ? 1 : Number(e.target.value))} /></div>}
            <div className="field"><label>Impôt déjà retenu (PAYE/PAS)</label><input type="number" step="any" value={s.withheld ?? 0} onChange={(e) => set('withheld', e.target.value === '' ? 0 : Number(e.target.value))} /></div>
          </div>
        )}
      </div>

      <div className="card-block" style={{ marginBottom: 12 }}>
        <div style={{ textAlign: 'right', lineHeight: 1.9 }}>
          <div>Total {isEmp ? 'revenus' : 'produits'} : <strong>{m(t.totalIncome)}</strong></div>
          {t.totalCharge ? <div>Total charges : <strong>− {m(t.totalCharge)}</strong></div> : null}
          {t.totalRelief ? <div>Total abattements : <strong>− {m(t.totalRelief)}</strong></div> : null}
          <div>Base imposable : <strong>{m(t.base)}</strong></div>
          <div>Impôt (barème) : <strong>{m(t.tax)}</strong></div>
          {t.fairShare ? <div>Fair Share Contribution ({s.fairShareRate} %) : <strong>+ {m(t.fairShare)}</strong></div> : null}
          <div style={{ fontSize: 18, color: 'var(--primary)' }}>Impôt total estimé : <strong>{m(t.totalTax)}</strong> <span className="muted" style={{ fontSize: 13 }}>(taux effectif {t.effectiveRate} %)</span></div>
          {isEmp && <div>Reste à payer (après retenues) : <strong>{m(t.remaining)}</strong></div>}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12 }}>Estimation indicative à vérifier ({s.country === 'MU' ? 'MRA — Maurice' : 'DGFiP — France'}). Les barèmes et éléments sont modifiables.</p>

      <div className="modal-actions">
        {s._id && <button className="btn btn-danger" onClick={remove} disabled={busy}>Supprimer</button>}
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </div>
  );
}
