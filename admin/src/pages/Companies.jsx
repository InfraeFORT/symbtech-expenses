// src/pages/Companies.jsx
import React from 'react';
import ResourcePage from '../components/ResourcePage';
import FieldList from '../components/FieldList';
import { useAuth } from '../auth';
import { getAccountingStandards, uploadCompanyLogo, getCompanyLogoUrl, deleteCompanyLogo } from '../api';

const columns = [
  { key: 'name', label: 'Société' },
  { key: 'code', label: 'Code' },
  { key: 'city', label: 'Ville' },
  { key: 'country', label: 'Pays' },
  { key: 'vatNumber', label: 'TVA' },
];

const emptyItem = {
  name: '', code: '', address1: '', address2: '', postalCode: '', city: '',
  country: '', regNumber: '', vatNumber: '', apeCode: '', urssafNumber: '', conventionCollective: '',
  imageKey: null,
  accountingStandards: [], bankAccounts: [], paymentMethods: [],
};

function StandardsField({ draft, set }) {
  const { token } = useAuth();
  const [catalog, setCatalog] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    getAccountingStandards(token).then((r) => setCatalog(r.standards || [])).catch(() => {});
  }, []);
  const selected = draft.accountingStandards || [];
  const toggle = (code) =>
    set('accountingStandards', selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  const propose = async () => {
    setBusy(true);
    try {
      const r = await getAccountingStandards(token, draft.country || '');
      set('accountingStandards', r.suggested || []);
    } catch (e) { /* */ } finally { setBusy(false); }
  };
  return (
    <div className="fieldlist">
      <div className="fieldlist-head">
        <span>Normes comptables</span>
        <button type="button" className="btn btn-ghost" onClick={propose} disabled={busy}>
          Proposer{draft.country ? ` (${draft.country})` : ''}
        </button>
      </div>
      {catalog.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>…</p>
      ) : (
        catalog.map((s) => (
          <label key={s.code} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontWeight: 400 }}>
            <input type="checkbox" checked={selected.includes(s.code)} onChange={() => toggle(s.code)} style={{ width: 'auto' }} />
            {s.label}
          </label>
        ))
      )}
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Plusieurs normes possibles (ex. IFRS + norme locale).</p>
    </div>
  );
}

function CompanyLogo({ draft, set }) {
  const { token } = useAuth();
  const [url, setUrl] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let on = true;
    if (draft._id && draft.imageKey) {
      getCompanyLogoUrl(draft._id, token).then((r) => { if (on) setUrl(r.url); }).catch(() => {});
    } else {
      setUrl(null);
    }
    return () => { on = false; };
  }, [draft._id, draft.imageKey]);

  if (!draft._id) {
    return (
      <div className="fieldlist">
        <div className="fieldlist-head"><span>Logo</span></div>
        <div className="muted">Enregistrez d’abord la société pour pouvoir ajouter un logo.</div>
      </div>
    );
  }

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try { const up = await uploadCompanyLogo(draft._id, f, token); set('imageKey', up.imageKey); }
    catch (err) { alert(err.message); } finally { setBusy(false); if (e.target) e.target.value = ''; }
  };
  const remove = async () => {
    if (!confirm('Supprimer le logo ?')) return;
    setBusy(true);
    try { const up = await deleteCompanyLogo(draft._id, token); set('imageKey', up.imageKey || null); setUrl(null); }
    catch (err) { alert(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="fieldlist">
      <div className="fieldlist-head"><span>Logo</span></div>
      {url && <img src={url} alt="" style={{ maxWidth: 220, maxHeight: 120, objectFit: 'contain', display: 'block', marginBottom: 8, background: '#fff', padding: 4, border: '1px solid var(--border)', borderRadius: 8 }} />}
      <div className="fieldlist-row" style={{ alignItems: 'center' }}>
        <input type="file" accept="image/*" onChange={onFile} disabled={busy} style={{ flex: 1, border: 'none' }} />
        {draft.imageKey && <button type="button" className="link-danger" onClick={remove} disabled={busy} title="Supprimer">×</button>}
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Apparaît en en-tête des bulletins de paie (PNG/JPG conseillé).</p>
    </div>
  );
}

function FormFields({ draft, set }) {
  return (
    <>
      <div className="grid2">
        <div className="field"><label>Nom</label><input value={draft.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field"><label>Code</label><input value={draft.code || ''} onChange={(e) => set('code', e.target.value)} /></div>
      </div>
      <div className="field"><label>Adresse 1</label><input value={draft.address1 || ''} onChange={(e) => set('address1', e.target.value)} /></div>
      <div className="field"><label>Adresse 2</label><input value={draft.address2 || ''} onChange={(e) => set('address2', e.target.value)} /></div>
      <div className="grid2">
        <div className="field"><label>Code postal</label><input value={draft.postalCode || ''} onChange={(e) => set('postalCode', e.target.value)} /></div>
        <div className="field"><label>Ville</label><input value={draft.city || ''} onChange={(e) => set('city', e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Pays</label><input value={draft.country || ''} onChange={(e) => set('country', e.target.value)} /></div>
        <div className="field"><label>N° RC / Reg (SIRET / BRN)</label><input value={draft.regNumber || ''} onChange={(e) => set('regNumber', e.target.value)} /></div>
      </div>
      <div className="field"><label>N° TVA</label><input value={draft.vatNumber || ''} onChange={(e) => set('vatNumber', e.target.value)} /></div>

      <div className="fieldlist">
        <div className="fieldlist-head"><span>Paie & déclarations sociales</span></div>
        <div className="grid2">
          <div className="field"><label>Code APE / NAF (secteur)</label><input value={draft.apeCode || ''} onChange={(e) => set('apeCode', e.target.value)} /></div>
          <div className="field"><label>N° employeur URSSAF / ERN (MRA)</label><input value={draft.urssafNumber || ''} onChange={(e) => set('urssafNumber', e.target.value)} /></div>
        </div>
        <div className="field"><label>Convention collective</label><input value={draft.conventionCollective || ''} onChange={(e) => set('conventionCollective', e.target.value)} /></div>
        <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>Repris automatiquement dans l'employeur des bulletins de paie.</p>
      </div>

      <StandardsField draft={draft} set={set} />

      <CompanyLogo draft={draft} set={set} />

      <FieldList
        label="Comptes bancaires"
        items={draft.bankAccounts}
        onChange={(v) => set('bankAccounts', v)}
        fields={[
          { key: 'bankName', label: 'Banque' },
          { key: 'swift', label: 'SWIFT' },
          { key: 'iban', label: 'IBAN' },
          { key: 'accountNumber', label: 'N° compte' },
          { key: 'currency', label: 'Devise' },
        ]}
      />
      <FieldList
        label="Moyens de paiement"
        items={draft.paymentMethods}
        onChange={(v) => set('paymentMethods', v)}
        fields={[
          { key: 'name', label: 'Nom (ex. Carte société)' },
          { key: 'type', label: 'Type (card/transfer)' },
          { key: 'bankIban', label: 'IBAN rattaché' },
        ]}
      />
    </>
  );
}

export default function Companies() {
  return (
    <ResourcePage resource="companies" singular="société" columns={columns} emptyItem={emptyItem} FormFields={FormFields} />
  );
}
