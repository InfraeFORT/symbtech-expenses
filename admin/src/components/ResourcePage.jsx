// src/components/ResourcePage.jsx — liste + modale CRUD générique pour un référentiel.
import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { listResource, createResource, updateResource, deleteResource } from '../api';
import Modal from './Modal';

export default function ResourcePage({ resource, singular, columns, emptyItem, FormFields }) {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null); // objet en cours d'édition/création
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listResource(resource, token);
      setItems(r.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  // Ferme la modale en rafraîchissant la liste (les pièces jointes sont
  // persistées immédiatement, hors du bouton Enregistrer).
  const close = () => {
    setDraft(null);
    load();
  };

  const save = async () => {
    setBusy(true);
    try {
      if (draft._id) await updateResource(resource, draft._id, draft, token);
      else await createResource(resource, draft, token);
      setDraft(null);
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Supprimer définitivement cet élément ?')) return;
    setBusy(true);
    try {
      await deleteResource(resource, draft._id, token);
      setDraft(null);
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setDraft({ ...emptyItem })}>
          + Nouveau {singular}
        </button>
      </div>

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="muted">Aucun élément. Cliquez « + Nouveau ».</td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it._id} className="clickable" onClick={() => setDraft({ ...it })}>
                  {columns.map((c) => (
                    <td key={c.key}>{c.render ? c.render(it) : it[c.key] || '—'}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {draft && (
        <Modal title={draft._id ? `Modifier ${singular}` : `Nouveau ${singular}`} onClose={close}>
          <FormFields draft={draft} set={set} />
          <div className="modal-actions">
            {draft._id && (
              <button className="btn btn-danger" onClick={remove} disabled={busy}>Supprimer</button>
            )}
            <button className="btn" onClick={close} disabled={busy}>Annuler</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? '…' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
