// server.js — micro-service dépenses (instance dédiée Symbtech, séparée d'e-FORT).
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const expensesRouter = require('./routes/expenses');
const authRouter = require('./routes/auth');
const { companies: companiesRouter, clients: clientsRouter, suppliers: suppliersRouter, products: productsRouter, contracts: contractsRouter, avenants: avenantsRouter, orders: ordersRouter } = require('./routes/referentials');
const bankRouter = require('./routes/bank');
const invoicesRouter = require('./routes/invoices');
const quotesRouter = require('./routes/quotes');
const craRouter = require('./routes/cra');
const accountingRouter = require('./routes/accounting');
const ledgerRouter = require('./routes/ledger');
const payslipsRouter = require('./routes/payslips');
const simulationsRouter = require('./routes/simulations');
const { connectDB } = require('./lib/db');
const { authRequired } = require('./lib/auth');

const app = express();

// CORS : l'appli web d'admin (navigateur) appelle l'API depuis un autre domaine.
// CORS_ORIGINS = liste blanche séparée par des virgules ; vide = tout autorisé
// (l'API reste protégée par JWT, token via header Authorization, pas de cookie).
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : {}));

app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'symbtech-expenses-ocr' }));
app.use('/auth', authRouter);
app.use('/expenses', authRequired, expensesRouter);
app.use('/companies', authRequired, companiesRouter);
app.use('/clients', authRequired, clientsRouter);
app.use('/suppliers', authRequired, suppliersRouter);
app.use('/products', authRequired, productsRouter);
app.use('/contracts', authRequired, contractsRouter);
app.use('/avenants', authRequired, avenantsRouter);
app.use('/orders', authRequired, ordersRouter);
app.use('/bank', authRequired, bankRouter);
app.use('/invoices', authRequired, invoicesRouter);
app.use('/quotes', authRequired, quotesRouter);
app.use('/cra', authRequired, craRouter);
app.use('/accounting', authRequired, accountingRouter);
app.use('/ledger', authRequired, ledgerRouter);
app.use('/payslips', authRequired, payslipsRouter);
app.use('/simulations', authRequired, simulationsRouter);

const PORT = process.env.PORT || 4000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('⚠  ANTHROPIC_API_KEY absent — /expenses/ocr renverra une erreur tant qu\'il n\'est pas défini.');
}
if (!process.env.JWT_SECRET) {
  console.warn('⚠  JWT_SECRET absent — l\'authentification ne fonctionnera pas tant qu\'il n\'est pas défini.');
}

// Tentative de connexion au démarrage : pratique pour repérer un souci de suite,
// mais NON bloquante — le serveur démarre quand même (la route OCR n'a pas besoin
// de la base, et les routes base réessaient la connexion au vol).
connectDB().catch((err) =>
  console.warn('⚠  MongoDB non connecté au démarrage :', err.message)
);

app.listen(PORT, () => console.log(`Service dépenses en écoute sur :${PORT}`));
