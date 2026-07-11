# Context-Admin — appli web d'administration

> Poste principal du back-office. React + Vite. Sous-domaine cible : `accounting.symbtech.net`.

## État (slice 1)
CRUD des référentiels : **Sociétés** (+ comptes bancaires + moyens de paiement), **Clients** (+ contacts), **Fournisseurs** (+ contacts, case **Personne physique**). Auth JWT (mêmes utilisateurs que l'app Expenses), token en `localStorage`. Appelle l'API `https://expenses.symbtech.net` (CORS activé côté backend).

## Structure (`admin/`)
- `src/config.js` — `API_BASE_URL` (`VITE_API_URL` surchargeable).
- `src/api.js` — fetch + CRUD générique (`listResource/createResource/updateResource/deleteResource`).
- `src/auth.jsx` — contexte auth, token localStorage.
- `src/App.jsx` — gate auth + navigation (état, pas de router).
- `src/components/` — `Layout`, `Modal`, `FieldList` (sous-objets répétables), `ResourcePage` (liste + modale CRUD générique).
- `src/pages/` — `Login`, `Companies`, `Clients`, `Suppliers`.

## Lancer en local
`cd admin && npm install && npm run dev` → http://localhost:5173 (appelle l'API de prod ; login `joffrey@symbtech.net`).

## Déploiement → `accounting.symbtech.net`
SPA statique : `admin/deploy-admin.sh` (build Vite + rsync `dist/` → `/var/www/accounting.symbtech.net` sur l'EC2 + reload Nginx). Vhost statique `ops/nginx-accounting.conf` (`try_files … /index.html`). DNS : A record `accounting → 54.246.159.110` (zone **Wix**). HTTPS : Certbot `--nginx`. **One-time** : créer le dossier web, déposer le vhost, certbot. **Ensuite** : `./deploy-admin.sh` à chaque mise à jour. Build appelle l'API prod `https://expenses.symbtech.net` (CORS `*` ; à restreindre à `accounting.symbtech.net` + `localhost:5173` via `CORS_ORIGINS` plus tard).

## Suite
Pièces jointes (contrats/BC, upload S3) · relevés bancaires + rapprochement · facturation · appli large embarquant Expenses.


## Pièces jointes — opérationnel
Composant `Attachments.jsx` dans les fiches Client/Fournisseur : téléverser (contrat / BC / autre), **Voir** (URL S3 signée, nouvel onglet), **Supprimer**. Disponible une fois la fiche enregistrée (besoin de l'`_id`). Persistance immédiate (hors bouton Enregistrer) ; la liste se rafraîchit à la fermeture de la modale.
Backend : `POST` / `GET …/url` / `DELETE` sur `/:resource/:id/attachments` (clients & fournisseurs), upload S3 via `lib/s3`. API admin : `uploadAttachment / getAttachmentUrl / deleteAttachment`.
