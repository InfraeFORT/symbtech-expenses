// src/pages/Contrats.jsx — référentiel de contrats client : OCR, documents nommés,
// avenants (versionning) et commandes rattachées.
import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import Attachments from '../components/Attachments';
import {
  listResource, listProducts,
  listContracts, createContract, updateContract, deleteContract,
  listAvenants, createAvenant, updateAvenant, deleteAvenant,
  listOrders, createOrder, updateOrder, deleteOrder,
  ocrDocument,
} from '../api';

const today = () => new Date().toISOString().slice(0, 10);
const fmtMoney = (n, c) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (c ? ' ' + c : ''));

const CONTRACT_STATUS = { draft: 'Brouillon', active: 'Actif', expired: 'Échu', terminated: 'Résilié' };
const ORDER_STATUS = { open: 'Ouverte', invoiced: 'Facturée', closed: 'Clôturée', cancelled: 'Annulée' };

function OcrButton({ resource, onResult, label = 'Analyser un document (OCR)' }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try { const r = await ocrDocument(resource, f, token); onResult(r.data || {}); }
    catch (err) { alert(err.message); } finally { setBusy(false); if (e.target) e.target.value = ''; }
  };
  return (
    <div className="field" style={{ background: '#faf7f8', padding: 10, borderRadius: 8 }}>
      <label>{busy ? <><span className="spinner" />Analyse OCR en cours…</> : label}</label>
      <input type="file" accept="application/pdf,image/*" onChange={onFile} disabled={busy} />
      <span className="muted" style={{ fontSize: 12 }}>Les champs reconnus pré-remplissent le formulaire ; vous pouvez tout corriger.</span>
    </div>
  );
}

export default function Contrats() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [current, setCurrent] = useState(null); // contrat en cours d'édition (null = liste)

  const load = async () => {
    setLoading(true);
    try { setItems((await listContracts(token)).items || []); } catch (e) { /* */ } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    (async () => {
      try { setClients((await listResource('clients', token)).items || []); } catch (e) { /* */ }
      try { setCompanies((await listResource('companies', token)).items || []); } catch (e) { /* */ }
    })();
  }, []);

  if (current) {
    return (
      <ContractDetail
        token={token} clients={clients} companies={companies}
        initial={current} onBack={() => { setCurrent(null); load(); }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>{items.length} contrat(s)</p>
        <button className="btn btn-primary" onClick={() => setCurrent({ status: 'active', currency: 'EUR', startDate: today() })}>+ Nouveau contrat</button>
      </div>
      {loading ? <p className="muted">Chargement…</p> : items.length === 0 ? (
        <p className="muted">Aucun contrat. Cliquez « + Nouveau contrat ».</p>
      ) : (
        <table className="table">
          <thead><tr><th>Référence</th><th>Intitulé</th><th>Client</th><th>Période</th><th style={{ textAlign: 'right' }}>Valeur</th><th>Statut</th></tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c._id} className="clickable" onClick={() => setCurrent(c)}>
                <td>{c.reference || <span className="muted">—</span>}</td>
                <td>{c.name || '—'}</td>
                <td>{c.clientName || '—'}</td>
                <td className="muted">{c.startDate || '—'}{c.endDate ? ` → ${c.endDate}` : ''}</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(c.value, c.currency)}</td>
                <td>{CONTRACT_STATUS[c.status] || c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ContractDetail({ token, clients, companies, initial, onBack }) {
  const [c, setC] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));

  const applyOcr = (d) => {
    setC((x) => ({
      ...x,
      reference: x.reference || d.reference || '',
      name: x.name || d.title || '',
      object: x.object || d.object || '',
      clientName: x.clientName || d.clientName || '',
      startDate: x.startDate || d.startDate || '',
      endDate: x.endDate || d.endDate || '',
      value: x.value ?? (d.value ?? null),
      currency: d.currency || x.currency || 'EUR',
      paymentTerms: x.paymentTerms || d.paymentTerms || '',
      mentions: x.mentions || d.mentions || '',
      noticePeriod: x.noticePeriod || d.noticePeriod || '',
    }));
  };

  const onClient = (name) => {
    const cl = clients.find((x) => x.name === name);
    setC((x) => ({ ...x, clientName: name, clientId: cl ? cl._id : '' }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = c._id ? await updateContract(c._id, c, token) : await createContract(c, token);
      setC(saved);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!c._id) { onBack(); return; }
    if (!confirm('Supprimer ce contrat ?')) return;
    try { await deleteContract(c._id, token); onBack(); } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <button className="btn btn-ghost" onClick={onBack}>← Retour aux contrats</button>

      <div className="card-block" style={{ marginTop: 12 }}>
        <OcrButton resource="contracts" onResult={applyOcr} />

        <div className="grid2">
          <div className="field"><label>Client</label>
            <select value={c.clientName || ''} onChange={(e) => onClient(e.target.value)}>
              <option value="">— choisir —</option>
              {clients.map((x) => <option key={x._id} value={x.name}>{x.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Société contractante</label>
            <select value={c.company || ''} onChange={(e) => set('company', e.target.value)}>
              <option value="">— choisir —</option>
              {companies.map((x) => <option key={x._id} value={x.name}>{x.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid2">
          <div className="field"><label>Référence</label><input value={c.reference || ''} onChange={(e) => set('reference', e.target.value)} /></div>
          <div className="field"><label>Intitulé</label><input value={c.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
        </div>
        <div className="field"><label>Objet</label><textarea rows="2" value={c.object || ''} onChange={(e) => set('object', e.target.value)} /></div>
        <div className="grid2">
          <div className="field"><label>Début</label><input type="date" value={c.startDate || ''} onChange={(e) => set('startDate', e.target.value)} /></div>
          <div className="field"><label>Fin / échéance</label><input type="date" value={c.endDate || ''} onChange={(e) => set('endDate', e.target.value)} /></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Valeur</label><input type="number" step="any" value={c.value ?? ''} onChange={(e) => set('value', e.target.value === '' ? null : Number(e.target.value))} /></div>
          <div className="field"><label>Devise</label><input value={c.currency || ''} onChange={(e) => set('currency', (e.target.value || '').toUpperCase())} /></div>
        </div>
        <div className="field"><label>Conditions de paiement</label><textarea rows="2" value={c.paymentTerms || ''} onChange={(e) => set('paymentTerms', e.target.value)} /></div>
        <div className="field"><label>Mentions à reporter sur les factures</label><textarea rows="2" value={c.mentions || ''} onChange={(e) => set('mentions', e.target.value)} /></div>
        <div className="grid2">
          <div className="field"><label>Préavis / reconduction</label><textarea rows="2" value={c.noticePeriod || ''} onChange={(e) => set('noticePeriod', e.target.value)} /></div>
          <div className="field"><label>Statut</label>
            <select value={c.status || 'active'} onChange={(e) => set('status', e.target.value)}>
              {Object.entries(CONTRACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="modal-actions">
          {c._id && <button className="btn btn-danger" onClick={remove} disabled={busy}>Supprimer</button>}
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '…' : (c._id ? 'Enregistrer' : 'Créer le contrat')}</button>
        </div>
      </div>

      {c._id ? (
        <>
          <div className="card-block" style={{ marginTop: 16 }}>
            <Attachments resource="contracts" entity={c} onChange={(atts) => set('attachments', atts)} />
          </div>
          <SubSection
            kind="avenant" token={token} contractId={c._id}
            list={listAvenants} create={createAvenant} update={updateAvenant} del={deleteAvenant}
          />
          <SubSection
            kind="order" token={token} contractId={c._id} client={{ name: c.clientName, id: c.clientId }} company={c.company}
            list={listOrders} create={createOrder} update={updateOrder} del={deleteOrder}
          />
        </>
      ) : (
        <p className="muted" style={{ marginTop: 16 }}>Enregistrez le contrat pour ajouter des documents, des avenants et des commandes.</p>
      )}
    </div>
  );
}

function sumLines(lines) {
  return Math.round((lines || []).reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0) * 100) / 100;
}

function LinesEditor({ lines, currency, products, onChange }) {
  const ls = lines || [];
  const set = (i, f, v) => onChange(ls.map((l, j) => (j === i ? { ...l, [f]: v } : l)));
  const add = () => onChange([...ls, { description: '', quantity: 1, unitPrice: 0, vatRate: 0 }]);
  const addCat = (id) => {
    const p = (products || []).find((x) => x._id === id);
    if (!p) return;
    onChange([...ls, { description: [p.name, p.description].filter(Boolean).join(' — '), quantity: 1, unitPrice: Number(p.unitPrice) || 0, vatRate: Number(p.vatRate) || 0 }]);
  };
  const rm = (i) => onChange(ls.filter((_, j) => j !== i));
  return (
    <div className="fieldlist">
      <div className="fieldlist-head">
        <span>Lignes de la commande</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(products || []).length > 0 && (
            <select value="" onChange={(e) => addCat(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="">+ catalogue…</option>
              {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          )}
          <button type="button" className="btn btn-ghost" onClick={add}>+ Ligne</button>
        </span>
      </div>
      {ls.map((l, i) => (
        <div key={i} style={{ borderBottom: '1px solid #f0eef0', paddingBottom: 8, marginBottom: 8 }}>
          <input style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, marginBottom: 6 }}
            placeholder="Description" value={l.description} onChange={(e) => set(i, 'description', e.target.value)} />
          <div className="fieldlist-row" style={{ marginBottom: 0 }}>
            <input style={{ flex: '0 0 70px' }} type="number" step="any" placeholder="Qté" value={l.quantity} onChange={(e) => set(i, 'quantity', e.target.value)} />
            <input style={{ flex: '1 1 110px' }} type="number" step="any" placeholder="P.U." value={l.unitPrice} onChange={(e) => set(i, 'unitPrice', e.target.value)} />
            <input style={{ flex: '0 0 80px' }} type="number" step="any" placeholder="TVA %" value={l.vatRate} onChange={(e) => set(i, 'vatRate', e.target.value)} />
            <span style={{ flex: '1 1 100px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), currency)}</span>
            <button type="button" className="link-danger" onClick={() => rm(i)} title="Retirer">×</button>
          </div>
        </div>
      ))}
      <div style={{ textAlign: 'right', fontWeight: 600 }}>Total : {fmtMoney(sumLines(ls), currency)}</div>
    </div>
  );
}

const SUB = {
  avenant: {
    title: 'Avenants (versionning)', singular: 'avenant', resource: 'avenants', ocrResource: 'contracts',
    columns: [['version', 'Version'], ['name', 'Intitulé'], ['date', 'Date'], ['value', 'Valeur', true]],
    blank: () => ({ version: '', name: '', date: today(), object: '', summary: '', value: null, currency: '', paymentTerms: '', mentions: '' }),
    applyOcr: (x, d) => ({ ...x, name: x.name || d.title || '', object: x.object || d.object || '', value: x.value ?? (d.value ?? null), currency: d.currency || x.currency || '', paymentTerms: x.paymentTerms || d.paymentTerms || '', mentions: x.mentions || d.mentions || '' }),
    fields: [
      ['version', 'Version', 'text'], ['date', 'Date', 'date'], ['name', 'Intitulé', 'text'],
      ['object', 'Objet', 'textarea'], ['summary', 'Résumé des modifications', 'textarea'],
      ['value', 'Valeur', 'number'], ['currency', 'Devise', 'text'],
      ['paymentTerms', 'Conditions de paiement', 'textarea'], ['mentions', 'Mentions factures', 'textarea'],
    ],
  },
  order: {
    title: 'Commandes rattachées', singular: 'commande', resource: 'orders', ocrResource: 'orders', withLines: true,
    columns: [['number', 'N°'], ['name', 'Intitulé'], ['date', 'Date'], ['amount', 'Montant', true], ['status', 'Statut']],
    blank: () => ({ number: '', name: '', date: today(), description: '', amount: null, currency: 'EUR', paymentTerms: '', mentions: '', status: 'open' }),
    applyOcr: (x, d) => ({ ...x, number: x.number || d.number || '', date: x.date || d.date || '', description: x.description || d.description || '', amount: x.amount ?? (d.amount ?? null), currency: d.currency || x.currency || 'EUR', paymentTerms: x.paymentTerms || d.paymentTerms || '', mentions: x.mentions || d.mentions || '' }),
    fields: [
      ['number', 'N° de commande', 'text'], ['name', 'Intitulé', 'text'], ['date', 'Date', 'date'],
      ['description', 'Description', 'textarea'], ['amount', 'Montant', 'number'], ['currency', 'Devise', 'text'],
      ['paymentTerms', 'Conditions de paiement', 'textarea'], ['mentions', 'Mentions factures', 'textarea'],
      ['status', 'Statut', 'orderStatus'],
    ],
  },
};

function SubSection({ kind, token, contractId, client, company, list, create, update, del }) {
  const cfg = SUB[kind];
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState([]);

  const reload = async () => { try { setItems((await list(contractId, token)).items || []); } catch (e) { /* */ } };
  useEffect(() => { reload(); if (cfg.withLines) listProducts(token).then((r) => setProducts(r.items || [])).catch(() => {}); }, [contractId]);

  const openNew = () => {
    const base = { ...cfg.blank(), contractId };
    if (kind === 'order') { base.clientId = client?.id || ''; base.clientName = client?.name || ''; base.company = company || ''; }
    setEdit(base);
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = edit._id ? await update(edit._id, edit, token) : await create(edit, token);
      setEdit(saved);
      await reload();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!edit._id) { setEdit(null); return; }
    if (!confirm(`Supprimer cet ${cfg.singular} ?`)) return;
    try { await del(edit._id, token); setEdit(null); await reload(); } catch (e) { alert(e.message); }
  };

  const setF = (k, v) => setEdit((x) => ({ ...x, [k]: v }));

  return (
    <div className="card-block" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ color: 'var(--accent)' }}>{cfg.title}</strong>
        <button className="btn" onClick={openNew}>+ Ajouter</button>
      </div>
      {items.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucun {cfg.singular}.</p> : (
        <table className="table" style={{ boxShadow: 'none' }}>
          <thead><tr>{cfg.columns.map(([k, l]) => <th key={k}>{l}</th>)}<th></th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it._id} className="clickable" onClick={() => setEdit(it)}>
                {cfg.columns.map(([k, l, money]) => (
                  <td key={k}>{money ? fmtMoney(it[k], it.currency) : (k === 'status' ? (ORDER_STATUS[it[k]] || it[k]) : (it[k] || '—'))}</td>
                ))}
                <td className="muted">{(it.attachments || []).length} doc.</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {edit && (
        <Modal title={edit._id ? `${cfg.singular} ${edit.version || edit.number || ''}`.trim() : `Nouvel ${cfg.singular}`} onClose={() => setEdit(null)}>
          <OcrButton resource={cfg.ocrResource} onResult={(d) => setEdit((x) => cfg.applyOcr(x, d))} />
          {cfg.fields.map(([k, label, type]) => (
            <div className="field" key={k}>
              <label>{label}</label>
              {type === 'number' ? (
                <input type="number" step="any" value={edit[k] ?? ''} onChange={(e) => setF(k, e.target.value === '' ? null : Number(e.target.value))} />
              ) : type === 'date' ? (
                <input type="date" value={edit[k] || ''} onChange={(e) => setF(k, e.target.value)} />
              ) : type === 'textarea' ? (
                <textarea rows="2" value={edit[k] || ''} onChange={(e) => setF(k, e.target.value)} />
              ) : type === 'orderStatus' ? (
                <select value={edit[k] || 'open'} onChange={(e) => setF(k, e.target.value)}>
                  {Object.entries(ORDER_STATUS).map(([sk, sv]) => <option key={sk} value={sk}>{sv}</option>)}
                </select>
              ) : (
                <input value={edit[k] || ''} onChange={(e) => setF(k, e.target.value)} />
              )}
            </div>
          ))}

          {cfg.withLines && (
            <LinesEditor
              lines={edit.lines} currency={edit.currency} products={products}
              onChange={(lines) => setEdit((x) => ({ ...x, lines, amount: lines.length ? sumLines(lines) : x.amount }))}
            />
          )}

          {edit._id ? (
            <div className="card-block" style={{ marginTop: 8 }}>
              <Attachments resource={cfg.resource} entity={edit} onChange={(atts) => setF('attachments', atts)} />
            </div>
          ) : (
            <p className="muted">Enregistrez pour joindre des documents.</p>
          )}

          <div className="modal-actions">
            {edit._id && <button className="btn btn-danger" onClick={remove} disabled={busy}>Supprimer</button>}
            <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '…' : (edit._id ? 'Enregistrer' : 'Créer')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
