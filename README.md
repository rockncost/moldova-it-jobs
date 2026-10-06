# First Step — Chișinău IT jobs

Local aggregation and transparent beginner eligibility rules for Rabota.md, Delucru.md and Lucru.md. No LLM, model download, GPU or API key is used. Romanian, Russian and English analysis runs in JavaScript on the same computer as the website.

## Run

Use Node.js 24 and run these commands from this project directory:

```sh
npm install
npm run refresh
npm start
```

Open http://localhost:3000. `npm start` runs the server and an in-process 08:00 Europe/Chisinau scheduler. `npm run serve` runs only the website. A Windows Task Scheduler task, **Moldova IT Jobs - Daily Refresh**, is installed at 08:00 local time for the current user, independently of the website. It catches up missed runs while the user is signed in; the computer must be on and online. The task does not wake the computer or run while the user is signed out. Database locking prevents overlapping refreshes from the Windows task, manual commands and the in-process scheduler.

To install/update that task on another Windows computer, run `./scripts/install-refresh-task.ps1` in PowerShell. To remove it, run `./scripts/install-refresh-task.ps1 -Remove`. It uses the installed Node executable and this checkout's absolute path; reinstall after moving the project or Node. Inspect its next run/result in Windows Task Scheduler.

`npm run refresh` reads up to five listing pages per configured search, stopping at pagination ends, then fetches up to 100 due detail pages per board. It reads the IT category plus dedicated internship and junior searches on Rabota/Lucru and internship, no-experience and entry-level searches on Delucru. Sources run independently; failures preserve saved details and do not stop other boards. Requests have timeouts and delays. `node refresh-jobs.js --pages=3 --details=50` limits pages per search and detail checks per board. Older than seven days, missing/unverified details and unresolved failures enter the queue, ordered by oldest attempt with active adverts first. Null/invalid dates are due, ISO dates use Julian-day comparisons, and failed attempts have a six-hour backoff. Closed adverts seen again on a listing page enter the recheck queue; seeing them alone never reopens them. `node enrich-jobs.js --retry-failed` immediately retries only failed details, and `--force` rechecks all saved details subject to its batch limit. `npm run analyze` applies rules offline; `npm test` runs offline regression and API tests.

The **Source refresh status** panel shows the last run per board, successful detail checks, closures, errors and unresolved/stale advert counts. Cards warn about failed or overdue checks. `/api/refresh-status` exposes the same information. SQLite stores refresh runs and per-source results across restarts; abandoned run locks are recovered after two hours. A partial/failed CLI refresh returns a nonzero exit status for scheduler monitoring.

Closed adverts include HTTP 404/410, explicit Romanian/Russian/English closure notices on normal HTTP-200 pages and expired structured JobPosting deadlines. Hidden error templates, navigation and related-job blocks do not supply closure evidence. Redirects away from the original vacancy, extraction failures, access blocks and temporary HTTP errors preserve the snapshot and report uncertainty. No advert is deleted.

`npm run audit:coverage` compares saved board vacancy IDs against up to five pages of each dedicated internship/beginner search, recording visible, stored/excluded and missing title candidates. See [the coverage audit](docs/coverage-audit.md) and [the comparison before refresh](docs/coverage-before-refresh.md). These are bounded samples of title candidates, not a claim of complete market coverage; excluded unpaid/foreign-onboarding adverts are kept separate from scraper gaps.

`npm run audit` checks 51 independently labelled saved adverts and regenerates [the classification audit](docs/classification-audit-2026-10-06.md). The audit covers every initial beginner card plus selected Other/excluded adverts; it is not a market-wide accuracy estimate.

The SQLite file lives beside `db.js`, regardless of your shell's working directory. Schema updates are automatic and idempotent. Optional environment variables are `PORT` and `JOBS_DB_PATH`. Before modifying an important database, make a backup while the application is stopped or use SQLite's backup API (include its WAL if copying files while running).

## What changed

The browser and server scoring files had been swapped, crashing both. The old scraper also used full-page body text, company articles and social links as vacancy details, while competing classifiers assigned contradictory categories and tags.

The extraction code now isolates the actual vacancy block, retains paragraph and list boundaries, and takes employer and location information from vacancy metadata. It never falls back to the whole page. Old contaminated text is preserved in `raw_description`; clean details replace the text used for analysis. All analysis entry points now use the same engine. Exclusions are reversible and no database rows are deleted. HTTP 404/410 vacancy pages are excluded; transient failures preserve the previous detail snapshot.

## Categories and beginner eligibility

Categories describe work, not seniority. Titles take priority, with actual duties used when titles are unclear. Infrastructure no longer counts as software development; ordinary call-centre work needs technical duties to qualify. Digital roles are included as adjacent routes into tech.

| Category | Examples |
| --- | --- |
| Software Development | Junior developer, programmer |
| QA & Testing | Manual tester, QA trainee |
| IT Support & Helpdesk | Technical support, service desk |
| Systems & Networks | Junior sysadmin, Linux, DevOps |
| Data & Analytics | Analyst, business intelligence |
| Data Entry & Operations | CRM validation, data entry |
| Web Content & E-commerce | WordPress, product catalogue, CMS |
| Marketing & Web Tech | SEO, SMM, digital marketing |
| Design & UX | Junior UI/UX, graphic/web designer |
| Product & Project Assistance | Product trainee, digital project assistant |
| Cybersecurity & Monitoring | Junior SOC/security analyst |
| IT Internships | General IT internship spanning multiple domains |
| General IT | Unclear IT role needing closer inspection |

- **Beginner matches:** explicit junior, no-experience, internship or student signals, sufficient vacancy details and a local workplace, without detected mandatory experience or degree barriers. This is evidence from an advert, not a probability of hiring.
- **Stretch roles:** a stated experience minimum above zero and below two years, with sufficient details and no other detected eligibility barrier. A junior title is not necessary. Projects or internships may help; the employer decides what counts.
- **Needs checking:** beginner adverts with a specific obstacle: unclear experience, a completed degree, advanced skills, conflicting experience claims, mixed junior/middle seniority, unconfirmed location or details, or internship pay described only for later employment. Filter these by experience/skills, degrees, internship pay or missing details.
- **Other roles:** relevant IT/digital adverts without explicit beginner acceptance. These remain searchable separately without crowding the beginner and review views.
- **Excluded:** mandatory experience of at least two years, senior roles, unrelated work, courses/applicant training fees, explicitly unpaid work, mandatory relocation or foreign onboarding, workplaces outside Chișinău unless Moldova-accessible remote work is stated, or closed vacancy pages.

Optional experience, company age, training duration and zero-to-two-year ranges do not become mandatory experience. Literal punctuation in C#, C++, .NET and Unicode word boundaries is handled explicitly.

Tags cover stated no-experience/student acceptance, internships, employer training, languages (required versus preferred), degree alternatives, shifts, driving licence, part-time/remote/hybrid/flexible work and technology skills. A junior title never implies part-time work or no degree requirement. A reference to free language courses never implies that the language is required. “Paid Internship” needs explicit pay during the internship/training; possible employment afterwards is insufficient.

Underlined tags, role categories and supported warning badges are buttons. Selecting one opens the original supporting sentence, with its section or source field named. Select another to switch evidence; select the same badge or Close to collapse it. Buttons support keyboard focus, Enter/Space and expanded-state announcements. Quotes preserve original spelling, accents and punctuation and are rendered as text. Missing information is not supplied with an invented quote. Skill evidence can describe required or preferred familiarity; inspect the sentence for the condition.

“Students / Graduates Welcome” is suppressed when prior work experience is mentioned, including preferred experience. Optional experience stays optional for eligibility. Cards show either a numeric salary amount extracted from salary metadata, the title or a salary paragraph, or “Salary amount not stated”. Negotiable pay uses the latter state. The repeated training-fee absence message has been removed; fee detection still excludes adverts requesting applicant payments.

## Local applicant tools

Use **Save job**, **Hide job** and the **Application** menu on each card. Application stages are Applied, Interview, Offer, Rejected and Withdrawn; Not applied clears tracking. Browse omits hidden jobs, while Saved, Applications and Hidden let you revisit them. Hiding never erases a saved job or application. An Undo button restores a freshly hidden listing.

Choices persist in this browser's local storage, without accounts or server uploads, and synchronize between tabs on the same site address. Clearing site data removes them; another browser, device or site address has its own list. A saved snapshot remains accessible if a vacancy leaves the live results, with a warning to verify availability on the source. If browser storage fails, a visible notice explains that new choices may only last for the current page.

Choose several items under **Add skill or condition**. Each becomes a removable chip, and results must match **all** selected tags together with search, category, source and fit. For example, select No Experience Required, English Required and Part Time. Filters are preserved in the URL; clearing filters leaves your personal choices intact. Personal views initially show every fit level so saved stretch roles remain visible.

## Inspection and maintenance

The API exposes `/api/jobs`, `/api/filters` and `/api/health`. `/api/jobs` returns an array; supported filters are `search`, `category`, `tag`, `source`, `mode` and `fit` (`beginner`, `stretch`, `review`, `other`, `all`). Repeat `tag` for AND matching (for example, `?tag=English%20Required&tag=Part%20Time`); a single tag still works. The default fit is `beginner`. The optional `review` filter accepts `experience`, `degree`, `pay` or `details`. Results include `salary_amount` and `review_reasons`; `/api/filters` includes view counts and review-reason counts.

Evidence is recorded during classification in `tag_evidence`, `flag_evidence` and `category_evidence`. The API returns parsed objects/arrays containing `{text, section}` records. A duplicate card uses the selected representative's own evidence rather than mixing quotes from other source adverts. Migration adds these fields automatically; analysis version 9 populates old saved rows on startup.

Duplicate grouping in `lib/deduplicate.js` normalizes employer/location additions in titles and compares near-identical duties for similar titles from the same known employer. Eligibility, required languages and schedule tags must agree. The representative is chosen by verified details, latest detail check, detail completeness, numeric salary, then shorter title and a stable tie-break. Every source link remains available on the card. Unknown employers and differing requirements remain separate; no database adverts are deleted.

Adjust category/skill/language rules in `lib/concept-graph.js` and eligibility rules in `lib/scoring-engine.js`. Increase `ANALYSIS_VERSION` when analysis behavior changes, add a regression example, then run `npm test` and `npm run analyze`. Source extraction lives in `lib/job-extractor.js` and listing URLs in `lib/scrape-source.js`.

Job boards can change their markup, adverts can be misleading, and absence of a fee statement does not establish free training. The page exposes the extracted vacancy text, reasons and the last successful detail check so applicants can verify pay, training conditions and availability against the source. Existing listings remain available during network outages. This prototype does not promise complete market coverage or perfect classification.

Before this repair, the saved database and swapped files were backed up under `.cache/`. That folder and SQLite data are ignored by Git.
