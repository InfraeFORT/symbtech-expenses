// scripts/seedReferentials.js — alimente Sociétés & Clients (données réelles Symbtech).
// Idempotent : upsert par `code` (sociétés) / `name` (clients). Relançable sans doublon.
// Champs tronqués/illisibles sur les captures laissés vides — à compléter via l'admin.
require('dotenv').config();
const { connectDB, mongoose } = require('../lib/db');
const Company = require('../models/Company');
const Client = require('../models/Client');

const companies = [
  {
    name: 'Symbtech ZA (Pty) Ltd',
    code: 'SYMBTECHZA',
    address1: '9 Lindevista Lane',
    postalCode: '7806',
    city: 'Hout Bay',
    country: 'South Africa',
    regNumber: '2017/524060/07',
    vatNumber: '4870294271',
    bankAccounts: [
      { bankName: 'Wise', swift: 'TRWIBEB1XXX', iban: 'BE60 9670 3216 5970', currency: null },
      { bankName: 'FNB', swift: 'FIRNZAJJ', accountNumber: null, currency: 'ZAR' },
    ],
    paymentMethods: [],
  },
  {
    name: 'Symbtech HC Ltd',
    code: 'SYMBTECHHC',
    address1: 'Boojhawon Lane',
    address2: '1802-03',
    city: 'Upper Dragot',
    country: 'Mauritius',
    regNumber: 'C23203190',
    bankAccounts: [
      { bankName: 'MCB', swift: 'MCBLMUMU', iban: 'MU93 MCBL 0901 0004 5159 7753 000EUR', currency: 'EUR' },
    ],
    paymentMethods: [],
  },
  {
    name: 'Symbiose Software & Solutions',
    code: 'SYMBNS',
    address1: '47 Boulevard Pereire',
    postalCode: '75017',
    city: 'Paris',
    country: 'France',
    bankAccounts: [],
    paymentMethods: [],
  },
];

const clients = [
  {
    name: 'ActingSight',
    onBehalfOf: 'ActingSight',
    contacts: [{ name: 'Mr Nabil AIOUAZ' }],
    address1: '33 rue La Fayette',
    postalCode: '75009',
    city: 'Paris',
    country: 'France',
    regNumber: 'B 829 774 652 RCS de Paris',
  },
  {
    name: 'Symbtech HC Ltd',
    onBehalfOf: 'Symbtech HC Ltd',
    contacts: [{ name: 'Mr Joffrey VITIERE' }, { name: 'Mrs Dhoulaila ASSANI' }],
    address1: 'Boojhawon Lane',
    address2: '1802-03',
    city: 'Upper Dragot',
    country: 'Mauritius',
    regNumber: 'C23203190',
  },
  {
    name: 'Symbtech ZA (Pty) Ltd',
    onBehalfOf: 'Symbtech ZA (Pty) Ltd',
    contacts: [{ name: 'Mr Joffrey VITIERE' }, { name: 'Mrs Dhoulaila ASSANI' }, { name: 'Mr Robert Esterhuyse' }],
    address1: '9 Lindevista Lane',
    postalCode: '7806',
    city: 'Hout Bay',
    country: 'South Africa',
    regNumber: '2017/524060/07',
    vatNumber: '4870294271',
  },
  {
    name: 'MENUIPROS',
    onBehalfOf: 'MENUIPROS',
    address1: '786 rue Moida Said',
    postalCode: '97660',
    city: 'BANDRELE',
    country: 'France',
  },
  {
    name: 'Akula Trading 277 Pty Ltd t/a Chen',
    onBehalfOf: 'Akula Trading 277 Pty Ltd t/a Chen',
    contacts: [{ name: 'Mr Daniel Tenner' }, { name: 'Mrs Biance Bekker' }],
    address1: 'PO Box 5377',
    postalCode: '6065',
    city: 'Port Elizabeth',
    country: 'South Africa',
    vatNumber: '4280280290',
  },
  {
    name: 'Moët Hennessy Diageo France',
    onBehalfOf: 'Moët Hennessy Diageo France',
    contacts: [{ name: 'Mr Emmanuel FOURTON' }],
    address1: '105 Boulevard de la Mission Marchand',
    postalCode: '92400',
    city: 'Courbevoie',
    country: 'France',
  },
  {
    name: 'Moët Hennessy France',
    onBehalfOf: 'Moët Hennessy France',
    address1: '105 Boulevard de la Mission Marchand',
    postalCode: '92400',
    city: 'Courbevoie',
    country: 'France',
  },
  {
    name: 'AGP Groupe - Aliance High Tech',
    onBehalfOf: 'Les Laboratoires Servier',
    address1: '9 Parc Sainte Victoire Route de Valbrillant',
    postalCode: '13590',
    city: 'Meyreuil',
    country: 'France',
    vatNumber: 'FR56478007511',
  },
];

(async () => {
  await connectDB();
  for (const c of companies) {
    await Company.updateOne({ code: c.code }, { $set: c }, { upsert: true });
  }
  for (const c of clients) {
    await Client.updateOne({ name: c.name }, { $set: c }, { upsert: true });
  }
  console.log(`Seed OK : ${companies.length} sociétés, ${clients.length} clients.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('Seed échoué :', err.message);
  process.exit(1);
});
