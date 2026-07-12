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

// Élément de droits associé à chaque entrée de navigation.
const RES_OF = {
  companies: 'companies', clients: 'clients', suppliers: 'suppliers', products: 'products',
  'supplier-contracts': 'supplier-contracts', charges: 'charges', 'recurring-purchases': 'recurring-purchases',
  'fixed-assets': 'fixed-assets', payslips: 'payslips',
  contracts: 'contracts', quotes: 'quotes', cra: 'cra', invoices: 'invoices',
  ledger: 'ledger', bank: 'bank',
  'report-balance': 'reports', 'report-pl': 'reports', 'report-cashflow': 'reports',
  'sim-employee': 'simulations', 'sim-company': 'simulations',
};

const ADMIN_NAV = {
  group: 'Administration',
  items: [
    { key: 'users', label: 'Utilisateurs' },
    { key: 'groups', label: 'Groupes & droits' },
  ],
};

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
  users: 'Utilisateurs',
  groups: 'Groupes & droits',
  account: 'Mon compte',
};

export default function Layout({ page, onNavigate, children }) {
  const { signOut, user, can, isAdmin } = useAuth();

  // Navigation filtrée : on ne montre que ce que l'utilisateur peut lire.
  const nav = React.useMemo(() => {
    const groups = NAV
      .map((g) => {
        const items = g.items.filter((n) => (n.sublabel ? true : can(RES_OF[n.key] || n.key, 'read')));
        // retire les sous-titres devenus orphelins
        const cleaned = items.filter((n, i) => !n.sublabel || items.slice(i + 1).some((x) => !x.sublabel && !x.__stop));
        return { ...g, items: cleaned };
      })
      .filter((g) => g.items.some((n) => !n.sublabel));
    return isAdmin ? [...groups, ADMIN_NAV] : groups;
  }, [isAdmin, user]);

  const [open, setOpen] = useState(() => [...NAV, ADMIN_NAV].reduce((acc, g) => { acc[g.group] = true; return acc; }, {}));
  const toggle = (g) => setOpen((o) => ({ ...o, [g]: !o[g] }));

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Symbtech<br />Administration</h1>
        {nav.map((g) => (
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
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-ghost" onClick={() => onNavigate('account')}>
              {user?.name || 'Mon compte'}
            </button>
            <button className="btn btn-ghost" onClick={signOut}>Déconnexion</button>
          </span>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
