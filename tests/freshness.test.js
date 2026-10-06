const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3');
const {initializeDatabase}=require('../db');const {detectClosed,safeJobLink,extractListing}=require('../lib/job-extractor');const {pendingDetails,enrichJobs}=require('../enrich-jobs');const {scrapeSource}=require('../lib/scrape-source');const {refreshJobs}=require('../refresh-jobs');const {refreshStatus}=require('../lib/freshness');
function database(){return initializeDatabase(new Database(':memory:'));}
function insert(db,id,extra={}){db.prepare(`INSERT INTO jobs(id,title,company,link,source,scraped_at,description,description_quality,detail_checked_at,status,availability,location) VALUES(?, 'Junior QA','Employer',?,'Rabota.md',?,'Old verified description','verified',?,'active','open','Chișinău')`).run(id,`https://www.rabota.md/ro/locuri-de-munca/qa/${id}`,new Date().toISOString(),extra.checked===undefined?'2020-01-01T12:00:00.000Z':extra.checked);}
const good='<h1 class="vacancy-title">Junior QA</h1><div class="vacancy-content"><h2>Requirements:</h2><p>No experience required. We offer a salary and employer training in our Chisinau office with a technical team supporting your work.</p></div>';
test('closure detection handles HTTP-200 notices and expiry without reading related adverts or generic text',()=>{
 for(const message of ['Anunțul nu mai este disponibil','Acest anunț este arhivat','This job has expired','Вакансия закрыта'])assert.equal(detectClosed(`<main><div role="alert">${message}</div>${good}</main>`,'Rabota.md').closed,true,message);
 assert.equal(detectClosed(good+'<aside><h2>This job has expired</h2></aside>','Rabota.md').closed,false);
 assert.equal(detectClosed(good+'<div hidden><h2>This job has expired</h2></div>','Rabota.md').closed,false);
 assert.equal(detectClosed('<h1>Access denied</h1>','Rabota.md').closed,false);
 assert.equal(detectClosed('<main>This vacancy is no longer available</main>','Rabota.md').closed,true);
 assert.equal(detectClosed('<script type="application/ld+json">{"@type":"JobPosting","title":"QA","validThrough":"2020-01-01"}</script>','Rabota.md').closed,true);
 assert.equal(detectClosed(good.replace('No experience required.','Resolve closed tickets and expired accounts.'),'Rabota.md').closed,false);
});
test('standard advert detail blocks are isolated from surrounding page content',()=>{
 const {extractDetails}=require('../lib/job-extractor');const html='<nav>2 years required</nav><h1>Junior e-commerce</h1><div data-js-vacancy-content>No experience required. Prepare and maintain product pages using Excel and a content management system. We offer a salary and training in our Chișinău office.</div><footer>Other vacancies</footer>';
 const details=extractDetails(html,'Rabota.md');assert.equal(details.title,'Junior e-commerce');assert.match(details.description,/product pages/);assert.doesNotMatch(details.description,/2 years|Other vacancies/);
});
test('redirects to another vacancy preserve the original snapshot and flag uncertainty',async()=>{
 const db=database();insert(db,1);const result=await enrichJobs({database:db,source:'Rabota.md',delay:0,request:async()=>({data:good,request:{res:{responseUrl:'https://www.rabota.md/ro/locuri-de-munca/other/2'}}})});assert.equal(result.failed,1);assert.equal(db.prepare('SELECT description FROM jobs').get().description,'Old verified description');db.close();
});
test('recheck queue includes null dates, correctly compares ISO dates, fairly prioritizes oldest attempts and backs off failures',()=>{
 const db=database();insert(db,1,{checked:'2026-10-01T09:00:00.000Z'});insert(db,2,{checked:'2026-10-01T11:00:00.000Z'});insert(db,3,{checked:null});
 const now=new Date('2026-10-08T10:00:00Z');assert.deepEqual(pendingDetails(db,{now}).map(j=>j.id),[3,1]);
 db.prepare('UPDATE jobs SET detail_attempted_at=? WHERE id=3').run('2026-10-08T09:00:00Z');assert.deepEqual(pendingDetails(db,{now}).map(j=>j.id),[1]);assert.equal(pendingDetails(db,{now,force:true}).length,3);db.close();
});
test('detail refresh closes normal-page and 404 adverts, preserves snapshots on failures and recovers on success',async()=>{
 const db=database();for(let id=1;id<=4;id++)insert(db,id);
 const result=await enrichJobs({database:db,source:'Rabota.md',delay:0,request:async url=>{const id=Number(url.split('/').pop());if(id===1)return {data:'<h1>This job has expired</h1>'};if(id===2)throw Object.assign(Error('404'),{response:{status:404}});if(id===3)throw Object.assign(Error('503 temporary outage'),{response:{status:503}});return {data:good};}});
 assert.deepEqual([result.enriched,result.closed,result.failed],[1,2,1]);assert.equal(db.prepare('SELECT status FROM jobs WHERE id=1').get().status,'excluded');
 const failed=db.prepare('SELECT * FROM jobs WHERE id=3').get();assert.equal(failed.description,'Old verified description');assert.equal(failed.availability,'open');assert.ok(failed.detail_error);assert.ok(failed.detail_attempted_at);assert.equal(failed.detail_checked_at,'2020-01-01T12:00:00.000Z');
 await enrichJobs({database:db,source:'Rabota.md',delay:0,force:true,request:async()=>({data:good})});assert.equal(db.prepare('SELECT status FROM jobs WHERE id=1').get().status,'active');assert.equal(db.prepare('SELECT detail_error FROM jobs WHERE id=3').get().detail_error,null);db.close();
});
test('standard advert URLs are accepted, premium aliases normalize and navigation cannot become a job',()=>{
 assert.equal(safeJobLink('/ro/joburi/junior/987/123','Rabota.md'),'https://www.rabota.md/ro/locuri-de-munca/junior/123');assert.equal(safeJobLink('/ro/munca/junior/987','Lucru.md'),'https://www.lucru.md/ro/munca/junior/987');assert.equal(safeJobLink('/ro/arhiva/joburi','Rabota.md'),null);
 assert.equal(extractListing('<a class="vacancyShowPopup" href="/ro/joburi/junior/987">Junior QA</a>','Rabota.md').length,1);
});
test('seeing a closed advert in a listing does not reopen it without a successful detail check',async()=>{
 const db=database();insert(db,1);db.prepare("UPDATE jobs SET availability='closed',status='excluded'").run();
 await scrapeSource('Rabota.md',{database:db,delay:0,feeds:[()=> 'https://www.rabota.md/ro/jobs-chisinau-IT'],request:async()=>({data:'<a class="vacancyShowPopup" href="/ro/locuri-de-munca/qa/1">Junior QA</a>'})});assert.equal(db.prepare('SELECT availability FROM jobs').get().availability,'closed');db.close();
});
test('per-source refresh persists partial failures, allows other sources and prevents overlapping processes',async()=>{
 const db=database();insert(db,1);let calls=0;
 const result=await refreshJobs({database:db,scrape:async source=>{calls++;return {found:3,successfulPages:source==='Rabota.md'?0:1,failedPages:source==='Rabota.md'?1:0,errors:source==='Rabota.md'?['HTTP 503']:[]};},enrich:async()=>({attempted:1,enriched:1,closed:0,failed:0,errors:[]})});
 assert.equal(calls,3);assert.equal(result.status,'partial');const statuses=refreshStatus(db);assert.equal(statuses[0].status,'partial');assert.deepEqual(statuses[0].errors,['HTTP 503']);assert.equal(statuses[1].status,'success');assert.ok(statuses[1].last_success);
 db.prepare("INSERT INTO refresh_runs(started_at,status) VALUES(?,'running')").run(new Date().toISOString());assert.equal((await refreshJobs({database:db,scrape:()=>{throw Error('must not run');}})).skipped,true);db.close();
});
