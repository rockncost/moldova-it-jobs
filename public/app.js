const jobList = document.getElementById('jobList');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');

async function fetchJobs() {
  const search = searchInput.value.trim();
  const category = categoryFilter.value;

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (category) params.append('category', category);

  try {
    const response = await fetch(`/api/jobs?${params.toString()}`);
    const jobs = await response.json();

    renderJobs(jobs);
  } catch (error) {
    jobList.innerHTML = `<p style="color: red;">Failed to load jobs: ${error.message}</p>`;
  }
}

function renderJobs(jobs) {
  if (jobs.length === 0) {
    jobList.innerHTML = '<p>No matching entry-level IT jobs found.</p>';
    return;
  }

  jobList.innerHTML = jobs
    .map((job) => {
      let tagsHtml = '';
      try {
        const tagsArray = JSON.parse(job.tags || '[]');
        tagsHtml = tagsArray
          .map((tag) => `<span class="badge badge-tag">${tag}</span>`)
          .join('');
      } catch (e) {
        tagsHtml = '';
      }

      return `
        <div class="job-card">
          <h2 class="job-title"><a href="${job.link}" target="_blank" rel="noopener">${job.title}</a></h2>
          <div class="job-meta">
            <strong>${job.company || 'N/A'}</strong> &bull; Scraped from ${job.source}
          </div>
          <div>
            <span class="badge badge-category">${job.category || 'General IT'}</span>
            <span class="badge badge-source">${job.source}</span>
            ${tagsHtml}
          </div>
        </div>
      `;
    })
    .join('');
}

// Event listeners for instant filtering
searchInput.addEventListener('input', fetchJobs);
categoryFilter.addEventListener('change', fetchJobs);

// Initial load
fetchJobs();