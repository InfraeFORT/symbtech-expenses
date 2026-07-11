# Référentiel Produits & services

## Backend
- `models/Product.js` : name, description, kind (service|good), code, unit, unitPrice, vatRate, currency, active.
- Enregistré via le factory `crudRouter(Product, 'produits')` dans `routes/referentials.js`, monté `/products` (authRequired) dans server.js. GET `/products` = actifs ; `?all=1` = tout.

## Admin
- `pages/Products.jsx` (nav « Produits & services ») : ResourcePage CRUD (type, unité, P.U. HT, TVA %, devise, actif).
- **Catalogue dans les lignes** : Devis.jsx et Invoices.jsx chargent `listProducts` (actifs) ; un sélecteur « + depuis le catalogue… » dans l'en-tête des lignes ajoute une ligne pré-remplie (description = nom — description, P.U., TVA). La devise du document est initialisée depuis le produit si vide.
- api.js : `listProducts` (actifs).

## Photo produit
- `Product.imageKey` (clé S3). Factory `crudRouter` : option `{ image: true }` → routes `POST /:id/image` (upload S3, remplace l ancienne), `GET /:id/image/url` (URL signée), `DELETE /:id/image`.
- Admin : composant `ProductImage` dans la fiche produit (aperçu + téléversement + suppression ; nécessite un produit déjà enregistré). api.js : uploadProductImage, getProductImageUrl, deleteProductImage.
