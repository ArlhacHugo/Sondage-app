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

async function get(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows[0] || null;
}

async function all(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows;
}

async function run(sql, args = []) {
  const result = await client.execute({ sql, args });
  return {
    lastInsertRowid: result.lastInsertRowid !== undefined
      ? Number(result.lastInsertRowid)
      : undefined,
    changes: result.rowsAffected,
  };
}

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
      restricted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
      FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS poll_voters_whitelist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(poll_id, email),
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
    )`,
  ];

  for (const sql of statements) {
    await client.execute(sql);
  }

  try {
    await client.execute('ALTER TABLE polls ADD COLUMN restricted INTEGER NOT NULL DEFAULT 0');
  } catch (err) {
    // La colonne existe déjà.
  }

  try {
    const votesInfo = await client.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='votes'"
    );
    const votesSql = votesInfo.rows[0] && votesInfo.rows[0].sql;
    if (votesSql && votesSql.includes('UNIQUE')) {
      await client.execute('ALTER TABLE votes RENAME TO votes_old');
      await client.execute(`CREATE TABLE votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poll_id INTEGER NOT NULL,
        option_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
        FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
      await client.execute(
        'INSERT INTO votes (id, poll_id, option_id, user_id, created_at) SELECT id, poll_id, option_id, user_id, created_at FROM votes_old'
      );
      await client.execute('DROP TABLE votes_old');
    }
  } catch (err) {
    // Migration best-effort.
  }

  try {
    await client.execute(`
      INSERT INTO questions (poll_id, text, position)
      SELECT id, question, 0 FROM polls
      WHERE id NOT IN (SELECT poll_id FROM questions)
    `);
  } catch (err) {
    // Migration best-effort.
  }

  try {
    const optionsInfo = await client.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='options'"
    );
    const optionsSql = optionsInfo.rows[0] && optionsInfo.rows[0].sql;
    if (optionsSql && optionsSql.includes('poll_id')) {
      await client.execute('ALTER TABLE options RENAME TO options_old');
      await client.execute(`CREATE TABLE options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
      )`);
      await client.execute(`
        INSERT INTO options (id, question_id, text)
        SELECT o.id, q.id, o.text
        FROM options_old o
        JOIN questions q ON q.poll_id = o.poll_id AND q.position = 0
      `);
      await client.execute('DROP TABLE options_old');
    }
  } catch (err) {
    // Migration best-effort.
  }

  try {
    await client.execute('ALTER TABLE votes ADD COLUMN question_id INTEGER');
  } catch (err) {
    // La colonne existe déjà.
  }
  try {
    await client.execute(`
      UPDATE votes SET question_id = (
        SELECT question_id FROM options WHERE options.id = votes.option_id
      ) WHERE question_id IS NULL
    `);
  } catch (err) {
    // Migration best-effort.
  }
}

module.exports = { client, get, all, run, initSchema };
