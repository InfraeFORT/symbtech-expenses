// src/pages/Admin.jsx — administration : utilisateurs et groupes de droits.
// Les droits sont portés par les groupes ; un utilisateur cumule ceux de ses groupes
// (le plus permissif l'emporte).
import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import {
  listResource, listAdminResources,
  listGroups, createGroup, updateGroup, deleteGroup,
  listUsers, createUser, updateUser, deleteUser, resetUserPassword,
} from '../api';

const LEVELS = [
  { key: 'none', label: 'Aucun' },
  { key: 'read', label: 'Lecture' },
  { key: 'write', label: 'Écriture' },
];

export default function Admin({ tab }) {
  return tab === 'groups' ? <Groups /> : <Users />;
}

/* ---------------------------------- Groupes --------------------------------- */

function Groups() {
  const { token, refresh } = useAuth();
  const [items, setItems] = useState([]);
  const [resources, setResources] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems((await listGroups(token)).items || []); } catch (e) { alert(e.message); } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    listAdminResources(token).then((r) => setResources(r.resources || [])).catch(() => {});
    listResource('companies', token).then((r) => setCompanies(r.items || [])).catch(() => {});
  }, []);

  const empty = { name: '', description: '', isAdmin: false, allCompanies: true, companies: [], permissions: [], active: true };
  const levelOf = (g, key) => (g.permissions || []).find((p) => p.resource === key)?.level || 'none';
  const setLevel = (key, level) => setDraft((d) => {
    const rest = (d.permissions || []).filter((p) => p.resource !== key);
    return { ...d, permissions: level === 'none' ? rest : [...rest, { resource: key, level }] };
  });
  const setAll = (level) => setDraft((d) => ({ ...d, permissions: level === 'none' ? [] : resources.map((r) => ({ resource: r.key, level })) }));
  const toggleCompany = (name) => setDraft((d) => ({
    ...d,
    companies: (d.companies || []).includes(name) ? d.companies.filter((c) => c !== name) : [...(d.companies || []), name],
  }));

  const save = async () => {
    if (!draft.name) { alert('Nom du groupe requis.'); return; }
    setBusy(true);
    try {
      if (draft._id) await updateGroup(draft._id, draft, token);
      else await createGroup(draft, token);
      setDraft(null); await load(); await refresh();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Supprimer ce groupe ? Les utilisateurs concernés perdront ces droits.')) return;
    setBusy(true);
    try { await deleteGroup(draft._id, token); setDraft(null); await load(); await refresh(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const summary = (g) => {
    if (g.isAdmin) return 'Tous les droits';
    const w = (g.permissions || []).filter((p) => p.level === 'write').length;
    const r = (g.permissions || []).filter((p) => p.level === 'read').length;
    return `${w} en écriture · ${r} en lecture`;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>{items.length} groupe(s). Les droits se cumulent : le plus permissif l'emporte.</p>
        <button className="btn btn-primary" onClick={() => setDraft({ ...empty })}>+ Nouveau groupe</button>
      </div>

      {loading ? <p className="muted">Chargement…</p> : (
        <table className="table">
          <thead><tr><th>Groupe</th><th>Droits</th><th>Sociétés</th><th>Statut</th></tr></thead>
          <tbody>
            {items.map((g) => (
              <tr key={g._id} className="clickable" onClick={() => setDraft({ ...g, permissions: [...(g.permissions || [])], companies: [...(g.companies || [])] })}>
                <td><strong>{g.name}</strong>{g.description ? <div className="muted" style={{ fontSize: 12 }}>{g.description}</div> : null}</td>
                <td>{summary(g)}</td>
                <td>{g.allCompanies ? 'Toutes' : (g.companies || []).join(', ') || '—'}</td>
                <td>{g.active === false ? 'Inactif' : 'Actif'}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="muted">Aucun groupe.</td></tr>}
          </tbody>
        </table>
      )}

      {draft && (
        <Modal title={draft._id ? 'Modifier le groupe' : 'Nouveau groupe'} onClose={() => setDraft(null)}>
          <div className="grid2">
            <div className="field"><label>Nom</label><input value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="field"><label>Description</label><input value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0', fontWeight: 600, color: 'var(--accent)' }}>
            <input type="checkbox" checked={!!draft.isAdmin} onChange={(e) => setDraft({ ...draft, isAdmin: e.target.checked })} style={{ width: 'auto' }} />
            Administration (gestion des utilisateurs et des groupes — donne tous les droits)
          </label>

          {!draft.isAdmin && (
            <div className="fieldlist" style={{ marginTop: 6 }}>
              <div className="fieldlist-head">
                <span>Droits par élément</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setAll('read')}>Tout en lecture</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setAll('write')}>Tout en écriture</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setAll('none')}>Tout retirer</button>
                </span>
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                <table className="table" style={{ boxShadow: 'none' }}>
                  <thead><tr><th>Élément</th><th style={{ width: 260 }}>Niveau</th></tr></thead>
                  <tbody>
                    {resources.map((r) => {
                      const lvl = levelOf(draft, r.key);
                      return (
                        <tr key={r.key}>
                          <td>{r.label}</td>
                          <td>
                            <span style={{ display: 'flex', gap: 10 }}>
                              {LEVELS.map((l) => (
                                <label key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 400 }}>
                                  <input type="radio" name={`lvl-${r.key}`} checked={lvl === l.key} onChange={() => setLevel(r.key, l.key)} style={{ width: 'auto' }} />
                                  {l.label}
                                </label>
                              ))}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="fieldlist" style={{ marginTop: 8 }}>
            <div className="fieldlist-head"><span>Périmètre société</span></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
              <input type="checkbox" checked={!!draft.allCompanies || !!draft.isAdmin} disabled={!!draft.isAdmin} onChange={(e) => setDraft({ ...draft, allCompanies: e.target.checked })} style={{ width: 'auto' }} />
              Toutes les sociétés
            </label>
            {!draft.allCompanies && !draft.isAdmin && (
              <div style={{ marginTop: 6 }}>
                {companies.map((c) => (
                  <label key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, padding: '2px 0' }}>
                    <input type="checkbox" checked={(draft.companies || []).includes(c.name)} onChange={() => toggleCompany(c.name)} style={{ width: 'auto' }} />
                    {c.name}
                  </label>
                ))}
                {companies.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Aucune société.</p>}
              </div>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontWeight: 400 }}>
            <input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} style={{ width: 'auto' }} />
            Groupe actif
          </label>

          <div className="modal-actions">
            {draft._id && <button className="btn btn-danger" onClick={remove} disabled={busy}>Supprimer</button>}
            <button className="btn btn-ghost" onClick={() => setDraft(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* -------------------------------- Utilisateurs ------------------------------- */

function Users() {
  const { token, user: current, refresh } = useAuth();
  const [items, setItems] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [pwd, setPwd] = useState(null); // { user, value }
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems((await listUsers(token)).items || []); } catch (e) { alert(e.message); } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    listGroups(token).then((r) => setGroups(r.items || [])).catch(() => {});
  }, []);

  const empty = { email: '', displayName: '', password: '', groups: [], active: true };
  const nameOf = (id) => groups.find((g) => g._id === id)?.name || '—';
  const toggleGroup = (id) => setDraft((d) => ({
    ...d,
    groups: (d.groups || []).includes(id) ? d.groups.filter((g) => g !== id) : [...(d.groups || []), id],
  }));

  const save = async () => {
    if (!draft.email || !draft.displayName) { alert('Email et nom requis.'); return; }
    if (!draft._id && (!draft.password || draft.password.length < 8)) { alert('Mot de passe initial : 8 caractères minimum.'); return; }
    setBusy(true);
    try {
      if (draft._id) await updateUser(draft._id, { email: draft.email, displayName: draft.displayName, groups: draft.groups, active: draft.active }, token);
      else await createUser(draft, token);
      setDraft(null); await load(); await refresh();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Supprimer définitivement cet utilisateur ?')) return;
    setBusy(true);
    try { await deleteUser(draft._id, token); setDraft(null); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const doReset = async () => {
    if (!pwd.value || pwd.value.length < 8) { alert('8 caractères minimum.'); return; }
    setBusy(true);
    try { await resetUserPassword(pwd.user._id, pwd.value, token); alert('Mot de passe réinitialisé. Communiquez-le à l’utilisateur.'); setPwd(null); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>{items.length} utilisateur(s).</p>
        <button className="btn btn-primary" onClick={() => setDraft({ ...empty })}>+ Nouvel utilisateur</button>
      </div>

      {loading ? <p className="muted">Chargement…</p> : (
        <table className="table">
          <thead><tr><th>Nom</th><th>Email</th><th>Groupes</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {items.map((u) => (
              <tr key={u._id}>
                <td className="clickable" onClick={() => setDraft({ ...u, groups: [...(u.groups || [])] })}><strong>{u.displayName}</strong></td>
                <td>{u.email}</td>
                <td>{(u.groups || []).map(nameOf).join(', ') || <span className="muted">Aucun — aucun droit</span>}</td>
                <td>{u.active === false ? 'Désactivé' : 'Actif'}</td>
                <td><button className="btn btn-ghost" onClick={() => setPwd({ user: u, value: '' })}>Mot de passe</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="muted">Aucun utilisateur.</td></tr>}
          </tbody>
        </table>
      )}

      {draft && (
        <Modal title={draft._id ? "Modifier l'utilisateur" : 'Nouvel utilisateur'} onClose={() => setDraft(null)}>
          <div className="grid2">
            <div className="field"><label>Nom affiché</label><input value={draft.displayName || ''} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} /></div>
            <div className="field"><label>Email</label><input type="email" value={draft.email || ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
          </div>
          {!draft._id && (
            <div className="field">
              <label>Mot de passe initial (8 caractères minimum)</label>
              <input type="text" value={draft.password || ''} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="À communiquer à l’utilisateur" />
            </div>
          )}

          <div className="fieldlist" style={{ marginTop: 6 }}>
            <div className="fieldlist-head"><span>Groupes</span></div>
            {groups.map((g) => (
              <label key={g._id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, padding: '2px 0' }}>
                <input type="checkbox" checked={(draft.groups || []).includes(g._id)} onChange={() => toggleGroup(g._id)} style={{ width: 'auto' }} />
                {g.name} {g.isAdmin ? <span className="muted">(administration)</span> : null}
              </label>
            ))}
            {groups.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Aucun groupe — créez-en un d’abord.</p>}
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Les droits se cumulent entre groupes ; le plus permissif l’emporte.</p>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontWeight: 400 }}>
            <input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} style={{ width: 'auto' }} />
            Compte actif {draft._id && current && draft._id === current.id ? <span className="muted">(votre compte)</span> : null}
          </label>

          <div className="modal-actions">
            {draft._id && <button className="btn btn-danger" onClick={remove} disabled={busy}>Supprimer</button>}
            <button className="btn btn-ghost" onClick={() => setDraft(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </Modal>
      )}

      {pwd && (
        <Modal title={`Mot de passe — ${pwd.user.displayName}`} onClose={() => setPwd(null)}>
          <div className="field">
            <label>Nouveau mot de passe (8 caractères minimum)</label>
            <input type="text" value={pwd.value} onChange={(e) => setPwd({ ...pwd, value: e.target.value })} />
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Il devra vous être communiqué à l’utilisateur, qui pourra le changer depuis « Mon compte ».</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setPwd(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={doReset} disabled={busy}>Réinitialiser</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
