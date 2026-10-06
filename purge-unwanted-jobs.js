// Preserve listings for inspection. Exclusions are reversible classifications.
const { runAnalysisPipeline } = require('./pipeline-analyze');
runAnalysisPipeline();
console.log('Unwanted jobs have been marked excluded. No rows were deleted.');
