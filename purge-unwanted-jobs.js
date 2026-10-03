const db = require('./db');

function purgeUnwantedJobs() {
  // Regex targeting international relocation, paid courses/fees, or unwanted agency programs
  const purgeRegex = /germany|germania|iaw|icg engineering|baden-württemberg|onboarding in germany|curs contra cost|contra cost|taxă de instruire|taxa de instruire/i;

  const allJobs = db.prepare('SELECT id, title, company, description, link FROM jobs').all();
  const deleteJob = db.prepare('DELETE FROM jobs WHERE id = ?');

  let purgedCount = 0;

  for (const job of allJobs) {
    const combinedText = `${job.title} ${job.company} ${job.description || ''} ${job.link}`;

    if (purgeRegex.test(combinedText)) {
      deleteJob.run(job.id);
      purgedCount++;
      console.log(`[PURGED] ID ${job.id}: "${job.title}" (${job.company})`);
    }
  }

  console.log(`\nPurge complete! Removed ${purgedCount} unwanted listings from database.`);
}

purgeUnwantedJobs();