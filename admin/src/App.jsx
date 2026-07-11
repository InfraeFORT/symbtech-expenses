// src/App.jsx — racine : authentification + navigation entre référentiels.
import React, { useState } from 'react';
import { AuthProvider, useAuth } from './auth';
import Login from './pages/Login';
import Layout from './components/Layout';
import Companies from './pages/Companies';
import Clients from './pages/Clients';
import Suppliers from './pages/Suppliers';
import Bank from './pages/Bank';
import Invoices from './pages/Invoices';
import Ledger from './pages/Ledger';
import Charges from './pages/Charges';
import Devis from './pages/Devis';
import Products from './pages/Products';
import Contrats from './pages/Contrats';
import Cra from './pages/Cra';
import ComingSoon from './pages/ComingSoon';
import Simulations from './pages/Simulations';
import Payslips from './pages/Payslips';

function Shell() {
  const { token } = useAuth();
  const [page, setPage] = useState('companies');

  if (!token) return <Login />;

  return (
    <Layout page={page} onNavigate={setPage}>
      {page === 'companies' && <Companies />}
      {page === 'clients' && <Clients />}
      {page === 'suppliers' && <Suppliers />}
      {page === 'products' && <Products />}
      {page === 'contracts' && <Contrats />}
      {page === 'bank' && <Bank />}
      {page === 'invoices' && <Invoices />}
      {page === 'quotes' && <Devis />}
      {page === 'cra' && <Cra />}
      {page === 'ledger' && <Ledger />}
      {page === 'charges' && <Charges />}
      {page === 'sim-employee' && <Simulations kind="employee" />}
      {page === 'sim-company' && <Simulations kind="company" />}
      {page === 'payslips' && <Payslips />}
      {page === 'supplier-contracts' && <ComingSoon title="Contrats fournisseurs" note="Contrats côté achats (fournisseurs) — à construire, sur le modèle des contrats clients." />}
      {page === 'recurring-purchases' && <ComingSoon title="Achats récurrents" note="Achats récurrents obligatoirement liés à un fournisseur (abonnements, loyers, services récurrents) — à construire." />}
      {page === 'fixed-assets' && <ComingSoon title="Achats immobilisés" note="Immobilisations / achats immobilisés (suivi des actifs, amortissements) — à construire." />}
      {page === 'report-balance' && <ComingSoon title="Bilan" note="État de la situation financière — généré depuis le Grand Livre. À construire." />}
      {page === 'report-pl' && <ComingSoon title="Compte de résultat" note="Produits et charges de la période — généré depuis le Grand Livre. À construire." />}
      {page === 'report-cashflow' && <ComingSoon title="Tableau de flux de trésorerie" note="Flux de trésorerie (exploitation, investissement, financement) — à construire." />}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
