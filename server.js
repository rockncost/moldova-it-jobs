const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend files from /public directory
app.use(express.static(path.join(__dirname, 'public')));

// REST API endpoint serving active, categorized jobs
app.get('/api/jobs', (req, res) => {
  const { search, category } = req.query;

  let query = "SELECT id, title, company, link, source, category, tags, scraped_at FROM jobs WHERE status = 'active'";
  const params = [];

  if (search) {
    query += ' AND (title LIKE ? OR company LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  query += ' ORDER BY scraped_at DESC';

  try {
    const jobs = db.prepare(query).all(...params);
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});