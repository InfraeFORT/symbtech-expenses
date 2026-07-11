// src/pages/Suppliers.jsx
import React from 'react';
import ResourcePage from '../components/ResourcePage';
import FieldList from '../components/FieldList';
import Attachments from '../components/Attachments';

const columns = [
  { key: 'name', label: 'Fournisseur' },
  { key: 'type', label: 'Type', render: (it) => (it.isIndividual ? 'Personne physique' : 'Société') },
  { key: 'city', label: 'Ville' },
  { key: 'country', label: 'Pays' },
  { key: 'vatNumber', label: 'TVA' },
];

const emptyItem = {
  name: '', isIndividual: false, address1: '', address2: '', postalCode: '', city: '',
  country: '', regNumber: '', vatNumber: '',
  civility: '', firstName: '', lastName: '', birthDate: '', nationalId: '',
  isEmployee: false,
  employment: { country: '', currency: '', contractType: '', startDate: '', position: '', classification: '', coefficient: '', isCadre: false, workedHours: 151.67, annualGross: 0, monthlyGross: 0, monthsPerYear: 12, bonuses: [] },
  contacts: [], attachments: [],
};

function EmploymentBlock({ draft, set }) {
  const emp = draft.employment || {};
  const setEmp = (k, v) => set('employment', { ...emp, [k]: v });
  const isMU = emp.country === 'MU';
  const onAnnual = (raw) => {
    const annual = raw === '' ? '' : Number(raw);
    const months = emp.monthsPerYear || 12;
    const monthly = (annual === '' || !months) ? emp.monthlyGross : Math.round((annual / months) * 100) / 100;
    set('employment', { ...emp, annualGross: annual, monthlyGross: monthly });
  };
  const onExtraMonths = (raw) => {
    const extra = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw)));
    const months = 12 + extra;
    const monthly = emp.annualGross ? Math.round((emp.annualGross / months) * 100) / 100 : emp.monthlyGross;
    set('employment', { ...emp, monthsPerYear: months, monthlyGross: monthly });
  };
  const setBonus = (i, k, v) => setEmp('bonuses', (emp.bonuses || []).map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const addBonus = () => setEmp('bonuses', [...(emp.bonuses || []), { label: '', amount: 0, recurring: false }]);
  const rmBonus = (i) => setEmp('bonuses', (emp.bonuses || []).filter((_, j) => j !== i));
  return (
    <div className="fieldlist" style={{ marginTop: 8 }}>
      <div className="fieldlist-head"><span>Contrat & rémunération</span></div>
      <div className="grid2">
        <div className="field"><label>Pays / régime</label>
          <select value={emp.country || ''} onChange={(e) => setEmp('country', e.target.value)}>
            <option value="">—</option><option value="FR">France</option><option value="MU">Maurice</option>
          </select>
        </div>
        <div className="field"><label>Devise</label><input value={emp.currency || ''} onChange={(e) => setEmp('currency', (e.target.value || '').toUpperCase())} placeholder={isMU ? 'MUR' : 'EUR'} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Type de contrat</label><input value={emp.contractType || ''} onChange={(e) => setEmp('contractType', e.target.value)} placeholder="CDI, CDD…" /></div>
        <div className="field"><label>Date d'entrée</label><input type="date" value={emp.startDate || ''} onChange={(e) => setEmp('startDate', e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Emploi / poste</label><input value={emp.position || ''} onChange={(e) => setEmp('position', e.target.value)} /></div>
        <div className="field"><label>{isMU ? 'Catégorie / grade' : 'Classification'}</label><input value={emp.classification || ''} onChange={(e) => setEmp('classification', e.target.value)} /></div>
      </div>
      <div className="grid2">
        {!isMU && <div className="field"><label>Coefficient</label><input value={emp.coefficient || ''} onChange={(e) => setEmp('coefficient', e.target.value)} /></div>}
        <div className="field"><label>Heures travaillées / mois</label><input type="number" step="any" value={emp.workedHours ?? ''} onChange={(e) => setEmp('workedHours', e.target.value === '' ? '' : Number(e.target.value))} /></div>
      </div>
      {!isMU && (
        <div className="field"><label>Statut</label>
          <select value={emp.isCadre ? 'yes' : 'no'} onChange={(e) => setEmp('isCadre', e.target.value === 'yes')}><option value="no">Non-cadre</option><option value="yes">Cadre</option></select>
        </div>
      )}
      <div className="grid2">
        <div className="field"><label>Rémunération annuelle brute</label><input type="number" step="any" value={emp.annualGross ?? ''} onChange={(e) => onAnnual(e.target.value)} /></div>
        <div className="field"><label>Mensualisée (brut/mois)</label><input type="number" step="any" value={emp.monthlyGross ?? ''} onChange={(e) => setEmp('monthlyGross', e.target.value === '' ? '' : Number(e.target.value))} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Mois supplémentaires (13e, 14e…)</label><input type="number" min="0" step="1" value={Math.max(0, (emp.monthsPerYear || 12) - 12)} onChange={(e) => onExtraMonths(e.target.value)} /></div>
        <div className="field"><label>Mensualités / an</label><input type="number" value={emp.monthsPerYear || 12} disabled /></div>
      </div>
      <div className="fieldlist" style={{ marginTop: 4 }}>
        <div className="fieldlist-head"><span>Primes & bonus</span><button type="button" className="btn btn-ghost" onClick={addBonus}>+ Bonus</button></div>
        {(emp.bonuses || []).map((b, i) => (
          <div className="fieldlist-row" key={i} style={{ alignItems: 'center' }}>
            <input style={{ flex: 1 }} placeholder="Libellé (prime, bonus…)" value={b.label || ''} onChange={(e) => setBonus(i, 'label', e.target.value)} />
            <input style={{ flex: '0 0 120px' }} type="number" step="any" placeholder="Montant" value={b.amount} onChange={(e) => setBonus(i, 'amount', e.target.value === '' ? '' : Number(e.target.value))} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 400 }}>
              <input type="checkbox" checked={!!b.recurring} onChange={(e) => setBonus(i, 'recurring', e.target.checked)} style={{ width: 'auto' }} /> mensuel
            </label>
            <button type="button" className="link-danger" onClick={() => rmBonus(i)}>×</button>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Ces éléments pré-remplissent la fiche de paie (pays, brut mensuel, poste, primes récurrentes…).</p>
    </div>
  );
}

function FormFields({ draft, set }) {
  const indiv = !!draft.isIndividual;
  return (
    <>
      <div className="field"><label>Nom{indiv ? ' (raison / nom complet)' : ''}</label><input value={draft.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 14px', fontWeight: 600, color: 'var(--accent)' }}>
        <input type="checkbox" checked={indiv} onChange={(e) => set('isIndividual', e.target.checked)} style={{ width: 'auto' }} />
        Personne physique (sélectionnable comme « Personne » d'une note de frais)
      </label>

      {indiv && (
        <>
          <div className="grid2">
            <div className="field"><label>Civilité</label>
              <select value={draft.civility || ''} onChange={(e) => set('civility', e.target.value)}>
                <option value="">—</option>
                <option value="M.">M.</option>
                <option value="Mme">Mme</option>
              </select>
            </div>
            <div className="field"><label>Date de naissance</label><input type="date" value={draft.birthDate || ''} onChange={(e) => set('birthDate', e.target.value)} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Prénom</label><input value={draft.firstName || ''} onChange={(e) => set('firstName', e.target.value)} /></div>
            <div className="field"><label>Nom de famille</label><input value={draft.lastName || ''} onChange={(e) => set('lastName', e.target.value)} /></div>
          </div>
          <div className="field"><label>N° NIC / pièce d'identité</label><input value={draft.nationalId || ''} onChange={(e) => set('nationalId', e.target.value)} /></div>
        </>
      )}

      <div className="field"><label>Adresse 1</label><input value={draft.address1 || ''} onChange={(e) => set('address1', e.target.value)} /></div>
      <div className="field"><label>Adresse 2</label><input value={draft.address2 || ''} onChange={(e) => set('address2', e.target.value)} /></div>
      <div className="grid2">
        <div className="field"><label>Code postal</label><input value={draft.postalCode || ''} onChange={(e) => set('postalCode', e.target.value)} /></div>
        <div className="field"><label>Ville</label><input value={draft.city || ''} onChange={(e) => set('city', e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Pays</label><input value={draft.country || ''} onChange={(e) => set('country', e.target.value)} /></div>
        {!indiv && <div className="field"><label>N° RC / Reg</label><input value={draft.regNumber || ''} onChange={(e) => set('regNumber', e.target.value)} /></div>}
      </div>
      {!indiv && <div className="field"><label>N° TVA</label><input value={draft.vatNumber || ''} onChange={(e) => set('vatNumber', e.target.value)} /></div>}

      {indiv && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px', fontWeight: 600, color: 'var(--accent)' }}>
            <input type="checkbox" checked={!!draft.isEmployee} onChange={(e) => set('isEmployee', e.target.checked)} style={{ width: 'auto' }} />
            Salarié (contrat & rémunération — pré-remplit la fiche de paie)
          </label>
          {draft.isEmployee && <EmploymentBlock draft={draft} set={set} />}
        </>
      )}

      <FieldList
        label="Contacts"
        items={draft.contacts}
        onChange={(v) => set('contacts', v)}
        fields={[
          { key: 'name', label: 'Nom' },
          { key: 'role', label: 'Rôle' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Téléphone' },
        ]}
      />

      <Attachments resource="suppliers" entity={draft} onChange={(atts) => set('attachments', atts)} />
    </>
  );
}

export default function Suppliers() {
  return (
    <ResourcePage resource="suppliers" singular="fournisseur" columns={columns} emptyItem={emptyItem} FormFields={FormFields} />
  );
}
