// lib/permissions.js — droits effectifs (union des groupes, le plus permissif l'emporte),
// middlewares de contrôle (lecture/écriture par élément) et cloisonnement par société.
const Group = require('../models/Group');
const User = require('../models/User');

// Éléments protégeables (alignés sur la navigation de l'admin).
const RESOURCES = [
  { key: 'companies', label: 'Sociétés' },
  { key: 'clients', label: 'Clients' },
  { key: 'suppliers', label: 'Fournisseurs' },
  { key: 'products', label: 'Produits & services' },
  { key: 'supplier-contracts', label: 'Contrats fournisseurs' },
  { key: 'charges', label: 'Achats courants' },
  { key: 'recurring-purchases', label: 'Achats récurrents' },
  { key: 'fixed-assets', label: 'Achats immobilisés' },
  { key: 'payslips', label: 'Fiches de paie' },
  { key: 'contracts', label: 'Contrats clients' },
  { key: 'quotes', label: 'Devis' },
  { key: 'cra', label: 'Comptes rendus (CRA)' },
  { key: 'invoices', label: 'Factures' },
  { key: 'orders', label: 'Commandes' },
  { key: 'ledger', label: 'Grand Livre' },
  { key: 'bank', label: 'Banque' },
  { key: 'reports', label: 'Rapports financiers' },
  { key: 'simulations', label: "Simulations d'impôt" },
];
const RESOURCE_KEYS = RESOURCES.map((r) => r.key);

const RANK = { none: 0, read: 1, write: 2 };
const strongest = (a, b) => ((RANK[a] || 0) >= (RANK[b] || 0) ? a : b);

// Champs portant le nom de la société selon les modèles.
const COMPANY_FIELDS = ['company', 'issuerCompany', 'companyName'];

// Droits effectifs d'un utilisateur = union de ses groupes.
async function effectivePermissions(userId) {
  const user = await User.findById(userId).lean();
  if (!user || user.active === false) return null;

  const groups = await Group.find({ _id: { $in: user.groups || [] }, active: true }).lean();

  const perms = {};
  for (const k of RESOURCE_KEYS) perms[k] = 'none';
  let isAdmin = false;
  let allCompanies = false;
  const companies = new Set();

  for (const g of groups) {
    if (g.isAdmin) isAdmin = true;
    if (g.allCompanies) allCompanies = true;
    for (const c of g.companies || []) companies.add(c);
    for (const p of g.permissions || []) {
      if (!RESOURCE_KEYS.includes(p.resource)) continue;
      perms[p.resource] = strongest(perms[p.resource], p.level); // le plus permissif l'emporte
    }
  }

  // L'administrateur a tous les droits, sur toutes les sociétés.
  if (isAdmin) {
    for (const k of RESOURCE_KEYS) perms[k] = 'write';
    allCompanies = true;
  }

  return {
    userId: String(user._id),
    email: user.email,
    name: user.displayName,
    isAdmin,
    permissions: perms,
    allCompanies,
    companies: allCompanies ? [] : Array.from(companies),
  };
}

// Charge les droits sur req.perms (après authRequired).
async function loadPerms(req, res, next) {
  try {
    const perms = await effectivePermissions(req.user.id);
    if (!perms) return res.status(403).json({ error: 'Compte désactivé ou introuvable.' });
    req.perms = perms;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Lecture des droits échouée', detail: err.message });
  }
}

const isWrite = (method) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

// Le nom de société porté par un objet, s'il y en a un.
function companyOf(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const f of COMPANY_FIELDS) {
    if (typeof obj[f] === 'string' && obj[f]) return obj[f];
  }
  return null;
}

// Contrôle d'accès à un élément : lecture pour GET, écriture pour POST/PATCH/DELETE.
// Applique aussi le cloisonnement par société (filtrage des listes, blocage des écritures).
function requirePerm(resource) {
  return function (req, res, next) {
    const level = (req.perms && req.perms.permissions[resource]) || 'none';
    const needed = isWrite(req.method) ? 'write' : 'read';
    if (RANK[level] < RANK[needed]) {
      return res.status(403).json({
        error: needed === 'write'
          ? "Droit d'écriture requis sur cet élément."
          : 'Droit de lecture requis sur cet élément.',
      });
    }

    // Périmètre société
    if (!req.perms.allCompanies) {
      const allowed = req.perms.companies || [];

      // Écriture : la société visée doit être autorisée.
      if (isWrite(req.method)) {
        const target = companyOf(req.body);
        if (target && !allowed.includes(target)) {
          return res.status(403).json({ error: `Accès refusé à la société « ${target} ».` });
        }
      }

      // Lecture : filtre les listes et refuse les objets hors périmètre.
      const json = res.json.bind(res);
      res.json = (payload) => {
        try {
          if (payload && Array.isArray(payload.items)) {
            payload = { ...payload, items: payload.items.filter((it) => { const c = companyOf(it); return !c || allowed.includes(c); }) };
          } else if (Array.isArray(payload)) {
            payload = payload.filter((it) => { const c = companyOf(it); return !c || allowed.includes(c); });
          } else {
            const c = companyOf(payload);
            if (c && !allowed.includes(c)) return res.status(403).json({ error: 'Accès refusé à cette société.' }) && undefined;
          }
        } catch (e) { /* en cas de doute, on laisse passer la réponse telle quelle */ }
        return json(payload);
      };
    }

    next();
  };
}

// Réservé aux administrateurs (gestion des utilisateurs et des groupes).
function requireAdmin(req, res, next) {
  if (!req.perms || !req.perms.isAdmin) {
    return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  }
  next();
}

// Amorçage : à la première exécution, crée le groupe « Administrateurs » (tous droits)
// et y rattache les comptes existants — pour ne jamais se retrouver verrouillé dehors.
async function ensureBootstrap() {
  const count = await Group.countDocuments();
  if (count > 0) return { created: false };
  const admin = await Group.create({
    name: 'Administrateurs',
    description: 'Tous les droits, toutes les sociétés.',
    isAdmin: true,
    allCompanies: true,
    permissions: RESOURCE_KEYS.map((k) => ({ resource: k, level: 'write' })),
  });
  const r = await User.updateMany({}, { $set: { groups: [admin._id] } });
  console.log(`[permissions] amorçage : groupe « Administrateurs » créé, ${r.modifiedCount || 0} compte(s) rattaché(s).`);
  return { created: true, groupId: String(admin._id) };
}

module.exports = { RESOURCES, RESOURCE_KEYS, effectivePermissions, loadPerms, requirePerm, requireAdmin, ensureBootstrap };
