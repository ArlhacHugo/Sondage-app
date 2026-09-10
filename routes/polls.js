const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Liste de tous les sondages
router.get('/', async (req, res, next) => {
  try {
    const polls = await db.all(`
      SELECT p.id, p.question, p.created_at, p.restricted, u.email AS author,
        (SELECT COUNT(*) FROM votes v WHERE v.poll_id = p.id) AS vote_count
      FROM polls p
      JOIN users u ON u.id = p.created_by
      ORDER BY p.created_at DESC
    `);
    res.render('index', { polls });
  } catch (err) {
    next(err);
  }
});

// Formulaire de création
router.get('/polls/new', requireAuth, (req, res) => {
  res.render('poll_new', { error: null });
});

router.post('/polls', requireAuth, async (req, res, next) => {
  try {
    const { question } = req.body;
    let options = req.body.options;
    const restricted = req.body.restricted === 'on';
    const emailsRaw = req.body.emails || '';

    if (!question || !question.trim()) {
      return res.render('poll_new', { error: 'La question est obligatoire.' });
    }

    if (!Array.isArray(options)) options = [options];
    options = options.map((o) => (o || '').trim()).filter(Boolean);

    if (options.length < 2) {
      return res.render('poll_new', { error: 'Il faut au moins 2 options.' });
    }

    const emails = emailsRaw
      .split(/[\n,]/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const uniqueEmails = [...new Set(emails)];

    if (restricted && uniqueEmails.length === 0) {
      return res.render('poll_new', {
        error: 'Ajoute au moins un email pour restreindre le sondage à une liste de personnes.',
      });
    }

    const info = await db.run(
      'INSERT INTO polls (question, created_by, restricted) VALUES (?, ?, ?)',
      [question.trim(), req.user.id, restricted ? 1 : 0]
    );
    const pollId = info.lastInsertRowid;

    for (const opt of options) {
      await db.run('INSERT INTO options (poll_id, text) VALUES (?, ?)',
