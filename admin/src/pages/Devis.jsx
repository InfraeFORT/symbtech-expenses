// src/pages/Devis.jsx — devis : liste, éditeur de lignes, émission, conversion en facture, vue imprimable.
import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import {
  listResource, listProducts, listQuotes, createQuote, updateQuote,
  issueQuote, setQuoteStatus, convertQuote, deleteQuote,
} from '../api';
import Modal from '../components/Modal';

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d, n) => {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const fmtMoney = (n, cur) =>
  n == null || n === '' ? '' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (cur ? ' ' + cur : '');

function totals(lines) {
  let s = 0, v = 0;
  for (const l of lines || []) {
    const ht = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
    s += ht;
    v += (ht * (Number(l.vatRate) || 0)) / 100;
  }
  const rd = (x) => Math.round(x * 100) / 100;
  return { subtotal: rd(s), vatTotal: rd(v), total: rd(s + v) };
}

function companyToIssuer(c) {
  return {
    name: c.name || null, code: c.code || null,
    address1: c.address1 || c.address || null, address2: c.address2 || null,
    postalCode: c.postalCode || c.zip || null, city: c.city || null, country: c.country || null,
    regNumber: c.regNumber || c.registration || c.reg || null,
    vatNumber: c.vatNumber || c.vat || null,
    bankAccounts: (c.bankAccounts || []).map((b) => ({
      bankName: b.bankName || b.bank || null, swift: b.swift || b.bic || null,
      iban: b.iban || null, accountNumber: b.accountNumber || b.account || null, currency: b.currency || null,
    })),
  };
}
function clientToParty(c) {
  return {
    name: c.name || null, code: c.code || null,
    address1: c.address1 || c.address || null, address2: c.address2 || null,
    postalCode: c.postalCode || c.zip || null, city: c.city || null, country: c.country || null,
    regNumber: c.regNumber || c.registration || c.reg || null,
    vatNumber: c.vatNumber || c.vat || null, bankAccounts: [],
  };
}

const STATUS = {
  draft: { label: 'Brouillon', color: '#6b7280' },
  sent: { label: 'Émis / envoyé', color: '#1d4ed8' },
  accepted: { label: 'Accepté', color: '#166534' },
  rejected: { label: 'Refusé', color: '#b91c1c' },
  converted: { label: 'Converti en facture', color: '#7c3aed' },
};

function blankQuote() {
  return {
    issuerCompany: '', issuer: {}, clientId: '', client: {},
    date: today(), validUntil: plusDays(today(), 30), currency: 'EUR',
    lines: [{ description: '', quantity: 1, unitPrice: 0, vatRate: 0 }],
    notes: '', terms: 'Devis valable 30 jours.', status: 'draft',
  };
}

export default function Devis() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [clients, setClients] = useState([]);
  const [edit, setEdit] = useState(null);
  const [printQ, setPrintQ] = useState(null);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listQuotes(token);
      setItems(r.items || []);
    } catch (e) { /* */ } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    (async () => {
      try { setCompanies((await listResource('companies', token)).items || []); } catch (e) { /* */ }
      try { setClients((await listResource('clients', token)).items || []); } catch (e) { /* */ }
      try { setProducts((await listProducts(token)).items || []); } catch (e) { /* */ }
    })();
  }, []);

  const t = edit ? totals(edit.lines) : null;

  const onIssuer = (name) => {
    const c = companies.find((x) => x.name === name);
    setEdit((e) => ({
      ...e, issuerCompany: name, issuer: c ? companyToIssuer(c) : {},
      currency: (c && c.bankAccounts && c.bankAccounts[0] && c.bankAccounts[0].currency) || e.currency || 'EUR',
    }));
  };
  const onClient = (name) => {
    const c = clients.find((x) => x.name === name);
    setEdit((e) => ({ ...e, clientId: c ? c._id : '', client: c ? clientToParty(c) : {} }));
  };
  const setLine = (i, field, val) =>
    setEdit((e) => ({ ...e, lines: e.lines.map((l, j) => (j === i ? { ...l, [field]: val } : l)) }));
  const addLine = () =>
    setEdit((e) => ({ ...e, lines: [...e.lines, { description: '', quantity: 1, unitPrice: 0, vatRate: 0 }] }));
  const removeLine = (i) =>
    setEdit((e) => ({ ...e, lines: e.lines.filter((_, j) => j !== i) }));

  const addFromCatalog = (id) => {
    const p = products.find((x) => x._id === id);
    if (!p) return;
    setEdit((e) => ({
      ...e,
      lines: [...e.lines, {
        description: [p.name, p.description].filter(Boolean).join(' — '),
        quantity: 1, unitPrice: Number(p.unitPrice) || 0, vatRate: Number(p.vatRate) || 0,
      }],
      currency: e.currency || p.currency || 'EUR',
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        issuerCompany: edit.issuerCompany, issuer: edit.issuer, clientId: edit.clientId, client: edit.client,
        date: edit.date, validUntil: edit.validUntil, currency: edit.currency,
        lines: edit.lines, notes: edit.notes, terms: edit.terms,
      };
      const saved = edit._id ? await updateQuote(edit._id, body, token) : await createQuote(body, token);
      setEdit(saved);
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const issue = async () => {
    if (!edit._id) { alert('Enregistrez d’abord le brouillon.'); return; }
    if (!edit.issuerCompany) { alert('Choisissez la société émettrice.'); return; }
    if (!window.confirm('Émettre le devis ? Un numéro sera attribué et le devis ne sera plus modifiable.')) return;
    setBusy(true);
    try { const r = await issueQuote(edit._id, token); setEdit(r); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const mark = async (s) => {
    setBusy(true);
    try { const r = await setQuoteStatus(edit._id, s, token); setEdit(r); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const convert = async () => {
    if (!window.confirm('Convertir ce devis en facture (brouillon) ?')) return;
    setBusy(true);
    try {
      const r = await convertQuote(edit._id, token);
      setEdit((e) => ({ ...e, status: 'converted', convertedInvoiceId: r.invoiceId }));
      await load();
      alert(r.alreadyConverted
        ? 'Ce devis était déjà converti en facture.'
        : 'Devis converti en facture (brouillon). Retrouvez-la dans l’onglet Factures pour l’émettre.');
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer ce devis ?')) return;
    try { await deleteQuote(id, token); await load(); } catch (e) { alert(e.message); }
  };
  const removeFromEditor = async () => {
    if (!window.confirm('Supprimer ce devis ?')) return;
    try { await deleteQuote(edit._id, token); setEdit(null); await load(); } catch (e) { alert(e.message); }
  };

  const isDraft = edit && edit.status === 'draft';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>{items.length} devis</p>
        <button className="btn btn-primary" onClick={() => setEdit(blankQuote())}>+ Nouveau devis</button>
      </div>

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="muted">Aucun devis pour l’instant.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Numéro</th><th>Émetteur</th><th>Client</th><th>Date</th><th style={{ textAlign: 'right' }}>Total</th><th>Statut</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((q) => {
              const st = STATUS[q.status] || STATUS.draft;
              return (
                <tr key={q._id} className="clickable" onClick={() => setEdit(q)}>
                  <td>{q.number || <span className="muted">— brouillon</span>}</td>
                  <td>{q.issuerCompany || '—'}</td>
                  <td>{q.client?.name || '—'}</td>
                  <td>{q.date || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(q.total, q.currency)}</td>
                  <td><span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span></td>
                  <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost" onClick={() => setPrintQ(q)}>Voir</button>{' '}
                    <button className="link-danger" onClick={() => remove(q._id)} title="Supprimer">×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {edit && (
        <Modal title={edit.number ? `Devis ${edit.number}` : (edit._id ? 'Brouillon' : 'Nouveau devis')} onClose={() => setEdit(null)}>
          {!isDraft && (
            <div style={{ marginBottom: 14, padding: 10, background: '#f8f7f8', borderRadius: 8 }}>
              <span style={{ color: (STATUS[edit.status] || {}).color, fontWeight: 600 }}>{(STATUS[edit.status] || {}).label}</span>
              {edit.status === 'converted' ? ' · Ce devis a donné lieu à une facture.' : ' · Devis verrouillé (émis).'}
            </div>
          )}

          <div className="grid2">
            <div className="field">
              <label>Société émettrice</label>
              <select value={edit.issuerCompany} disabled={!isDraft} onChange={(e) => onIssuer(e.target.value)}>
                <option value="">— choisir —</option>
                {companies.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Client</label>
              <select value={edit.client?.name || ''} disabled={!isDraft} onChange={(e) => onClient(e.target.value)}>
                <option value="">— choisir —</option>
                {clients.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid2">
            <div className="field"><label>Date</label><input type="date" value={edit.date || ''} disabled={!isDraft} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></div>
            <div className="field"><label>Valable jusqu'au</label><input type="date" value={edit.validUntil || ''} disabled={!isDraft} onChange={(e) => setEdit({ ...edit, validUntil: e.target.value })} /></div>
          </div>
          <div className="field" style={{ maxWidth: 160 }}>
            <label>Devise</label>
            <input type="text" value={edit.currency || ''} disabled={!isDraft} onChange={(e) => setEdit({ ...edit, currency: e.target.value.toUpperCase() })} />
          </div>

          <div className="fieldlist">
            <div className="fieldlist-head">
            <span>Lignes</span>
            {isDraft && (
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {products.length > 0 && (
                  <select value="" onChange={(e) => addFromCatalog(e.target.value)} style={{ maxWidth: 240 }}>
                    <option value="">+ depuis le catalogue…</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>{p.name}{p.unitPrice ? ` — ${p.unitPrice} ${p.currency || ''}` : ''}</option>
                    ))}
                  </select>
                )}
                <button className="btn btn-ghost" onClick={addLine}>+ Ligne</button>
              </span>
            )}
          </div>
            {edit.lines.map((l, i) => {
              const ht = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
              return (
                <div key={i} style={{ borderBottom: '1px solid #f0eef0', paddingBottom: 8, marginBottom: 8 }}>
                  <input style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, marginBottom: 6 }}
                    placeholder="Description" value={l.description} disabled={!isDraft}
                    onChange={(e) => setLine(i, 'description', e.target.value)} />
                  <div className="fieldlist-row" style={{ marginBottom: 0 }}>
                    <input style={{ flex: '0 0 70px' }} type="number" step="any" placeholder="Qté" value={l.quantity} disabled={!isDraft} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
                    <input style={{ flex: '1 1 110px' }} type="number" step="any" placeholder="P.U." value={l.unitPrice} disabled={!isDraft} onChange={(e) => setLine(i, 'unitPrice', e.target.value)} />
                    <input style={{ flex: '0 0 80px' }} type="number" step="any" placeholder="TVA %" value={l.vatRate} disabled={!isDraft} onChange={(e) => setLine(i, 'vatRate', e.target.value)} />
                    <span style={{ flex: '1 1 100px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(ht, edit.currency)}</span>
                    {isDraft && <button className="link-danger" onClick={() => removeLine(i)} title="Retirer">×</button>}
                  </div>
                </div>
              );
            })}
            <div style={{ textAlign: 'right', marginTop: 8, lineHeight: 1.7 }}>
              <div>Sous-total HT : <strong>{fmtMoney(t.subtotal, edit.currency)}</strong></div>
              <div>TVA : <strong>{fmtMoney(t.vatTotal, edit.currency)}</strong></div>
              <div style={{ fontSize: 18, color: 'var(--primary)' }}>Total TTC : <strong>{fmtMoney(t.total, edit.currency)}</strong></div>
            </div>
          </div>

          <div className="field"><label>Conditions</label><input type="text" value={edit.terms || ''} disabled={!isDraft} onChange={(e) => setEdit({ ...edit, terms: e.target.value })} /></div>
          <div className="field"><label>Notes</label><input type="text" value={edit.notes || ''} disabled={!isDraft} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>

          <div className="modal-actions">
            {edit._id && <button className="btn btn-danger" onClick={removeFromEditor} disabled={busy}>Supprimer</button>}
            <button className="btn btn-ghost" onClick={() => setPrintQ(edit)}>Voir / Imprimer</button>
            {isDraft ? (
              <>
                <button className="btn" onClick={save} disabled={busy}>Enregistrer</button>
                <button className="btn btn-primary" onClick={issue} disabled={busy}>Émettre</button>
              </>
            ) : (
              <>
                {edit.status !== 'converted' && edit.status !== 'rejected' &&
                  <button className="btn" onClick={() => mark('accepted')} disabled={busy || edit.status === 'accepted'}>Accepté</button>}
                {edit.status !== 'converted' && edit.status !== 'accepted' &&
                  <button className="btn" onClick={() => mark('rejected')} disabled={busy || edit.status === 'rejected'}>Refusé</button>}
                {(edit.status === 'sent' || edit.status === 'accepted') && !edit.convertedInvoiceId &&
                  <button className="btn btn-primary" onClick={convert} disabled={busy}>Convertir en facture</button>}
              </>
            )}
          </div>
        </Modal>
      )}

      {printQ && <QuotePrint q={printQ} onClose={() => setPrintQ(null)} />}
    </div>
  );
}

function QuotePrint({ q, onClose }) {
  const t = totals(q.lines);
  const cur = q.currency;
  const issuer = q.issuer || {};
  const client = q.client || {};
  const addr = (p) => [p.address1, p.address2, [p.postalCode, p.city].filter(Boolean).join(' '), p.country].filter(Boolean);
  return (
    <div className="print-overlay">
      <div className="print-toolbar no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>Imprimer / Enregistrer en PDF</button>
        <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
      </div>
      <div className="invoice-print">
        <div className="inv-head">
          <div className="inv-issuer">
            <div className="inv-name">{issuer.name || '—'}</div>
            {addr(issuer).map((l, i) => <div key={i}>{l}</div>)}
            {issuer.regNumber && <div>Reg. : {issuer.regNumber}</div>}
            {issuer.vatNumber && <div>TVA : {issuer.vatNumber}</div>}
          </div>
          <div className="inv-meta">
            <h1>DEVIS</h1>
            <div><strong>{q.number || 'BROUILLON'}</strong></div>
            <div>Date : {q.date || '—'}</div>
            {q.validUntil && <div>Valable jusqu'au : {q.validUntil}</div>}
          </div>
        </div>

        <div className="inv-billto">
          <div className="inv-label">Destinataire</div>
          <div className="inv-name">{client.name || '—'}</div>
          {addr(client).map((l, i) => <div key={i}>{l}</div>)}
          {client.vatNumber && <div>TVA : {client.vatNumber}</div>}
        </div>

        <table className="inv-table">
          <thead>
            <tr><th>Description</th><th className="r">Qté</th><th className="r">P.U.</th><th className="r">TVA</th><th className="r">Montant HT</th></tr>
          </thead>
          <tbody>
            {(q.lines || []).map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td className="r">{l.quantity}</td>
                <td className="r">{fmtMoney(l.unitPrice, cur)}</td>
                <td className="r">{(Number(l.vatRate) || 0)} %</td>
                <td className="r">{fmtMoney((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-totals">
          <div><span>Sous-total HT</span><span>{fmtMoney(t.subtotal, cur)}</span></div>
          <div><span>TVA</span><span>{fmtMoney(t.vatTotal, cur)}</span></div>
          <div className="grand"><span>Total TTC</span><span>{fmtMoney(t.total, cur)}</span></div>
        </div>

        {(q.terms || q.notes) && (
          <div className="inv-foot">
            {q.terms && <div>{q.terms}</div>}
            {q.notes && <div style={{ marginTop: 6 }}>{q.notes}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
