// src/components/Attachments.jsx — gestion des pièces jointes d'une fiche (S3).
import React, { useRef, useState } from 'react';
import { useAuth } from '../auth';
import { uploadAttachment, getAttachmentUrl, deleteAttachment } from '../api';

const KINDS = [
  { value: 'contract', label: 'Contrat' },
  { value: 'po', label: 'Bon de commande' },
  { value: 'other', label: 'Autre' },
];

export default function Attachments({ resource, entity, onChange }) {
  const { token } = useAuth();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('contract');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const items = entity.attachments || [];

  if (!entity._id) {
    return (
      <div className="fieldlist">
        <div className="fieldlist-head"><span>Pièces jointes</span></div>
        <div className="muted">Enregistrez d’abord la fiche pour pouvoir ajouter des documents.</div>
      </div>
    );
  }

  const doUpload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const updated = await uploadAttachment(resource, entity._id, file, { kind, label }, token);
      onChange(updated.attachments || []);
      setFile(null);
      setLabel('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const view = async (key) => {
    try {
      const { url } = await getAttachmentUrl(resource, entity._id, key, token);
      window.open(url, '_blank');
    } catch (e) {
      alert(e.message);
    }
  };

  const remove = async (key) => {
    if (!confirm('Supprimer cette pièce jointe ?')) return;
    setBusy(true);
    try {
      const updated = await deleteAttachment(resource, entity._id, key, token);
      onChange(updated.attachments || []);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const kindLabel = (v) => (KINDS.find((k) => k.value === v) || {}).label || v;

  return (
    <div className="fieldlist">
      <div className="fieldlist-head"><span>Pièces jointes</span></div>

      {items.length === 0 && <div className="muted">Aucun document.</div>}
      {items.map((a, i) => (
        <div className="fieldlist-row" key={a.s3Key || i} style={{ alignItems: 'center' }}>
          <span style={{ flex: 1 }}>
            <strong>{a.label || '(sans nom)'}</strong>
            <span className="muted"> · {kindLabel(a.kind)}{a.date ? ` · ${a.date}` : ''}</span>
          </span>
          <button type="button" className="btn" onClick={() => view(a.s3Key)}>Voir</button>
          <button type="button" className="link-danger" onClick={() => remove(a.s3Key)} disabled={busy} title="Supprimer">×</button>
        </div>
      ))}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
        <div className="fieldlist-row">
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ flex: '0 0 160px' }}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <input placeholder="Libellé (optionnel)" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="fieldlist-row">
          <input ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ flex: 1, border: 'none' }} />
          <button type="button" className="btn btn-primary" onClick={doUpload} disabled={!file || busy}>
            {busy ? '…' : 'Téléverser'}
          </button>
        </div>
      </div>
    </div>
  );
}
