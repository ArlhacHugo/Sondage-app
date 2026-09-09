const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Liste de tous les sondages
router.get('/', async (req, res, next) => {
  try {
    const polls = await db.all(`
      SELECT p.id, p.question, p.created_at, u.email AS author,
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

    if (!question || !question.trim()) {
      return res.render('poll_new', { error: 'La question est obligatoire.' });
    }

    if (!Array.isArray(options)) options = [options];
    options = options.map((o) => (o || '').trim()).filter(Boolean);

    if (options.length < 2) {
      return res.render('poll_new', { error: 'Il faut au moins 2 options.' });
    }

    const info = await db.run('INSERT INTO polls (question, created_by) VALUES (?, ?)', [
      question.trim(),
      req.user.id,
    ]);
    const pollId = info.lastInsertRowid;

    for (const opt of options) {
      await db.run('INSERT INTO options (poll_id, text) VALUES (?, ?)', [pollId, opt]);
    }

    res.redirect(`/polls/${pollId}`);
  } catch (err) {
    next(err);
  }
});

// Affichage d'un sondage + résultats
router.get('/polls/:id', async (req, res, next) => {
  try {
    const poll = await db.get(`
      SELECT p.*, u.email AS author FROM polls p
      JOIN users u ON u.id = p.created_by
      WHERE p.id = ?
    `, [req.params.id]);

    if (!poll) return res.status(404).render('error', { message: 'Sondage introuvable.' });

    const options = await db.all(`
      SELECT o.id, o.text,
        (SELECT COUNT(*) FROM votes v WHERE v.option_id = o.id) AS votes
      FROM options o WHERE o.poll_id = ?
    `, [poll.id]);

    const totalVotes = options.reduce((sum, o) => sum + Number(o.votes), 0);

    let userVote = null;
    if (req.user) {
      userVote = await db.get('SELECT option_id FROM votes WHERE poll_id = ? AND user_id = ?', [
        poll.id,
        req.user.id,
      ]);
    }

    res.render('poll_show', { poll, options, totalVotes, userVote, error: null });
  } catch (err) {
    next(err);
  }
});

// Voter
router.post('/polls/:id/vote', requireAuth, async (req, res, next) => {
  try {
    const { option_id } = req.body;
    const poll = await db.get('SELECT * FROM polls WHERE id = ?', [req.params.id]);
    if (!poll) return res.status(404).render('error', { message: 'Sondage introuvable.' });

    const option = await db.get('SELECT * FROM options WHERE id = ? AND poll_id = ?', [option_id, poll.id]);
    if (!option) return res.status(400).render('error', { message: 'Option invalide.' });

    const already = await db.get('SELECT id FROM votes WHERE poll_id = ? AND user_id = ?', [
      poll.id,
      req.user.id,
    ]);
    if (already) {
      return res.redirect(`/polls/${poll.id}`);
    }

    await db.run('INSERT INTO votes (poll_id, option_id, user_id) VALUES (?, ?, ?)', [
      poll.id,
      option_id,
      req.user.id,
    ]);

    res.redirect(`/polls/${poll.id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
