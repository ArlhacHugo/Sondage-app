require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const db = require('./db');
const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const pollRoutes = require('./routes/polls');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Note : le stockage de session est en mémoire (par défaut). Cela veut dire
// que tout le monde est déconnecté quand le service redémarre (ex : après
// une période d'inactivité sur un hébergement gratuit) — mais aucune donnée
// (comptes, sondages, votes) n'est perdue, puisque celles-ci sont stockées
// dans la base Turso, qui elle est persistante.
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 jours
    httpOnly: true,
    sameSite: 'lax',
    // secure: true // à activer une fois le site servi en HTTPS
  },
}));

app.use(attachUser(db));

app.use('/', authRoutes);
app.use('/', pollRoutes);
app.use('/', adminRoutes);

app.use((req, res) => {
  res.status(404).render('error', { message: 'Page introuvable.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: 'Une erreur est survenue. Réessaie plus tard.' });
});

async function start() {
  await db.initSchema();
  app.listen(PORT, () => {
    console.log(`Serveur de sondages lancé sur http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Échec du démarrage du serveur :', err);
  process.exit(1);
});
