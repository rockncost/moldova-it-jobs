# First Step — Chișinău IT jobs

Local aggregation and transparent beginner eligibility rules for Rabota.md, Delucru.md and Lucru.md. No LLM, model download, GPU or API key is used. Romanian, Russian and English analysis runs in JavaScript on the same computer as the website.

## Run

Use Node.js 24 and run these commands from this project directory:

```sh
npm install
npm run refresh
npm start
```

Open http://localhost:3000. `npm start` runs the server and daily refresh scheduler. The scheduler runs at 08:00 Europe/Chisinau while the process is running. It is not an operating-system service; leave it running for scheduled refreshes. `npm run serve` runs only the website.

`npm run refresh` reads five listing pages per board, fetches up to 300 vacancy detail pages, and analyzes them. Sources run independently; a failing board does not prevent the others from updating. Requests have timeouts and delays. `node refresh-jobs.js --pages=3` limits listing pages for a shorter refresh. Run refresh again if an initial import has more than 300 pending detail pages. `node enrich-jobs.js --force` rechecks saved details; `npm run analyze` applies changed rules without internet access. `npm test` runs offline regression and API tests.

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
- **Stretch roles:** beginner signals plus a stated experience minimum below two years. The current one-year examples may still be suitable for applicants with projects or internships; the employer decides what counts.
- **Needs checking:** unclear requirements, completed-degree requirements, unquantified experience, advanced skills under a junior title, conflicting experience claims, mixed junior/middle seniority, unconfirmed location or details, or internship pay described only for later employment.
- **Excluded:** mandatory experience of at least two years, senior roles, unrelated work, courses/applicant training fees, explicitly unpaid work, mandatory relocation or foreign onboarding, workplaces outside Chișinău unless Moldova-accessible remote work is stated, or closed vacancy pages.

Optional experience, company age, training duration and zero-to-two-year ranges do not become mandatory experience. Literal punctuation in C#, C++, .NET and Unicode word boundaries is handled explicitly.

Tags cover stated no-experience/student acceptance, internships, employer training, languages (required versus preferred), degree alternatives, shifts, driving licence, part-time/remote/hybrid/flexible work and technology skills. A junior title never implies part-time work or no degree requirement. A reference to free language courses never implies that the language is required. “Paid Internship” needs explicit pay during the internship/training; possible employment afterwards is insufficient.

## Inspection and maintenance

The API exposes `/api/jobs`, `/api/filters` and `/api/health`. `/api/jobs` returns an array; supported filters are `search`, `category`, `tag`, `source`, `mode` and `fit` (`beginner`, `stretch`, `review`, `all`). The default is `beginner`. Known duplicates are grouped by role, employer and eligibility, with links to each source. Unknown employers remain separate. Differing experience/eligibility is not merged.

Adjust category/skill/language rules in `lib/concept-graph.js` and eligibility rules in `lib/scoring-engine.js`. Increase `ANALYSIS_VERSION` when analysis behavior changes, add a regression example, then run `npm test` and `npm run analyze`. Source extraction lives in `lib/job-extractor.js` and listing URLs in `lib/scrape-source.js`.

Job boards can change their markup, adverts can be misleading, and absence of a fee statement does not establish free training. The page exposes the extracted vacancy text, reasons and the last successful detail check so applicants can verify pay, training conditions and availability against the source. Existing listings remain available during network outages. This prototype does not promise complete market coverage or perfect classification.

Before this repair, the saved database and swapped files were backed up under `.cache/`. That folder and SQLite data are ignored by Git.
