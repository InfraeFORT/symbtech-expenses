// src/components/Layout.jsx — barre latérale groupée (4 domaines) + en-tête.
import React, { useState } from 'react';
import { useAuth } from '../auth';

const NAV = [
  {
    group: 'Masterdata',
    items: [
      { key: 'companies', label: 'Sociétés' },
      { key: 'clients', label: 'Clients' },
      { key: 'suppliers', label: 'Fournisseurs' },
      { key: 'products', label: 'Produits & services' },
    ],
  },
  {
    group: 'Purchase to Pay',
    items: [
      { key: 'supplier-contracts', label: 'Contrats fournisseurs' },
      { key: 'charges', label: 'Achats courants' },
      { key: 'recurring-purchases', label: 'Achats récurrents' },
      { key: 'fixed-assets', label: 'Achats immobilisés' },
      { key: 'payslips', label: 'Fiches de paie' },
    ],
  },
  {
    group: 'Order to Cash',
    items: [
      { key: 'contracts', label: 'Contrats clients' },
      { key: 'quotes', label: 'Devis' },
      { key: 'cra', label: 'Comptes rendus (CRA)' },
      { key: 'invoices', label: 'Factures' },
    ],
  },
  {
    group: 'Record to Report',
    items: [
      { key: 'ledger', label: 'Grand Livre' },
      { key: 'bank', label: 'Banque' },
      { sublabel: 'Rapports financiers' },
      { key: 'report-balance', label: 'Bilan', sub: true },
      { key: 'report-pl', label: 'Compte de résultat', sub: true },
      { key: 'report-cashflow', label: 'Flux de trésorerie', sub: true },
      { sublabel: "Simulations d'impôt" },
      { key: 'sim-employee', label: 'Impôt salarié', sub: true },
      { key: 'sim-company', label: 'Impôt société', sub: true },
    ],
  },
];

const TITLES = {
  companies: 'Sociétés',
  clients: 'Clients',
  suppliers: 'Fournisseurs',
  products: 'Produits & services',
  contracts: 'Contrats clients',
  'supplier-contracts': 'Contrats fournisseurs',
  bank: 'Relevés bancaires',
  charges: 'Achats courants',
  'recurring-purchases': 'Achats récurrents',
  'fixed-assets': 'Achats immobilisés',
  payslips: 'Fiches de paie',
  invoices: 'Factures',
  quotes: 'Devis',
  cra: "Comptes rendus d'activité",
  ledger: 'Grand Livre',
  'report-balance': 'Bilan',
  'report-pl': 'Compte de résultat',
  'report-cashflow': 'Tableau de flux de trésorerie',
  'sim-employee': 'Simulation impôt salarié',
  'sim-company': 'Simulation impôt société',
};

export default function Layout({ page, onNavigate, children }) {
  const { signOut, user } = useAuth();
  const [open, setOpen] = useState(() => NAV.reduce((acc, g) => { acc[g.group] = true; return acc; }, {}));
  const toggle = (g) => setOpen((o) => ({ ...o, [g]: !o[g] }));

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Symbtech<br />Administration</h1>
        {NAV.map((g) => (
          <div key={g.group}>
            <button className="nav-group" onClick={() => toggle(g.group)}>
              <span>{g.group}</span>
              <span className="chev">{open[g.group] ? '▾' : '▸'}</span>
            </button>
            {open[g.group] && g.items.map((n, i) => (
              n.sublabel ? (
                <div key={`sub-${i}`} className="nav-sublabel">{n.sublabel}</div>
              ) : (
                <button
                  key={n.key}
                  className={'nav-item' + (n.sub ? ' sub' : '') + (page === n.key ? ' active' : '')}
                  onClick={() => onNavigate(n.key)}
                >
                  {n.label}
                </button>
              )
            ))}
          </div>
        ))}
      </aside>
      <div className="main">
        <div className="topbar">
          <h2>{TITLES[page] || ''}</h2>
          <button className="btn btn-ghost" onClick={signOut}>
            {user?.name ? `${user.name} · ` : ''}Déconnexion
          </button>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
