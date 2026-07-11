# Navigation groupée (4 domaines)

Sidebar réorganisée en 4 domaines repliables (Layout.jsx) :
- **Masterdata** : Sociétés, Clients, Fournisseurs, Produits & services.
- **Purchase to Pay** : Contrats fournisseurs*, Achats courants (= ancien « Charges »), Achats récurrents*, Achats immobilisés*.
- **Order to Cash** : Contrats clients (= ancien « Contrats »), Devis, Comptes rendus (CRA), Factures.
- **Record to Report** : Grand Livre, Banque, puis « Rapports financiers » : Bilan*, Compte de résultat*, Flux de trésorerie*.

(*) Modules nouveaux : route câblée vers `pages/ComingSoon.jsx` (écran provisoire) en attendant leur construction.

Notes :
- `charges` renommé « Achats courants » (clé inchangée). `contracts` = « Contrats clients ».
- **Banque** placée sous Record to Report (non précisé par le besoin initial — déplaçable).
- Clés nouvelles : supplier-contracts, recurring-purchases, fixed-assets, report-balance, report-pl, report-cashflow.
