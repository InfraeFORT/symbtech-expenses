// src/pages/Clients.jsx
import React from 'react';
import ResourcePage from '../components/ResourcePage';
import FieldList from '../components/FieldList';
import Attachments from '../components/Attachments';

const columns = [
  { key: 'name', label: 'Client' },
  { key: 'onBehalfOf', label: 'Pour le compte de' },
  { key: 'city', label: 'Ville' },
  { key: 'country', label: 'Pays' },
  { key: 'vatNumber', label: 'TVA' },
];

const emptyItem = {
  name: '', onBehalfOf: '', address1: '', address2: '', postalCode: '', city: '',
  country: '', regNumber: '', vatNumber: '', contacts: [], attachments: [],
};

function FormFields({ draft, set }) {
  return (
    <>
      <div className="grid2">
        <div className="field"><label>Nom</label><input value={draft.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field"><label>Pour le compte de</label><input value={draft.onBehalfOf || ''} onChange={(e) => set('onBehalfOf', e.target.value)} /></div>
      </div>
      <div className="field"><label>Adresse 1</label><input value={draft.address1 || ''} onChange={(e) => set('address1', e.target.value)} /></div>
      <div className="field"><label>Adresse 2</label><input value={draft.address2 || ''} onChange={(e) => set('address2', e.target.value)} /></div>
      <div className="grid2">
        <div className="field"><label>Code postal</label><input value={draft.postalCode || ''} onChange={(e) => set('postalCode', e.target.value)} /></div>
        <div className="field"><label>Ville</label><input value={draft.city || ''} onChange={(e) => set('city', e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Pays</label><input value={draft.country || ''} onChange={(e) => set('country', e.target.value)} /></div>
        <div className="field"><label>N° RC / Reg</label><input value={draft.regNumber || ''} onChange={(e) => set('regNumber', e.target.value)} /></div>
      </div>
      <div className="field"><label>N° TVA</label><input value={draft.vatNumber || ''} onChange={(e) => set('vatNumber', e.target.value)} /></div>

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

      <Attachments resource="clients" entity={draft} onChange={(atts) => set('attachments', atts)} />
    </>
  );
}

export default function Clients() {
  return (
    <ResourcePage resource="clients" singular="client" columns={columns} emptyItem={emptyItem} FormFields={FormFields} />
  );
}
