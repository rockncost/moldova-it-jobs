const db = require('./db');
const { extractSections } = require('./lib/section-extractor');
const { evaluateJob, ANALYSIS_VERSION } = require('./lib/scoring-engine');
const { cleanStoredDescription, validCompany } = require('./lib/job-extractor');
const { normalize } = require('./lib/text');

function runAnalysisPipeline(database = db, { onlyPending = false, quiet = false } = {}) {
  const jobs = database.prepare(`SELECT * FROM jobs ${onlyPending ? 'WHERE analysis_version <> ? OR analyzed_at IS NULL' : ''}`).all(...(onlyPending ? [ANALYSIS_VERSION] : []));
  const update = database.prepare(`UPDATE jobs SET raw_description = COALESCE(raw_description, description),
    description = @description, description_quality = @quality, company = @company,
    responsibilities_text = @resp, requirements_text = @req,
    exposure_score = @exposureScore, category = @category, tags = @tags,
    quality_flags = @qualityFlags, entry_fit = @entryFit, fit_score = @fitScore,
    experience_min = @experienceMin, payment_status = @paymentStatus, reasons = @reasons,
    exclusion_reason = @exclusionReason, status = @status, location = @location,
    analyzed_at = @now, analysis_version = @version WHERE id = @id`);
  const counts = { beginner: 0, stretch: 0, review: 0, excluded: 0 };
  const start = Date.now();
  database.transaction(() => {
    for (const job of jobs) {
      const cleaned = cleanStoredDescription(job);
      const sections = extractSections(cleaned.text);
      const location = job.location || (/chisinau|кишинев/u.test(normalize(cleaned.text)) ? 'Chișinău' : '');
      const evaluation = evaluateJob(job.title, sections, { ...job, location, description_quality: cleaned.quality });
      update.run({ ...evaluation, id: job.id, description: cleaned.text || null, quality: cleaned.quality,
        company: validCompany(job.company) || 'N/A', location, resp: sections.responsibilities,
        req: sections.requirements, now: new Date().toISOString(), version: ANALYSIS_VERSION });
      counts[evaluation.entryFit]++;
    }
  })();
  if (!quiet) console.log(`Analyzed ${jobs.length} jobs in ${Date.now() - start}ms: ${JSON.stringify(counts)}`);
  return counts;
}

if (require.main === module) runAnalysisPipeline();
module.exports = { runAnalysisPipeline };
