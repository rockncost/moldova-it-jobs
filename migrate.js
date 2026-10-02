const db = require('./db');

try {
  // Add new columns to jobs table if they don't already exist
  db.exec(`
    ALTER TABLE jobs ADD COLUMN description TEXT;
    ALTER TABLE jobs ADD COLUMN category TEXT DEFAULT 'General IT';
    ALTER TABLE jobs ADD COLUMN tags TEXT;
  `);
  console.log('Database migration complete: Added description, category, and tags columns.');
} catch (error) {
  if (error.message.includes('duplicate column name')) {
    console.log('Columns already exist. Schema is up to date.');
  } else {
    console.error('Migration error:', error.message);
  }
}