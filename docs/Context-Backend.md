# Context-Backend — symbtech-expenses

> Domaine : micro-service Express (OCR + API persistance), stockage S3, base Mongo, déploiement.
> Voir aussi : `Context-OCR.md` (détail extraction), `Context-Data.md` (schéma).
> Dernière mise à jour : 25 juin 2026.

---

## 1. État actuel

OCR validé sur de vrais justificatifs (image, PDF, multi-pages) ; couche persistance (Mongo + S3) construite et prête à consommer les credentials.

### Arborescence

```
backend/
├── lib/
│   ├── ocr.js          # cœur : extractExpenseFromFiles(buffers[]) — image, PDF, multi-pages
│   ├── db.js           # connexion Mongoose (paresseuse, non bloquante)
│   ├── s3.js           # upload/get/delete justificatifs (SDK AWS v3)
│   └── auth.js         # signature JWT + middleware authRequired
├── models/
│   ├── Expense.js      # schéma dépense (cf. Context-Data.md)
│   └── User.js         # utilisateur (mot de passe bcrypt)
├── routes/
│   ├── expenses.js     # /ocr, POST /, GET /, GET/PATCH/DELETE /:id
│   └── auth.js         # POST /login, GET /me
├── scripts/
│   └── createUser.js   # npm run create-user
├── server.js           # point d'entrée Express
├── package.json
└── .env.example
```

### Dépendances (vérifiées le 25/06/2026)

| Paquet | Version | Rôle |
|---|---|---|
| `@anthropic-ai/sdk` | ^0.106 | appel vision Claude (image + PDF) |
| `@aws-sdk/client-s3` | ^3.10 | stockage justificatifs |
| `mongoose` | ^9.7 | ODM MongoDB |
| `jsonwebtoken` | ^9 | signature/vérification JWT |
| `bcryptjs` | ^3 | hachage des mots de passe |
| `express` | ^4.22 | serveur HTTP |
| `multer` | ^2.2 | upload multipart |
| `sharp` | ^0.33 | rotation EXIF + redimensionnement image |
| `dotenv` | ^16 | variables d'env |

---

## 2. API

| Méthode | Route | Rôle | Statut |
|---|---|---|---|
| `POST` | `/expenses/ocr` | extraction depuis 1..n pages (image/PDF), une dépense | ✅ |
| `POST` | `/expenses` | créer une dépense validée (+ upload S3 des justificatifs) | ✅ |
| `GET` | `/expenses` | liste/recherche (filtres : company, type, currency, from, to, validated, q ; pagination limit/skip) | ✅ |
| `GET` | `/expenses/:id` | détail | ✅ |
| `GET` | `/expenses/:id/files` | URL signées des justificatifs (S3 privé) | ✅ |
| `GET/POST/PATCH/DELETE` | `/companies` | CRUD sociétés (admin) | ✅ |
| `GET/POST/PATCH/DELETE` | `/clients` | CRUD clients (admin) | ✅ |
| `GET/POST/PATCH/DELETE` | `/suppliers` | CRUD fournisseurs (admin) | ✅ |
| `PATCH` | `/expenses/:id` | modifier les champs métier | ✅ |
| `DELETE` | `/expenses/:id` | supprimer (+ purge S3) | ✅ |
| `POST` | `/auth/login` | connexion -> JWT | ✅ |
| `GET` | `/auth/me` | identité du porteur du token | ✅ |
| `GET` | `/expenses/export` | export comptable | ◻ format TBD |

### Authentification
- **JWT** : toutes les routes `/expenses` sont protégées par le middleware `authRequired` (header `Authorization: Bearer <token>`). `/health` et `/auth/login` restent ouverts.
- Connexion : `POST /auth/login { email, password }` -> `{ token, user }`. Mot de passe haché bcrypt ; message d'erreur générique (ne révèle pas email vs mot de passe).
- `createdBy` est renseigné automatiquement depuis le token ; pas d'usurpation possible via le body.
- **Création d'utilisateur** : pas d'inscription ouverte (faille). Script CLI : `npm run create-user -- <email> <password> "<Nom>" [role]`.
- Variables : `JWT_SECRET` (obligatoire ; `openssl rand -base64 48`), `JWT_TTL` (défaut 30j).

### Notes d'implémentation
- `POST /expenses` accepte le champ `file` répété (multi-pages) + les champs métier en `multipart/form-data` ; chaque page est poussée sur S3, et la dépense est écrite avec ses `s3Keys`.
- Connexion Mongo **paresseuse** (`ensureDB`) : la route OCR fonctionne sans base ; les routes base renvoient un `503` propre si Mongo est indisponible.

---

## 3. Stockage S3

Bucket **dédié** (neutre, sans référence e-FORT), préfixe `expenses/`. Clé : `expenses/AAAA/MM/<uuid>.<ext>`. Justificatifs privés (blocage public activé). Accès via utilisateur IAM dédié scoppé au seul bucket. Helper : `lib/s3.js` (`uploadBuffer`, `deleteKey`).

Variables : `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_PREFIX`.

---

## 4. Base Mongo

Base **dédiée** `symbtech-expenses` sur un **projet/cluster Atlas séparé** d'e-FORT (tier Free pour démarrer). Collection `expenses`. Connexion : `lib/db.js`. Schéma et index : `Context-Data.md`.

Variables : `MONGODB_URI`, `MONGODB_DB`.

---

## 5. Déploiement — même EC2 qu'e-FORT, isolé

« Au même endroit » = la **même instance EC2 AWS Ubuntu** que celle qui héberge e-FORT (`app.e-fort.net`), qui fait déjà tourner plusieurs vhosts Nginx. Isolation préservée : process, port, vhost et domaine **distincts**.

| Élément | Valeur |
|---|---|
| Hôte | EC2 (même box ; SSH `ubuntu@app.e-fort.net` ou IP) |
| Dossier distant | `/home/ubuntu/symbtech-expenses` (neutre, hors `efort-platform`) |
| Process pm2 | `symbtech-expenses` |
| Port | `3003` (3000/3001/**3002** pris : e-FORT + `efort-marketing`) → `.env` prod : `PORT=3003` |
| Nginx | vhost dédié `ops/nginx-symbtech-expenses.conf` → `proxy_pass 127.0.0.1:3002`, `client_max_body_size 25M` |
| Domaine | `expenses.symbtech.net` — DNS chez **IONOS** (pas Cloudflare) → A record → `54.246.159.110` ; HTTPS via **Let's Encrypt / Certbot** sur l'origine |
| Déploiement | `backend/deploy.sh` : rsync (exclut `.env`, `node_modules`, `*.bak.*`) → `npm install --omit=dev` → `pm2 restart/start` → `curl /health`. Pas de git. |

Points clés :
- **`.env` prod vit sur le serveur** (jamais poussé par rsync). `PORT=3002`.
- **dotenv lit `process.cwd()`** → pm2 doit démarrer avec cwd = dossier distant (`cd … && pm2 start server.js`).
- **Atlas Network Access** : ajouter l'**IP publique de l'EC2** au projet `symbtech-expenses` (sinon Mongo injoignable depuis la prod).
- **HTTPS via Let's Encrypt (Certbot --nginx)** : IONOS ne proxifie pas → certificat sur le serveur. Le téléphone tape directement l'EC2 en `https://` (règle iOS ATS). **Prérequis** : Security Group EC2 ouvert en 80+443, et A record propagé (challenge HTTP-01).
- **EC2 IP publique** : `54.246.159.110`. Ports déjà pris : 3000/3001 (e-FORT) + 3002 (`efort-marketing`, non documenté avant).
- Sauvegardes Mongo : tier Free sans backups sérieux → tier payant avant usage comptable réel.

---

**Déploiement réalisé le 26 juin 2026** : `https://expenses.symbtech.net` live (HTTPS Let's Encrypt, expire 2026-09-24, renouvellement auto). DNS géré par **Wix** (pas IONOS), A record `expenses → 54.246.159.110`. SG EC2 déjà ouvert 80/443.
Leçon vhost : le `scp` initial a poussé la version port 3002 → Nginx proxifiait `efort-marketing` (réponse `efort-marketing-backend`) → corrigé par `sed 3002→3003` directement sur le serveur. Toujours vérifier `proxy_pass` après Certbot.

**CORS** : `app.use(cors())` — liste blanche via `CORS_ORIGINS` (CSV) ; vide = tout autorisé. L'API reste protégée par JWT (token en header, pas de cookie). À restreindre au domaine de l'admin web en prod.
**CRUD référentiels** : fabrique générique `crudRouter(Model)` dans `routes/referentials.js` (GET liste `?all=1`, GET/POST/PATCH/DELETE). Modèles : Company, Client, Supplier (+ `attachments[]` pour contrats/BC).

---

## 6. Conventions

- Logique métier dans `lib/` (fonctions pures, testables) ; les routes restent fines.
- Erreurs réseau/API/DB toujours captées et renvoyées en JSON propre (jamais de stack brute au client).
- Variables sensibles uniquement via `.env` (jamais en dur, jamais commité).
