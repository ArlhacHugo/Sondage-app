// Ce script crée (ou met à jour) le compte super-administrateur
// à partir des variables d'environnement SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD.
// Il ne contient AUCUN mot de passe en clair : lance-le avec un fichier .env
// correctement rempli (voir .env.example).
//
// Utilisation : npm run init-admin

require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./db');

async function main() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Erreur : SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD doivent être définis dans .env');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Erreur : le mot de passe du super-administrateur doit faire au moins 8 caractères.');
    process.exit(1);
  }

  await db.initSchema();

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);

  if (existing) {
    await db.run('UPDATE users SET password_hash = ?, is_admin = 1, is_superadmin = 1 WHERE id = ?', [
      passwordHash,
      existing.id,
    ]);
    console.log(`Compte super-administrateur mis à jour : ${email}`);
  } else {
    await db.run(
      'INSERT INTO users (email, password_hash, is_admin, is_superadmin) VALUES (?, ?, 1, 1)',
      [email, passwordHash]
    );
    console.log(`Compte super-administrateur créé : ${email}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
