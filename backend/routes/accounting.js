// routes/accounting.js — référentiel des normes comptables.
const express = require('express');
const { STANDARDS, suggestedFor } = require('../lib/accounting');

const router = express.Router();

// GET /accounting/standards?country=France
// → { standards: [...], suggested: ['PCG','IFRS'] }
router.get('/standards', (req, res) => {
  res.json({ standards: STANDARDS, suggested: suggestedFor(req.query.country || '') });
});

module.exports = router;
