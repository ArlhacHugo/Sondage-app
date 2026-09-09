function attachUser(db) {
  return async (req, res, next) => {
    try {
      if (req.session.userId) {
        const user = await db.get(
          'SELECT id, email, is_admin, is_superadmin FROM users WHERE id = ?',
          [req.session.userId]
        );
        req.user = user || null;
        if (!user) req.session.destroy(() => {});
      } else {
        req.user = null;
      }
      res.locals.currentUser = req.user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).render('error', { message: "Accès refusé : réservé aux administrateurs." });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || !req.user.is_superadmin) {
    return res.status(403).render('error', { message: "Accès refusé : réservé au super-administrateur." });
  }
  next();
}

module.exports = { attachUser, requireAuth, requireAdmin, requireSuperAdmin };
