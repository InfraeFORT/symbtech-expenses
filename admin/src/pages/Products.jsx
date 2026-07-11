// src/pages/Products.jsx — référentiel de produits & services.
import React, { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { useAuth } from '../auth';
import { uploadProductImage, getProductImageUrl, deleteProductImage } from '../api';

const fmt = (n, c) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (c ? ' ' + c : ''));

const columns = [
  { key: 'name', label: 'Produit / service' },
  { key: 'kind', label: 'Type', render: (it) => (it.kind === 'good' ? 'Bien' : 'Service') },
  { key: 'unit', label: 'Unité' },
  { key: 'unitPrice', label: 'P.U. HT', render: (it) => fmt(it.unitPrice, it.currency) },
  { key: 'vatRate', label: 'TVA', render: (it) => `${Number(it.vatRate) || 0} %` },
  { key: 'active', label: 'Actif', render: (it) => (it.active === false ? 'Non' : 'Oui') },
];

const emptyItem = { name: '', description: '', kind: 'service', code: '', unit: '', unitPrice: 0, vatRate: 0, currency: 'EUR', active: true };

function FormFields({ draft, set }) {
  return (
    <>
      <div className="field"><label>Nom</label><input value={draft.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
      <div className="field"><label>Description</label><input value={draft.description || ''} onChange={(e) => set('description', e.target.value)} /></div>
      <div className="grid2">
        <div className="field">
          <label>Type</label>
          <select value={draft.kind || 'service'} onChange={(e) => set('kind', e.target.value)}>
            <option value="service">Service</option>
            <option value="good">Bien</option>
          </select>
        </div>
        <div className="field"><label>Unité</label><input value={draft.unit || ''} placeholder="unité, jour, heure, forfait…" onChange={(e) => set('unit', e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Prix unitaire (HT)</label><input type="number" step="any" value={draft.unitPrice ?? 0} onChange={(e) => set('unitPrice', e.target.value)} /></div>
        <div className="field"><label>TVA %</label><input type="number" step="any" value={draft.vatRate ?? 0} onChange={(e) => set('vatRate', e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Devise</label><input value={draft.currency || ''} onChange={(e) => set('currency', (e.target.value || '').toUpperCase())} /></div>
        <div className="field"><label>Code</label><input value={draft.code || ''} onChange={(e) => set('code', e.target.value)} /></div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <input type="checkbox" checked={draft.active !== false} onChange={(e) => set('active', e.target.checked)} />
        Actif (proposé dans le catalogue)
      </label>

      <ProductImage draft={draft} set={set} />
    </>
  );
}

function ProductImage({ draft, set }) {
  const { token } = useAuth();
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    if (draft._id && draft.imageKey) {
      getProductImageUrl(draft._id, token).then((r) => { if (on) setUrl(r.url); }).catch(() => {});
    } else {
      setUrl(null);
    }
    return () => { on = false; };
  }, [draft._id, draft.imageKey]);

  if (!draft._id) {
    return (
      <div className="fieldlist">
        <div className="fieldlist-head"><span>Photo</span></div>
        <div className="muted">Enregistrez d’abord le produit pour pouvoir ajouter une photo.</div>
      </div>
    );
  }

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try { const up = await uploadProductImage(draft._id, f, token); set('imageKey', up.imageKey); }
    catch (err) { alert(err.message); } finally { setBusy(false); if (e.target) e.target.value = ''; }
  };
  const remove = async () => {
    if (!confirm('Supprimer la photo ?')) return;
    setBusy(true);
    try { const up = await deleteProductImage(draft._id, token); set('imageKey', up.imageKey || null); setUrl(null); }
    catch (err) { alert(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="fieldlist">
      <div className="fieldlist-head"><span>Photo</span></div>
      {url && <img src={url} alt="" style={{ maxWidth: 180, maxHeight: 180, objectFit: 'cover', borderRadius: 8, display: 'block', marginBottom: 8 }} />}
      <div className="fieldlist-row" style={{ alignItems: 'center' }}>
        <input type="file" accept="image/*" onChange={onFile} disabled={busy} style={{ flex: 1, border: 'none' }} />
        {draft.imageKey && <button type="button" className="link-danger" onClick={remove} disabled={busy} title="Supprimer">×</button>}
      </div>
    </div>
  );
}

export default function Products() {
  return <ResourcePage resource="products" singular="produit" columns={columns} emptyItem={emptyItem} FormFields={FormFields} />;
}
