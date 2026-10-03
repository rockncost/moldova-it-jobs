const db = require('./db');

try {
  db.exec(`ALTER TABLE jobs ADD COLUMN status TEXT DEFAULT 'active';`);
  console.log('Migration complete: Added "status" column to jobs table.');
} catch (error) {
  if (error.message.includes('duplicate column name')) {
    console.log('Column "status" already exists.');
  } else {
    console.error('Migration error:', error.message);
  }
}