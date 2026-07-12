# Context-Droits.md — Utilisateurs, groupes et droits

## Principe
Les droits sont portés par des **groupes**. Un utilisateur appartient à plusieurs groupes et cumule leurs droits : **le plus permissif l'emporte** (aucun < lecture < écriture ; l'écriture implique la lecture). Les périmètres société s'additionnent également. Un utilisateur **sans groupe n'a aucun droit**.

## Backend
- `models/Group.js` : name, description, **isAdmin** (accès administration = tous les droits), `permissions[{resource, level: none|read|write}]`, **allCompanies** (bool) ou `companies[]` (noms de sociétés), active.
- `models/User.js` : + `groups[ObjectId]`, `active`. Mot de passe bcrypt (`setPassword` / `verifyPassword`).
- `lib/permissions.js` :
  - `RESOURCES` : 18 éléments protégeables (companies, clients, suppliers, products, supplier-contracts, charges, recurring-purchases, fixed-assets, payslips, contracts, quotes, cra, invoices, orders, ledger, bank, reports, simulations).
  - `effectivePermissions(userId)` : union des groupes → { isAdmin, permissions{}, allCompanies, companies[] }.
  - `loadPerms` (middleware, pose `req.perms`), `requirePerm(resource)` (lecture pour GET, écriture pour POST/PATCH/DELETE ; **filtre les listes par société** et refuse les écritures hors périmètre), `requireAdmin`.
  - **`ensureBootstrap()`** : au premier démarrage (aucun groupe en base), crée le groupe **Administrateurs** (tous droits, toutes sociétés) et y rattache tous les comptes existants — évite tout verrouillage.
  - Champs société reconnus pour le cloisonnement : `company`, `issuerCompany`, `companyName`.
- `routes/admin.js` (réservé aux administrateurs) : CRUD `/admin/groups`, `/admin/users`, `POST /admin/users/:id/password` (réinitialisation), `GET /admin/resources`. Garde-fous : pas de suppression du dernier groupe d'administration, pas d'auto-désactivation / auto-suppression.
- `routes/auth.js` : `GET /auth/me` renvoie désormais `{ user, perms }` ; `POST /auth/password` (changement par l'utilisateur, mot de passe actuel exigé) ; login refusé si compte désactivé.
- `server.js` : chaque route montée derrière `guard(resource) = [authRequired, loadPerms, requirePerm(resource)]` ; `/admin` derrière `requireAdmin` ; `ensureBootstrap()` après `connectDB()`.

## Admin
- `auth.jsx` : charge `/auth/me` au démarrage et après connexion ; expose `can(resource, 'read'|'write')`, `isAdmin`, `allowedCompanies`, `refresh()`.
- `components/Layout.jsx` : navigation **filtrée** (seuls les éléments lisibles apparaissent) ; groupe **Administration** (Utilisateurs, Groupes & droits) visible des seuls administrateurs ; accès « Mon compte » dans la barre du haut.
- `App.jsx` : garde d'accès par page (message « Accès refusé » si droit manquant) ; routes `users`, `groups`, `account`.
- `components/ResourcePage.jsx` : **lecture seule** si pas de droit d'écriture (boutons Nouveau / Enregistrer / Supprimer masqués).
- `pages/Admin.jsx` : écrans Utilisateurs (création avec mot de passe initial, rattachement aux groupes, activation, réinitialisation de mot de passe) et Groupes (grille des droits par élément, périmètre société, administration).
- `pages/Account.jsx` : identité, droits effectifs, changement de mot de passe.

## Limite connue
La lecture seule est appliquée automatiquement sur les pages génériques de référentiels. Sur les pages spécifiques (Factures, Devis, Paie, Banque, CRA…), les boutons restent visibles mais **le serveur refuse** l'écriture (403) — le masquage page par page reste à faire.

