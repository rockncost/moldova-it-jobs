const path = require('node:path');
const Database = require('better-sqlite3');

function initializeDatabase(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
    company TEXT DEFAULT 'N/A', link TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL, scraped_at TEXT NOT NULL
  )`);
  const columns = {
    description: 'TEXT', category: "TEXT DEFAULT 'General IT'", tags: "TEXT DEFAULT '[]'",
    status: "TEXT DEFAULT 'active'", responsibilities_text: 'TEXT', requirements_text: 'TEXT',
    exposure_score: 'REAL DEFAULT 0', quality_flags: "TEXT DEFAULT '[]'",
    raw_description: 'TEXT', description_quality: "TEXT DEFAULT 'unverified'",
    location: 'TEXT', work_mode: 'TEXT', schedule: 'TEXT', salary: 'TEXT',
    source_metadata: "TEXT DEFAULT '{}'", last_seen_at: 'TEXT', detail_checked_at: 'TEXT',
    detail_error: 'TEXT', availability: "TEXT DEFAULT 'unknown'", entry_fit: "TEXT DEFAULT 'review'", fit_score: 'INTEGER DEFAULT 0',
    experience_min: 'REAL', payment_status: "TEXT DEFAULT 'unknown'",
    reasons: "TEXT DEFAULT '[]'", exclusion_reason: 'TEXT',
    analyzed_at: 'TEXT', analysis_version: 'INTEGER DEFAULT 0',
  };
  const existing = new Set(db.prepare('PRAGMA table_info(jobs)').all().map(c => c.name));
  db.transaction(() => {
    for (const [name, definition] of Object.entries(columns)) {
      if (!existing.has(name)) db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${definition}`);
    }
    db.exec('CREATE INDEX IF NOT EXISTS jobs_fit ON jobs(status, entry_fit, category)');
  })();
  return db;
}

const db = initializeDatabase(new Database(process.env.JOBS_DB_PATH || path.join(__dirname, 'jobs.db')));
module.exports = db;
module.exports.initializeDatabase = initializeDatabase;
