app.get('/api/jobs', (req, res) => {
  const { search, category } = req.query;

  // Only serve active, non-excluded listings
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