// src/components/FieldList.jsx — édition d'un tableau de sous-objets (add/remove).
import React from 'react';

export default function FieldList({ label, items, fields, onChange }) {
  const rows = items || [];
  const add = () => onChange([...rows, {}]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const setField = (i, key, val) =>
    onChange(rows.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)));

  return (
    <div className="fieldlist">
      <div className="fieldlist-head">
        <span>{label}</span>
        <button type="button" className="btn" onClick={add}>+ Ajouter</button>
      </div>
      {rows.length === 0 && <div className="muted">Aucun.</div>}
      {rows.map((it, i) => (
        <div className="fieldlist-row" key={i}>
          {fields.map((fld) => (
            <input
              key={fld.key}
              placeholder={fld.label}
              value={it[fld.key] || ''}
              onChange={(e) => setField(i, fld.key, e.target.value)}
            />
          ))}
          <button type="button" className="link-danger" onClick={() => remove(i)} title="Retirer">×</button>
        </div>
      ))}
    </div>
  );
}
