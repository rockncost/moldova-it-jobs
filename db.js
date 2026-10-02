const Database = require('better-sqlite3');

// Open or create SQLite database file
const db = new Database('jobs.db');

// Create jobs table
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    company TEXT DEFAULT 'N/A',
    link TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    scraped_at TEXT NOT NULL
  )
`);

module.exports = db;