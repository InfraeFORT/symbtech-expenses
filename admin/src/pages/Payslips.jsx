// src/pages/Payslips.jsx — bulletins de paie (France & Maurice) : éditeur + rendu imprimable.
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import {
  listResource, getCompanyLogoUrl,
  listPayslips, getPayslip, createPayslip, updatePayslip, finalizePayslip, reopenPayslip, deletePayslip, defaultPayslipContributions, computePaye,
} from '../api';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const monthLabel = (m) => { if (!m) return ''; const [y, mo] = m.split('-').map(Number); return `${MONTHS[mo - 1]} ${y}`; };
const curMonth = () => new Date().toISOString().slice(0, 7);
const SYM = { EUR: '€', MUR: 'Rs', USD: '$', ZAR: 'R', GBP: '£' };
const money = (n, c) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (SYM[c] || c || ''));
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const COUNTRY = { FR: 'France', MU: 'Maurice' };

function totals(p) {
  const gains = (p.gains || []).reduce((s, g) => s + (Number(g.amount) || 0), 0);
  const brut = r2((Number(p.baseSalary) || 0) + gains);
  let emp = 0, er = 0;
  for (const l of p.contributions || []) { emp += Number(l.employeeAmount) || 0; er += Number(l.employerAmount) || 0; }
  const totalEmployee = r2(emp), totalEmployer = r2(er);
  const netBeforeTax = r2(brut - totalEmployee);
  const taxRate = Number(p.taxRate) || 0;
  const taxAmount = p.taxMode === 'amount' ? r2(Number(p.taxFixedAmount) || 0) : r2(netBeforeTax * taxRate / 100);
  const reimb = Number(p.expenseReimbursement) || 0;
  const netPaid = r2(netBeforeTax - taxAmount + reimb);
  return { grossTotal: brut, totalEmployee, totalEmployer, netBeforeTax, netSocial: netBeforeTax, taxAmount, netPaid, employerCost: r2(brut + totalEmployer) };
}

const STATUS = { draft: { label: 'Brouillon', color: '#6b7280' }, finalized: { label: 'Finalisé', color: '#166534' } };

function blank() {
  return {
    company: '', country: 'FR', currency: 'EUR', employer: {}, employee: { isCadre: false },
    month: curMonth(), periodLabel: '', periodFrom: '', periodTo: '', paymentDate: '',
    baseSalary: 0, workedHours: 151.67, hourlyRate: null, gains: [],
    pmss: 4005, nsfCeiling: 28570, csgThreshold: 50000, contributions: [], taxRate: 0, expenseReimbursement: 0,
    status: 'draft',
  };
}

export default function Payslips() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [current, setCurrent] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setItems((await listPayslips(token)).items || []); } catch (e) { /* */ } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    listResource('companies', token).then((r) => setCompanies(r.items || [])).catch(() => {});
    listResource('suppliers', token).then((r) => setSuppliers(r.items || [])).catch(() => {});
  }, []);

  if (current) return <Sheet token={token} companies={companies} suppliers={suppliers} initial={current} onBack={() => { setCurrent(null); load(); }} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>{items.length} bulletin(s)</p>
        <button className="btn btn-primary" onClick={() => setCurrent(blank())}>+ Nouveau bulletin</button>
      </div>
      {loading ? <p className="muted">Chargement…</p> : items.length === 0 ? (
        <p className="muted">Aucun bulletin de paie.</p>
      ) : (
        <table className="table">
          <thead><tr><th>Période</th><th>Salarié</th><th>Pays</th><th>Société</th><th style={{ textAlign: 'right' }}>Brut</th><th style={{ textAlign: 'right' }}>Net payé</th><th>Statut</th></tr></thead>
          <tbody>
            {items.map((p) => {
              const st = STATUS[p.status] || STATUS.draft;
              return (
                <tr key={p._id} className="clickable" onClick={() => setCurrent(p)}>
                  <td>{monthLabel(p.month) || p.periodLabel || '—'}</td>
                  <td>{p.employee?.name || '—'}</td>
                  <td>{COUNTRY[p.country] || p.country || '—'}</td>
                  <td>{p.company || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{money(p.grossTotal, p.currency)}</td>
                  <td style={{ textAlign: 'right' }}>{money(p.netPaid, p.currency)}</td>
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

function Sheet({ token, companies, suppliers, initial, onBack }) {
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [empSup, setEmpSup] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [payeInfo, setPayeInfo] = useState(null);

  const calcPaye = async () => {
    setBusy(true);
    try {
      const gains = (p.gains || []).reduce((s, g) => s + (Number(g.amount) || 0), 0);
      const monthlyGross = (Number(p.baseSalary) || 0) + gains;
      const r = await computePaye({ monthlyGross, monthsPerYear: p.monthsPerYear || 12, reliefs: p.edfReliefs || 0 }, token);
      setPayeInfo(r);
      setP((x) => ({ ...x, taxMode: 'amount', taxFixedAmount: r.monthlyTax, taxRate: r.effectiveRate }));
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const individuals = (suppliers || []).filter((s) => s.isIndividual);

  useEffect(() => {
    let on = true;
    const c = (companies || []).find((x) => x.name === p.company);
    if (c && c._id && c.imageKey) {
      getCompanyLogoUrl(c._id, token).then((r) => { if (on) setLogoUrl(r.url); }).catch(() => { if (on) setLogoUrl(null); });
    } else {
      setLogoUrl(null);
    }
    return () => { on = false; };
  }, [p.company, companies]);
  const draft = p.status !== 'finalized';
  const t = totals(p);
  const cur = p.currency || 'EUR';
  const m = (n) => money(n, cur);
  const isMU = p.country === 'MU';
  const taxLabel = isMU ? 'PAYE (impôt retenu)' : 'Prélèvement à la source';

  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const setEmployer = (k, v) => setP((x) => ({ ...x, employer: { ...x.employer, [k]: v } }));
  const setEmployee = (k, v) => setP((x) => ({ ...x, employee: { ...x.employee, [k]: v } }));
  const onCountry = (c) => setP((x) => ({ ...x, country: c, currency: c === 'MU' ? 'MUR' : 'EUR' }));

  const onCompany = (name) => {
    const c = companies.find((x) => x.name === name);
    setP((x) => ({
      ...x, company: name,
      employer: {
        ...x.employer,
        name: x.employer?.name || name,
        siret: x.employer?.siret || c?.regNumber || '',
        apeCode: x.employer?.apeCode || c?.apeCode || '',
        urssafNumber: x.employer?.urssafNumber || c?.urssafNumber || '',
        conventionCollective: x.employer?.conventionCollective || c?.conventionCollective || '',
        address: x.employer?.address || [c?.address1, c?.address2, [c?.postalCode, c?.city].filter(Boolean).join(' '), c?.country].filter(Boolean).join(', '),
      },
    }));
  };

  const onPickEmployeeSupplier = (id) => {
    setEmpSup(id);
    const s = individuals.find((x) => x._id === id);
    if (!s) return;
    const fullName = [s.civility, s.firstName, s.lastName].filter(Boolean).join(' ').trim() || s.name || '';
    const addr = [s.address1, s.address2, [s.postalCode, s.city].filter(Boolean).join(' '), s.country].filter(Boolean).join(', ');
    const emp = s.employment || {};
    const isEmp = !!s.isEmployee;
    setP((x) => {
      const country = (isEmp && emp.country) ? emp.country : x.country;
      const currency = (isEmp && emp.currency) ? emp.currency : (isEmp && emp.country ? (emp.country === 'MU' ? 'MUR' : 'EUR') : x.currency);
      const gains = isEmp ? (emp.bonuses || []).filter((b) => b.recurring).map((b) => ({ label: b.label || 'Prime', amount: Number(b.amount) || 0 })) : x.gains;
      return {
        ...x,
        country,
        currency,
        baseSalary: (isEmp && emp.monthlyGross) ? emp.monthlyGross : x.baseSalary,
        workedHours: (isEmp && emp.workedHours) ? emp.workedHours : x.workedHours,
        monthsPerYear: (isEmp && emp.monthsPerYear) ? emp.monthsPerYear : x.monthsPerYear,
        company: (isEmp && emp.company) ? emp.company : x.company,
        gains,
        employee: {
          ...x.employee,
          name: fullName || x.employee?.name || '',
          socialSecurityNumber: s.nationalId || x.employee?.socialSecurityNumber || '',
          address: addr || x.employee?.address || '',
          position: isEmp ? (emp.position || x.employee?.position || '') : x.employee?.position,
          classification: isEmp ? (emp.classification || x.employee?.classification || '') : x.employee?.classification,
          coefficient: isEmp ? (emp.coefficient || x.employee?.coefficient || '') : x.employee?.coefficient,
          hireDate: isEmp ? (emp.startDate || x.employee?.hireDate || '') : x.employee?.hireDate,
          isCadre: isEmp ? !!emp.isCadre : x.employee?.isCadre,
        },
      };
    });
  };

  const setGain = (i, k, v) => setP((x) => ({ ...x, gains: x.gains.map((g, j) => (j === i ? { ...g, [k]: v } : g)) }));
  const addGain = () => setP((x) => ({ ...x, gains: [...x.gains, { label: '', amount: 0 }] }));
  const rmGain = (i) => setP((x) => ({ ...x, gains: x.gains.filter((_, j) => j !== i) }));

  const genContribs = async () => {
    const brut = (Number(p.baseSalary) || 0) + (p.gains || []).reduce((s, g) => s + (Number(g.amount) || 0), 0);
    if (brut <= 0) { alert('Renseigne d’abord le salaire de base.'); return; }
    setBusy(true);
    try {
      const params = isMU
        ? { country: 'MU', brut, nsfCeiling: p.nsfCeiling || 28570, csgThreshold: p.csgThreshold || 50000 }
        : { country: 'FR', brut, pmss: p.pmss || 4005, isCadre: !!p.employee?.isCadre };
      const r = await defaultPayslipContributions(params, token);
      setP((x) => ({ ...x, contributions: r.contributions || [] }));
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const setContrib = (i, field, value) => setP((x) => ({
    ...x,
    contributions: x.contributions.map((l, j) => {
      if (j !== i) return l;
      const n = { ...l, [field]: value };
      const base = Number(n.base) || 0;
      if (field === 'base' || field === 'employeeRate') n.employeeAmount = r2(base * (Number(n.employeeRate) || 0) / 100);
      if (field === 'base' || field === 'employerRate') n.employerAmount = r2(base * (Number(n.employerRate) || 0) / 100);
      return n;
    }),
  }));
  const addContrib = () => setP((x) => ({ ...x, contributions: [...x.contributions, { label: '', category: '', base: 0, employeeRate: 0, employeeAmount: 0, employerRate: 0, employerAmount: 0 }] }));
  const rmContrib = (i) => setP((x) => ({ ...x, contributions: x.contributions.filter((_, j) => j !== i) }));

  const persist = async () => {
    setBusy(true);
    try {
      const body = { ...p };
      const saved = p._id ? await updatePayslip(p._id, body, token) : await createPayslip(body, token);
      setP(saved); return saved;
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const act = async (fn) => { setBusy(true); try { const r = await fn(); if (r && r._id) setP(r); } catch (e) { alert(e.message); } finally { setBusy(false); } };
  const finalize = async () => {
    setBusy(true);
    try {
      const body = { ...p };
      const saved = p._id ? await updatePayslip(p._id, body, token) : await createPayslip(body, token);
      const fin = await finalizePayslip(saved._id, token);
      setP(fin);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const reopen = () => act(() => reopenPayslip(p._id, token));
  const remove = async () => { if (!p._id) { onBack(); return; } if (!window.confirm('Supprimer ce bulletin ?')) return; try { await deletePayslip(p._id, token); onBack(); } catch (e) { alert(e.message); } };

  const field = (label, val, onCh, type = 'text', dis = !draft) => (
    <div className="field"><label>{label}</label>
      <input type={type} value={val ?? ''} disabled={dis} onChange={(e) => onCh(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />
    </div>
  );

  return (
    <div>
      <button className="btn btn-ghost" onClick={onBack}>← Retour aux bulletins</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0' }}>
        <h2 style={{ margin: 0 }}>Bulletin — {monthLabel(p.month)}{p.employee?.name ? ` · ${p.employee.name}` : ''}</h2>
        <span style={{ color: (STATUS[p.status] || {}).color, fontWeight: 700 }}>{(STATUS[p.status] || {}).label}</span>
      </div>

      <div className="card-block" style={{ marginBottom: 12 }}>
        <div className="grid2">
          <div className="field"><label>Pays / régime</label>
            <select value={p.country} disabled={!draft} onChange={(e) => onCountry(e.target.value)}>
              <option value="FR">France</option>
              <option value="MU">Maurice</option>
            </select>
          </div>
          <div className="field"><label>Devise</label>
            <input value={p.currency || ''} disabled={!draft} onChange={(e) => set('currency', (e.target.value || '').toUpperCase())} />
          </div>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {isMU
            ? 'Modèle Maurice indicatif : CSG (1,5/3 % salarié · 3/6 % employeur), NSF (1 % / 2,5 %, plafonné), Training Levy 1,5 %. PAYE progressif à saisir. Vérifie taux, plafonds et PAYE auprès de la MRA.'
            : 'Modèle France indicatif (secteur privé, PMSS 2026 = 4 005 €). Vérifie taux, plafond et AT/MP selon ta convention et l’URSSAF. Tout est modifiable.'}
        </p>
      </div>

      <div className="card-block" style={{ marginBottom: 12 }}>
        <strong>Employeur</strong>
        <div className="grid2">
          <div className="field"><label>Société</label>
            <select value={p.company || ''} disabled={!draft} onChange={(e) => onCompany(e.target.value)}>
              <option value="">— choisir —</option>
              {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          {field('Raison sociale', p.employer?.name, (v) => setEmployer('name', v))}
        </div>
        <div className="grid2">
          {field(isMU ? 'BRN / N° employeur' : 'SIRET', p.employer?.siret, (v) => setEmployer('siret', v))}
          {field(isMU ? 'Secteur' : 'Code APE/NAF', p.employer?.apeCode, (v) => setEmployer('apeCode', v))}
        </div>
        <div className="grid2">
          {field(isMU ? 'ERN (MRA)' : 'N° URSSAF', p.employer?.urssafNumber, (v) => setEmployer('urssafNumber', v))}
          {field('Convention collective', p.employer?.conventionCollective, (v) => setEmployer('conventionCollective', v))}
        </div>
        {field('Adresse', p.employer?.address, (v) => setEmployer('address', v))}
      </div>

      <div className="card-block" style={{ marginBottom: 12 }}>
        <strong>Salarié</strong>
        {individuals.length > 0 && (
          <div className="field"><label>Depuis un fournisseur « personne physique »</label>
            <select value={empSup} disabled={!draft} onChange={(e) => onPickEmployeeSupplier(e.target.value)}>
              <option value="">— saisie manuelle —</option>
              {individuals.map((s) => (
                <option key={s._id} value={s._id}>{[s.civility, s.firstName, s.lastName].filter(Boolean).join(' ').trim() || s.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="grid2">
          {field('Nom et prénom', p.employee?.name, (v) => setEmployee('name', v))}
          {field(isMU ? 'N° NIC / ID' : 'N° de sécurité sociale', p.employee?.socialSecurityNumber, (v) => setEmployee('socialSecurityNumber', v))}
        </div>
        <div className="grid2">
          {field('Emploi / poste', p.employee?.position, (v) => setEmployee('position', v))}
          {field('Classification', p.employee?.classification, (v) => setEmployee('classification', v))}
        </div>
        <div className="grid2">
          {field('Coefficient', p.employee?.coefficient, (v) => setEmployee('coefficient', v))}
          {field('Date d’entrée', p.employee?.hireDate, (v) => setEmployee('hireDate', v), 'date')}
        </div>
        <div className="grid2">
          {field('Adresse', p.employee?.address, (v) => setEmployee('address', v))}
          {!isMU && (
            <div className="field"><label>Statut cadre</label>
              <select value={p.employee?.isCadre ? 'yes' : 'no'} disabled={!draft} onChange={(e) => setEmployee('isCadre', e.target.value === 'yes')}>
                <option value="no">Non-cadre</option><option value="yes">Cadre</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="card-block" style={{ marginBottom: 12 }}>
        <strong>Période & rémunération</strong>
        <div className="grid2">
          {field('Mois', p.month, (v) => set('month', v), 'month')}
          {field('Date de paiement', p.paymentDate, (v) => set('paymentDate', v), 'date')}
        </div>
        <div className="grid2">
          {field('Du', p.periodFrom, (v) => set('periodFrom', v), 'date')}
          {field('Au', p.periodTo, (v) => set('periodTo', v), 'date')}
        </div>
        <div className="grid2">
          {field('Salaire de base brut', p.baseSalary, (v) => set('baseSalary', v), 'number')}
          {field('Heures travaillées', p.workedHours, (v) => set('workedHours', v), 'number')}
        </div>
        <div className="fieldlist">
          <div className="fieldlist-head"><span>Primes & gains</span>{draft && <button className="btn btn-ghost" onClick={addGain}>+ Gain</button>}</div>
          {(p.gains || []).map((g, i) => (
            <div className="fieldlist-row" key={i}>
              <input style={{ flex: 1 }} placeholder="Libellé (prime, HS…)" value={g.label} disabled={!draft} onChange={(e) => setGain(i, 'label', e.target.value)} />
              <input style={{ flex: '0 0 140px' }} type="number" step="any" placeholder="Montant" value={g.amount} disabled={!draft} onChange={(e) => setGain(i, 'amount', e.target.value === '' ? '' : Number(e.target.value))} />
              {draft && <button className="link-danger" onClick={() => rmGain(i)}>×</button>}
            </div>
          ))}
          <div style={{ textAlign: 'right', marginTop: 6 }}>Salaire brut : <strong>{m(t.grossTotal)}</strong></div>
        </div>
      </div>

      <div className="card-block" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
          <strong>Cotisations & contributions</strong>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {isMU ? (
              <>
                <label className="muted" style={{ fontSize: 12 }}>Plafond NSF <input type="number" step="any" value={p.nsfCeiling ?? ''} disabled={!draft} onChange={(e) => set('nsfCeiling', e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 90 }} /></label>
                <label className="muted" style={{ fontSize: 12 }}>Seuil CSG <input type="number" step="any" value={p.csgThreshold ?? ''} disabled={!draft} onChange={(e) => set('csgThreshold', e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 90 }} /></label>
              </>
            ) : (
              <label className="muted" style={{ fontSize: 12 }}>PMSS <input type="number" step="any" value={p.pmss ?? ''} disabled={!draft} onChange={(e) => set('pmss', e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 90 }} /></label>
            )}
            {draft && <button className="btn" onClick={genContribs} disabled={busy}>Générer le modèle {p.country}</button>}
            {draft && <button className="btn btn-ghost" onClick={addContrib}>+ Ligne</button>}
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ boxShadow: 'none', minWidth: 720 }}>
            <thead><tr>
              <th>Cotisation</th><th style={{ textAlign: 'right' }}>Base</th>
              <th style={{ textAlign: 'right' }}>Tx sal.</th><th style={{ textAlign: 'right' }}>Part sal.</th>
              <th style={{ textAlign: 'right' }}>Tx pat.</th><th style={{ textAlign: 'right' }}>Part pat.</th><th></th>
            </tr></thead>
            <tbody>
              {(p.contributions || []).map((l, i) => (
                <tr key={i}>
                  <td style={{ minWidth: 240 }}>
                    <input style={{ width: '100%', padding: 3, fontSize: 13 }} value={l.label} disabled={!draft} onChange={(e) => setContrib(i, 'label', e.target.value)} />
                    {l.category && <div className="muted" style={{ fontSize: 11 }}>{l.category}</div>}
                  </td>
                  <td><input style={{ width: 90, padding: 3, textAlign: 'right', fontSize: 13 }} type="number" step="any" value={l.base} disabled={!draft} onChange={(e) => setContrib(i, 'base', Number(e.target.value))} /></td>
                  <td><input style={{ width: 64, padding: 3, textAlign: 'right', fontSize: 13 }} type="number" step="any" value={l.employeeRate} disabled={!draft} onChange={(e) => setContrib(i, 'employeeRate', Number(e.target.value))} /></td>
                  <td><input style={{ width: 84, padding: 3, textAlign: 'right', fontSize: 13 }} type="number" step="any" value={l.employeeAmount} disabled={!draft} onChange={(e) => setContrib(i, 'employeeAmount', Number(e.target.value))} /></td>
                  <td><input style={{ width: 64, padding: 3, textAlign: 'right', fontSize: 13 }} type="number" step="any" value={l.employerRate} disabled={!draft} onChange={(e) => setContrib(i, 'employerRate', Number(e.target.value))} /></td>
                  <td><input style={{ width: 84, padding: 3, textAlign: 'right', fontSize: 13 }} type="number" step="any" value={l.employerAmount} disabled={!draft} onChange={(e) => setContrib(i, 'employerAmount', Number(e.target.value))} /></td>
                  <td>{draft && <button className="link-danger" onClick={() => rmContrib(i)}>×</button>}</td>
                </tr>
              ))}
              {(p.contributions || []).length === 0 && <tr><td colSpan={7} className="muted">Aucune cotisation — clique « Générer le modèle {p.country} ».</td></tr>}
            </tbody>
            <tfoot><tr style={{ fontWeight: 700 }}>
              <td>Totaux</td><td></td><td></td>
              <td style={{ textAlign: 'right' }}>{m(t.totalEmployee)}</td><td></td>
              <td style={{ textAlign: 'right' }}>{m(t.totalEmployer)}</td><td></td>
            </tr></tfoot>
          </table>
        </div>
      </div>

      <div className="card-block" style={{ marginBottom: 12 }}>
        <strong>Net & impôt</strong>
        <div className="grid2">
          <div className="field"><label>Mode d'imposition</label>
            <select value={p.taxMode || 'rate'} onChange={(e) => set('taxMode', e.target.value)}>
              <option value="rate">Taux (%) saisi</option>
              <option value="amount">Montant calculé{isMU ? ' (barème MRA)' : ''}</option>
            </select>
          </div>
          {field('Remboursement de frais (non soumis)', p.expenseReimbursement, (v) => set('expenseReimbursement', v), 'number')}
        </div>
        {(p.taxMode || 'rate') === 'rate' ? (
          <div className="grid2">
            {field(`Taux ${taxLabel} (%)`, p.taxRate, (v) => set('taxRate', v), 'number')}
            <div className="field" />
          </div>
        ) : (
          <div>
            <div className="grid2">
              {field(`Montant ${taxLabel} retenu`, p.taxFixedAmount, (v) => set('taxFixedAmount', v), 'number')}
              {field('Mensualités / an (13e mois…)', p.monthsPerYear ?? 12, (v) => set('monthsPerYear', v), 'number')}
            </div>
            {isMU && (
              <>
                <div className="grid2">
                  {field('Abattements annuels EDF (personnes à charge…)', p.edfReliefs, (v) => set('edfReliefs', v), 'number')}
                  <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn" onClick={calcPaye} disabled={busy} style={{ width: '100%' }}>Calculer le PAYE (barème MRA)</button>
                  </div>
                </div>
                {payeInfo && (
                  <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                    Émoluments annuels {money(payeInfo.annualEmoluments, cur)} − abattements {money(payeInfo.annualReliefs, cur)} = base {money(payeInfo.annualChargeable, cur)} → impôt annuel {money(payeInfo.annualTax, cur)} ({payeInfo.effectiveRate} % effectif) → retenue mensuelle {money(payeInfo.monthlyTax, cur)}.
                  </p>
                )}
              </>
            )}
          </div>
        )}
        <div style={{ textAlign: 'right', lineHeight: 1.8, marginTop: 6 }}>
          <div>Salaire brut : <strong>{m(t.grossTotal)}</strong></div>
          <div>Total cotisations salariales : <strong>− {m(t.totalEmployee)}</strong></div>
          <div>Net à payer avant impôt : <strong>{m(t.netBeforeTax)}</strong></div>
          {!isMU && <div className="muted">Montant net social : {m(t.netSocial)}</div>}
          <div>{taxLabel} : <strong>− {m(t.taxAmount)}</strong></div>
          <div style={{ fontSize: 18, color: 'var(--primary)' }}>Net payé : <strong>{m(t.netPaid)}</strong></div>
          <div className="muted" style={{ marginTop: 4 }}>Coût total employeur : {m(t.employerCost)}</div>
        </div>
      </div>

      <div className="modal-actions">
        {p._id && draft && <button className="btn btn-danger" onClick={remove} disabled={busy}>Supprimer</button>}
        <button className="btn btn-ghost" onClick={() => setPrinting(true)}>Aperçu / Imprimer</button>
        {draft && <button className="btn" onClick={persist} disabled={busy}>Enregistrer</button>}
        {p._id && draft && <button className="btn btn-primary" onClick={finalize} disabled={busy}>Finaliser</button>}
        {p.status === 'finalized' && <button className="btn" onClick={reopen} disabled={busy}>Rouvrir</button>}
      </div>

      {printing && <PayslipPrint p={p} t={t} logoUrl={logoUrl} onClose={() => setPrinting(false)} />}
    </div>
  );
}

function PayslipPrint({ p, t, logoUrl, onClose }) {
  const cur = p.currency || 'EUR';
  const m = (n) => money(n, cur);
  const isMU = p.country === 'MU';
  const taxLabel = isMU ? 'PAYE' : 'Prélèvement à la source';
  const line = { display: 'flex', justifyContent: 'space-between', padding: '2px 0' };
  const printRef = useRef(null);

  const doPrint = () => {
    const node = printRef.current;
    if (!node) { window.print(); return; }
    const w = window.open('', '_blank', 'width=820,height=1060');
    if (!w) { window.print(); return; }
    const css = `@page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { width: 210mm; padding: 12mm 14mm; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; color: #111; font-size: 12px; }
      .payslip-body { display: flex; flex-direction: column; min-height: 255mm; }
      .payslip-emp { margin-top: 50px; }
      .payslip-spacer { flex: 1 1 auto; }
      h3 { margin: 0 0 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 44px; }
      th, td { border: 1px solid #ddd; padding: 4px 6px; }
      .r { text-align: right; }
      .payslip-net { max-width: 360px; margin-left: auto; }
      img { max-height: 60px; max-width: 200px; object-fit: contain; }`;
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Bulletin de paie</title><style>' + css + '</style></head><body>' + node.innerHTML + '</body></html>');
    w.document.close();
    const go = () => { try { w.focus(); w.print(); } catch (e) { /* */ } };
    const img = w.document.querySelector('img');
    if (img && !img.complete) { img.onload = go; img.onerror = go; setTimeout(go, 1500); }
    else setTimeout(go, 250);
  };

  return (
    <Modal title="Bulletin de paie" onClose={onClose}>
      <style>{`.payslip-print { font-size: 12px; color: #111; }
        .payslip-print .payslip-emp { margin-top: 50px; }
        .payslip-print h3 { margin: 0 0 4px; }
        .payslip-print table { width: 100%; border-collapse: collapse; margin-top: 44px; }
        .payslip-print th, .payslip-print td { border: 1px solid #ddd; padding: 4px 6px; }
        .payslip-print .r { text-align: right; }
        .payslip-print .payslip-net { max-width: 360px; margin-left: auto; margin-top: 24px; }`}</style>
      <div className="payslip-print" ref={printRef}>
        <div className="payslip-body">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            {logoUrl && <img src={logoUrl} alt="" style={{ maxHeight: 60, maxWidth: 200, objectFit: 'contain', marginBottom: 6, display: 'block' }} />}
            <h3>{p.employer?.name || p.company || '—'}</h3>
            {p.employer?.address && <div>{p.employer.address}</div>}
            {p.employer?.siret && <div>{isMU ? 'BRN' : 'SIRET'} : {p.employer.siret}{p.employer?.apeCode ? ` · ${p.employer.apeCode}` : ''}</div>}
            {p.employer?.urssafNumber && <div>{isMU ? 'ERN' : 'URSSAF'} : {p.employer.urssafNumber}</div>}
            {p.employer?.conventionCollective && <div>Convention : {p.employer.conventionCollective}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <strong>Bulletin de paie</strong>
            <div>{monthLabel(p.month)}</div>
            <div>{COUNTRY[p.country] || ''}</div>
            {p.paymentDate && <div>Payé le {p.paymentDate}</div>}
          </div>
        </div>
        <div className="payslip-emp" style={{ padding: 8, background: '#f7f7f7' }}>
          <strong>{p.employee?.name || '—'}</strong>
          {p.employee?.address && <div>{p.employee.address}</div>}
          <div>{[p.employee?.position, p.employee?.classification && `Classif. ${p.employee.classification}`, p.employee?.coefficient && `Coef. ${p.employee.coefficient}`, !isMU && (p.employee?.isCadre ? 'Cadre' : 'Non-cadre')].filter(Boolean).join(' · ')}</div>
          {p.employee?.socialSecurityNumber && <div>{isMU ? 'NIC' : 'N° SS'} : {p.employee.socialSecurityNumber}</div>}
          {p.employee?.hireDate && <div>Entrée : {p.employee.hireDate}</div>}
        </div>

        <table>
          <thead><tr><th>Rubrique</th><th className="r">Base</th><th className="r">Tx sal.</th><th className="r">Part salarié</th><th className="r">Tx pat.</th><th className="r">Part employeur</th></tr></thead>
          <tbody>
            <tr><td>Salaire de base{p.workedHours ? ` (${p.workedHours} h)` : ''}</td><td className="r"></td><td className="r"></td><td className="r">{m(p.baseSalary)}</td><td className="r"></td><td className="r"></td></tr>
            {(p.gains || []).map((g, i) => <tr key={`g${i}`}><td>{g.label || 'Gain'}</td><td className="r"></td><td className="r"></td><td className="r">{m(g.amount)}</td><td className="r"></td><td className="r"></td></tr>)}
            <tr style={{ fontWeight: 700 }}><td>Salaire brut</td><td className="r"></td><td className="r"></td><td className="r">{m(t.grossTotal)}</td><td className="r"></td><td className="r"></td></tr>
            {(p.contributions || []).map((l, i) => (
              <tr key={`c${i}`}><td>{l.label}</td><td className="r">{m(l.base)}</td><td className="r">{l.employeeRate ? l.employeeRate + ' %' : ''}</td><td className="r">{l.employeeAmount ? '− ' + m(l.employeeAmount) : ''}</td><td className="r">{l.employerRate ? l.employerRate + ' %' : ''}</td><td className="r">{l.employerAmount ? m(l.employerAmount) : ''}</td></tr>
            ))}
            <tr style={{ fontWeight: 700 }}><td>Total cotisations</td><td className="r"></td><td className="r"></td><td className="r">− {m(t.totalEmployee)}</td><td className="r"></td><td className="r">{m(t.totalEmployer)}</td></tr>
          </tbody>
        </table>

        <div className="payslip-spacer" />

        <div className="payslip-net">
          <div style={line}><span>Net à payer avant impôt</span><strong>{m(t.netBeforeTax)}</strong></div>
          {!isMU && <div style={line}><span>Montant net social</span><span>{m(t.netSocial)}</span></div>}
          <div style={line}><span>{taxLabel} {p.taxRate ? `(${p.taxRate} %)` : ''}</span><span>− {m(t.taxAmount)}</span></div>
          {p.expenseReimbursement ? <div style={line}><span>Remboursement de frais</span><span>+ {m(p.expenseReimbursement)}</span></div> : null}
          <div style={{ ...line, fontSize: 15, borderTop: '2px solid #333', marginTop: 4, paddingTop: 4 }}><strong>Net payé</strong><strong>{m(t.netPaid)}</strong></div>
          <div style={{ ...line, color: '#666' }}><span>Coût total employeur</span><span>{m(t.employerCost)}</span></div>
        </div>
        </div>
      </div>
      <div className="modal-actions no-print">
        <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
        <button className="btn btn-primary" onClick={doPrint}>Imprimer</button>
      </div>
    </Modal>
  );
}
