const express = require('express');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve static frontend files from the 'public' folder
app.use(express.static('public'));

// API Endpoint: GET /api/jobs
app.get('/api/jobs', (req, res) => {
  try {
    const { search } = req.query;

    let query = 'SELECT * FROM jobs ORDER BY id DESC';
    let jobs;

    if (search) {
      query = 'SELECT * FROM jobs WHERE title LIKE ? OR company LIKE ? ORDER BY id DESC';
      const searchPattern = `%${search}%`;
      jobs = db.prepare(query).all(searchPattern, searchPattern);
    } else {
      jobs = db.prepare(query).all();
    }

    res.json({
      success: true,
      count: jobs.length,
      data: jobs,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});