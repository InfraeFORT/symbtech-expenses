// src/pages/Account.jsx — mon compte : droits effectifs et changement de mot de passe.
import React, { useState } from 'react';
import { useAuth } from '../auth';
import { changeMyPassword } from '../api';

const LABEL = { none: 'Aucun', read: 'Lecture', write: 'Écriture' };

export default function Account() {
  const { token, user, perms } = useAuth();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async () => {
    setMsg(null);
    if (!cur || !next) { setMsg({ err: true, text: 'Renseignez le mot de passe actuel et le nouveau.' }); return; }
    if (next.length < 8) { setMsg({ err: true, text: 'Nouveau mot de passe : 8 caractères minimum.' }); return; }
    if (next !== confirm) { setMsg({ err: true, text: 'La confirmation ne correspond pas.' }); return; }
    setBusy(true);
    try {
      await changeMyPassword({ currentPassword: cur, newPassword: next }, token);
      setCur(''); setNext(''); setConfirm('');
      setMsg({ err: false, text: 'Mot de passe modifié.' });
    } catch (e) { setMsg({ err: true, text: e.message }); } finally { setBusy(false); }
  };

  const granted = perms ? Object.entries(perms.permissions || {}).filter(([, v]) => v !== 'none') : [];

  return (
    <div>
      <div className="card-block" style={{ marginBottom: 12 }}>
        <strong>Identité</strong>
        <p style={{ margin: '6px 0 0' }}>{user?.name} · {user?.email}</p>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {perms?.isAdmin ? 'Administrateur — tous les droits.' : `Sociétés : ${perms?.allCompanies ? 'toutes' : (perms?.companies || []).join(', ') || 'aucune'}`}
        </p>
      </div>

      {!perms?.isAdmin && (
        <div className="card-block" style={{ marginBottom: 12 }}>
          <strong>Mes droits</strong>
          {granted.length === 0 ? (
            <p className="muted" style={{ marginTop: 6 }}>Aucun droit accordé. Contactez un administrateur.</p>
          ) : (
            <table className="table" style={{ boxShadow: 'none', maxWidth: 420, marginTop: 6 }}>
              <thead><tr><th>Élément</th><th>Niveau</th></tr></thead>
              <tbody>
                {granted.map(([k, v]) => <tr key={k}><td>{k}</td><td>{LABEL[v]}</td></tr>)}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card-block" style={{ maxWidth: 480 }}>
        <strong>Changer mon mot de passe</strong>
        <div className="field" style={{ marginTop: 6 }}><label>Mot de passe actuel</label><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div className="field"><label>Nouveau mot de passe (8 caractères minimum)</label><input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
        <div className="field"><label>Confirmer</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        {msg && <p style={{ color: msg.err ? 'var(--danger, #b3261e)' : 'green', fontSize: 13 }}>{msg.text}</p>}
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Enregistrement…' : 'Changer le mot de passe'}</button>
        </div>
      </div>
    </div>
  );
}
