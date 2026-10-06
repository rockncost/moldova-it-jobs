const cron = require('node-cron');
const { refreshJobs } = require('./refresh-jobs');
console.log('Daily job refresh scheduled for 08:00 Europe/Chisinau.');
cron.schedule('0 8 * * *', () => refreshJobs().catch(error => console.error('Daily refresh failed:', error.message)), { timezone: 'Europe/Chisinau', noOverlap: true });
