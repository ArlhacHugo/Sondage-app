const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const router = express.Router();

router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, confirm } = req.body;

    if (!email || !password) {
      return res.render('register', { error: 'Email et mot de passe requis.' });
    }
    if (password.length < 8) {
      return res.render('register', { error: 'Le mot de passe doit faire au moins 8 caractères.' });
    }
    if (password !== confirm) {
      return res.render('register', { error: 'Les mots de passe ne correspondent pas.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing) {
      return res.render('register', { error: 'Un compte existe déjà avec cet email.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const info = await db.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [cleanEmail, hash]);

    req.session.userId = info.lastInsertRowid;
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE email = ?', [(email || '').toLowerCase().trim()]);

    if (!user) {
      return res.render('login', { error: 'Email ou mot de passe incorrect.' });
    }

    const ok = await bcrypt.compare(password || '', user.password_hash);
    if (!ok) {
      return res.render('login', { error: 'Email ou mot de passe incorrect.' });
    }

    req.session.userId = user.id;
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
