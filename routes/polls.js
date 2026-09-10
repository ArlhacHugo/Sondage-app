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
    const title = req.body.question;
    const restricted = req.body.restricted === 'on';
    const emailsRaw = req.body.emails || '';
    let questionsInput = req.body.questions;

    if (!title || !title.trim()) {
      return res.render('poll_new', { error: 'Le titre du sondage est obligatoire.' });
    }

    if (!questionsInput) questionsInput = [];
    if (!Array.isArray(questionsInput)) questionsInput = Object.values(questionsInput);

    const cleanedQuestions = [];
    for (const q of questionsInput) {
      if (!q) continue;
      const text = (q.text || '').trim();
      let opts = q.options;
      if (!opts) opts = [];
      if (!Array.isArray(opts)) opts = Object.values(opts);
      opts = opts.map((o) => (o || '').trim()).filter(Boolean);
      if (text && opts.length >= 2) {
        cleanedQuestions.push({ text, options: opts });
      }
    }

    if (cleanedQuestions.length === 0) {
      return res.render('poll_new', {
        error: 'Ajoute au moins une question avec 2 options ou plus.',
      });
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
      [title.trim(), req.user.id, restricted ? 1 : 0]
    );
    const pollId = info.lastInsertRowid;

    let position = 0;
    for (const q of cleanedQuestions) {
      const qInfo = await db.run(
        'INSERT INTO questions (poll_id, text, position) VALUES (?, ?, ?)',
        [pollId, q.text, position]
      );
      const questionId = qInfo.lastInsertRowid;
      for (const opt of q.options) {
        await db.run('INSERT INTO options (question_id, text) VALUES (?, ?)', [questionId, opt]);
      }
      position += 1;
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

// Affichage d'un sondage + résultats (une ou plusieurs questions)
router.get('/polls/:id', async (req, res, next) => {
  try {
    const poll = await db.get(`
      SELECT p.*, u.email AS author FROM polls p
      JOIN users u ON u.id = p.created_by
      WHERE p.id = ?
    `, [req.params.id]);

    if (!poll) return res.status(404).render('error', { message: 'Sondage introuvable.' });

    const questions = await db.all('SELECT * FROM questions WHERE poll_id = ? ORDER BY position, id', [poll.id]);

    for (const q of questions) {
      q.options = await db.all(`
        SELECT o.id, o.text,
          (SELECT COUNT(*) FROM votes v WHERE v.option_id = o.id) AS votes
        FROM options o WHERE o.question_id = ?
      `, [q.id]);
      q.totalVotes = q.options.reduce((sum, o) => sum + Number(o.votes), 0);
    }

    let allowedToVote = true;
    let answeredQuestionIds = new Set();
    if (req.user) {
      const myVotes = await db.all('SELECT question_id FROM votes WHERE poll_id = ? AND user_id = ?', [
        poll.id,
        req.user.id,
      ]);
      answeredQuestionIds = new Set(myVotes.map((v) => v.question_id));

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

    for (const q of questions) {
      q.userAnswered = answeredQuestionIds.has(q.id);
    }

    let respondents = null;
    let notYetResponded = null;
    const isOwnerOrAdmin = req.user && (req.user.id === poll.created_by || req.user.is_admin);

    if (isOwnerOrAdmin) {
      respondents = await db.all(`
        SELECT u.email, COUNT(DISTINCT v.question_id) AS answered_count, MAX(v.created_at) AS last_answer
        FROM votes v
        JOIN users u ON u.id = v.user_id
        WHERE v.poll_id = ?
        GROUP BY u.email
        ORDER BY last_answer DESC
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
      questions,
      allowedToVote,
      respondents,
      notYetResponded,
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

// Voter (une ou plusieurs questions en une seule fois)
router.post('/polls/:id/vote', requireAuth, async (req, res, next) => {
  try {
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

    const answers = req.body.answers || {};
    const questions = await db.all('SELECT id FROM questions WHERE poll_id = ?', [poll.id]);
    const validQuestionIds = new Set(questions.map((q) => q.id));

    for (const [questionIdStr, optionId] of Object.entries(answers)) {
      const questionId = Number(questionIdStr);
      if (!validQuestionIds.has(questionId) || !optionId) continue;

      const option = await db.get('SELECT * FROM options WHERE id = ? AND question_id = ?', [optionId, questionId]);
      if (!option) continue;

      if (!req.user.is_admin) {
        const already = await db.get('SELECT id FROM votes WHERE question_id = ? AND user_id = ?', [
          questionId,
          req.user.id,
        ]);
        if (already) continue;
      }

      await db.run('INSERT INTO votes (poll_id, question_id, option_id, user_id) VALUES (?, ?, ?, ?)', [
        poll.id,
        questionId,
        optionId,
        req.user.id,
      ]);
    }

    res.redirect(`/polls/${poll.id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
