const db = require('./db');
const { extractSections } = require('./lib/section-extractor');
const { evaluateJob } = require('./lib/scoring-engine');

function runAnalysisPipeline() {
  const jobs = db.prepare('SELECT id, title, description FROM jobs WHERE description IS NOT NULL').all();

  console.log(`Running Section-Aware Scoring Engine across ${jobs.length} stored jobs...\n`);

  const updateStmt = db.prepare(`
    UPDATE jobs
    SET responsibilities_text = @resp,
        requirements_text = @req,
        exposure_score = @exposureScore,
        category = @category,
        tags = @tags,
        quality_flags = @qualityFlags
    WHERE id = @id
  `);

  let processedCount = 0;

  const startTime = Date.now();

  for (const job of jobs) {
    const sections = extractSections(job.description);
    const evaluation = evaluateJob(job.title, sections);

    updateStmt.run({
      id: job.id,
      resp: sections.responsibilities,
      req: sections.requirements,
      exposureScore: evaluation.exposureScore,
      category: evaluation.category,
      tags: evaluation.tags,
      qualityFlags: evaluation.qualityFlags,
    });

    processedCount++;
  }

  const duration = Date.now() - startTime;
  console.log(`Analysis complete! Processed ${processedCount} jobs in ${duration}ms.`);
}

runAnalysisPipeline();