const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

async function loadDashboardData() {
  const users = await db.all(
    'SELECT id, email, is_admin, is_superadmin, created_at FROM users ORDER BY created_at DESC'
  );
  const polls = await db.all(`
    SELECT p.id, p.question, p.created_at, u.email AS author
    FROM polls p JOIN users u ON u.id = p.created_by
    ORDER BY p.created_at DESC
  `);
  return { users, polls };
}

// Tableau de bord admin : liste des comptes et des sondages
router.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const { users, polls } = await loadDashboardData();
    res.render('admin', { users, polls, error: null, success: null });
  } catch (err) {
    next(err);
  }
});

// Le super-admin ajoute un nouvel administrateur (nouveau compte, ou promotion d'un compte existant)
router.post('/admin/admins', requireSuperAdmin, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      const { users, polls } = await loadDashboardData();
      return res.render('admin', { users, polls, error: 'Email requis.', success: null });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [cleanEmail]);

    if (existing) {
      await db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [existing.id]);
    } else {
      if (!password || password.length < 8) {
        const { users, polls } = await loadDashboardData();
        return res.render('admin', {
          users,
          polls,
          error: "Mot de passe d'au moins 8 caractères requis pour créer un nouveau compte.",
          success: null,
        });
      }
      const hash = await bcrypt.hash(password, 12);
      await db.run('INSERT INTO users (email, password_hash, is_admin) VALUES (?, ?, 1)', [cleanEmail, hash]);
    }

    const { users, polls } = await loadDashboardData();
    res.render('admin', { users, polls, error: null, success: `Administrateur ajouté : ${cleanEmail}` });
  } catch (err) {
    next(err);
  }
});

// Supprimer un compte (admin)
router.post('/admin/users/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const target = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!target) return res.redirect('/admin');

    // Un admin normal ne peut pas supprimer le super-admin
    if (target.is_superadmin && !req.user.is_superadmin) {
      return res.status(403).render('error', { message: 'Seul le super-administrateur peut supprimer ce compte.' });
    }
    // Personne ne peut se supprimer soi-même par ce formulaire
    if (target.id === req.user.id) {
      return res.status(400).render('error', { message: 'Vous ne pouvez pas supprimer votre propre compte ici.' });
    }

    await db.run('DELETE FROM users WHERE id = ?', [target.id]);
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

// Supprimer un sondage (admin)
router.post('/admin/polls/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    await db.run('DELETE FROM polls WHERE id = ?', [req.params.id]);
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
