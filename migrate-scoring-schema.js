const db = require('./db');

try {
  db.exec(`
    ALTER TABLE jobs ADD COLUMN responsibilities_text TEXT;
    ALTER TABLE jobs ADD COLUMN requirements_text TEXT;
    ALTER TABLE jobs ADD COLUMN exposure_score REAL DEFAULT 0.0;
    ALTER TABLE jobs ADD COLUMN quality_flags TEXT;
  `);
  console.log('Database migration complete: Added section text, exposure_score, and quality_flags columns.');
} catch (error) {
  if (error.message.includes('duplicate column name')) {
    console.log('Columns already exist in schema.');
  } else {
    console.error('Migration error:', error.message);
  }
}