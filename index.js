const { createClient } = require('@libsql/client');

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error(
    'Erreur : TURSO_DATABASE_URL et TURSO_AUTH_TOKEN doivent être définis (voir .env.example).'
  );
  process.exit(1);
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// --- Petits helpers pour garder des appels simples partout ailleurs ---

// Une seule ligne (ou null)
async function get(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows[0] || null;
}

// Plusieurs lignes
async function all(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows;
}

// INSERT / UPDATE / DELETE
async function run(sql, args = []) {
  const result = await client.execute({ sql, args });
  return {
    lastInsertRowid: result.lastInsertRowid !== undefined
      ? Number(result.lastInsertRowid)
      : undefined,
    changes: result.rowsAffected,
  };
}

// --- Création des tables si elles n'existent pas ---
async function initSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_superadmin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(poll_id, user_id),
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
      FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  ];

  for (const sql of statements) {
    await client.execute(sql);
  }
}

module.exports = { client, get, all, run, initSchema };
