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
      await db.run('INSERT INTO options (poll_id, text) VALUES (?, ?)',[pollId, opt]);
    }

    if (restricted) {
      for (const email of uniqueEmails) {
        await db.run('INSERT OR IGNORE INTO poll_voters_whitelist (poll_id, email) VALUES (?, ?)', [
          pollId,
          email,
        ]);
      }
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
    let allowedToVote = true;
    if (req.user) {
      userVote = await db.get('SELECT option_id FROM votes WHERE poll_id = ? AND user_id = ?', [
        poll.id,
        req.user.id,
      ]);

      if (poll.restricted) {
        const whitelisted = await db.get(
          'SELECT id FROM poll_voters_whitelist WHERE poll_id = ? AND email = ?',
          [poll.id, req.user.email.toLowerCase()]
        );
        allowedToVote = Boolean(whitelisted);
      }
    } else if (poll.restricted) {
      allowedToVote = false;
    }

    let respondents = null;
    let notYetResponded = null;
    const isOwnerOrAdmin = req.user && (req.user.id === poll.created_by || req.user.is_admin);

    if (isOwnerOrAdmin) {
      respondents = await db.all(`
        SELECT u.email, o.text AS chosen_option, v.created_at
        FROM votes v
        JOIN users u ON u.id = v.user_id
        JOIN options o ON o.id = v.option_id
        WHERE v.poll_id = ?
        ORDER BY v.created_at DESC
      `, [poll.id]);

      if (poll.restricted) {
        notYetResponded = await db.all(`
          SELECT w.email FROM poll_voters_whitelist w
          WHERE w.poll_id = ?
          AND w.email NOT IN (
            SELECT u2.email FROM votes v2
            JOIN users u2 ON u2.id = v2.user_id
            WHERE v2.poll_id = ?
          )
          ORDER BY w.email
        `, [poll.id, poll.id]);
      }
    }

    res.render('poll_show', {
      poll,
      options,
      totalVotes,
      userVote,
      allowedToVote,
      respondents,
      notYetResponded,
      error: null,
    });
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

    if (poll.restricted) {
      const whitelisted = await db.get(
        'SELECT id FROM poll_voters_whitelist WHERE poll_id = ? AND email = ?',
        [poll.id, req.user.email.toLowerCase()]
      );
      if (!whitelisted) {
        return res.status(403).render('error', {
          message: "Ce sondage est réservé à une liste de personnes précises, et ton compte n'en fait pas partie.",
        });
      }
    }

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
