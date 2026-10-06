const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeDatabase } = require('../db');
const { createApp } = require('../server');
const { runAnalysisPipeline } = require('../pipeline-analyze');

test('partial old schemas migrate all columns idempotently without losing rows', () => {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE jobs(id INTEGER PRIMARY KEY, title TEXT, company TEXT, link TEXT UNIQUE, source TEXT, scraped_at TEXT, description TEXT)");
  db.prepare('INSERT INTO jobs(id,title,link,source,scraped_at) VALUES(1,?,?,?,?)').run('Junior QA','https://www.lucru.md/ro/lucru/qa/1','Lucru.md',new Date().toISOString());
  initializeDatabase(db); initializeDatabase(db);
  const columns = db.prepare('PRAGMA table_info(jobs)').all().map(c=>c.name);
  for(const name of ['quality_flags','status','entry_fit','analysis_version','availability','raw_description','tag_evidence','flag_evidence','category_evidence']) assert.ok(columns.includes(name));
  assert.equal(db.prepare('SELECT count(*) n FROM jobs').get().n,1);
  db.close();
});

test('API reanalyzes stale jobs, deduplicates known employers and applies every filter', async () => {
  const db = initializeDatabase(new Database(':memory:'));
  const insert = db.prepare(`INSERT INTO jobs(title,company,link,source,scraped_at,description,description_quality,location)
    VALUES(?,?,?,?,?,?,'verified','Chișinău')`);
  const description = 'Requirements:\nNo experience required. Python and SQL basics.\nBenefits:\nSalary offered, free training provided and a modern office with the team in Chișinău.';
  for(const [source,link] of [['Lucru.md','https://www.lucru.md/ro/lucru/junior/1'],['Rabota.md','https://www.rabota.md/ro/locuri-de-munca/junior/1']]) insert.run('Junior Developer','Employer',link,source,new Date().toISOString(),description);
  insert.run('Junior QA','Unknown', 'https://www.delucru.md/job/2','Delucru.md',new Date().toISOString(),description.replace('No experience required.','Minimum 1 year of experience.'));
  insert.run('Junior Developer','N/A','https://www.delucru.md/job/3','Delucru.md',new Date().toISOString(),description);
  insert.run('Senior Developer','Other','https://www.delucru.md/job/4','Delucru.md',new Date().toISOString(),description);
  const server = createApp(db).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = async route => { const response=await fetch(origin+route);assert.equal(response.status,200);return response.json(); };
  try {
    const jobs = await get('/api/jobs');
    assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.entry_fit==='beginner'));
    assert.equal(jobs.find(j=>j.company==='Employer').sources.length,2);
    assert.ok(Array.isArray(jobs[0].tags));assert.ok(Array.isArray(jobs[0].reasons));
    const employer=jobs.find(job=>job.company==='Employer');
    assert.deepEqual(employer.tag_evidence['No Experience Required'],[{text:'No experience required.',section:'Requirements'}]);
    assert.deepEqual(employer.category_evidence,[{text:'Junior Developer',section:'Job title'}]);
    assert.equal((await get('/api/jobs?fit=stretch')).length,1);
    assert.equal((await get('/api/jobs?source=Rabota.md')).length,1);
    assert.equal((await get('/api/jobs?tag=Python')).length,2);
    assert.equal((await get('/api/jobs?search=SQL')).length,2);
    assert.equal((await get('/api/jobs?search=%27%20OR%201%3D1--')).length,0);
    assert.equal((await get('/api/jobs?category=QA%20%26%20Testing')).length,0);
    const filters=await get('/api/filters');assert.equal(filters.counts.beginner,2);assert.equal(filters.excluded,1);
    const health=await get('/api/refresh-status');assert.equal(health.sources.length,3);assert.ok(health.sources.every(source=>source.status==='never'));
    assert.equal((await fetch(origin+'/api/jobs?fit=invalid')).status,400);
    db.prepare("UPDATE jobs SET title = 'Senior Developer',analysis_version=0 WHERE company='Unknown'").run();
    assert.equal((await get('/api/jobs?fit=stretch')).length,0);
    assert.equal(db.prepare('SELECT count(*) n FROM jobs').get().n,5);
  } finally { await new Promise(resolve=>server.close(resolve)); db.close(); }
});

test('corrupted originals are preserved and exclusions can be reversed by corrected details',()=>{
  const db=initializeDatabase(new Database(':memory:'));
  const raw='x'.repeat(100000);
  db.prepare('INSERT INTO jobs(title,company,link,source,scraped_at,description) VALUES(?,?,?,?,?,?)')
    .run('Junior IT Support','Employer','https://www.rabota.md/ro/locuri-de-munca/support/1','Rabota.md',new Date().toISOString(),raw);
  runAnalysisPipeline(db,{quiet:true});
  assert.equal(db.prepare('SELECT raw_description FROM jobs').get().raw_description,raw);
  assert.equal(db.prepare('SELECT entry_fit FROM jobs').get().entry_fit,'review');
  db.prepare("UPDATE jobs SET description=?,description_quality='verified',location='Chișinău'")
    .run('No experience required. We will help you learn how to provide technical support with our team. The employer provides training and a salary.');
  runAnalysisPipeline(db,{quiet:true});
  assert.equal(db.prepare('SELECT entry_fit FROM jobs').get().entry_fit,'beginner');
  assert.equal(db.prepare('SELECT raw_description FROM jobs').get().raw_description,raw);
  db.close();
});

test('API separates other roles, filters concrete review reasons and returns only numeric salary amounts', async () => {
  const db = initializeDatabase(new Database(':memory:'));
  const insert = db.prepare(`INSERT INTO jobs(title,company,link,source,scraped_at,description,description_quality,location,salary)
    VALUES(?,?,?,'Delucru.md',?,?,'verified','Chișinău',?)`);
  const body = 'Benefits:\nYou will work with the team on real projects in our modern office and develop practical IT skills.';
  for (const [id,title,requirements,salary] of [
    [1,'Junior Developer','No experience required.','Negociabil'],
    [2,'Junior QA','Completed university degree required.','12 000 MDL'],
    [3,'Junior IT Support','Previous work experience required.',''],
    [4,'Software Developer','Python and SQL basics.',''],
  ]) insert.run(title,`Employer ${id}`,`https://www.delucru.md/job/${id}`,new Date().toISOString(),`Requirements:\n${requirements}\n${body}`,salary);
  const server = createApp(db).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = async route => { const response=await fetch(origin+route);assert.equal(response.status,200);return response.json(); };
  try {
    const filters = await get('/api/filters');
    assert.deepEqual(filters.counts, {beginner:1,stretch:0,review:2,other:1,all:4});
    assert.equal(filters.reviewReasons.find(reason=>reason.value==='degree').count,1);
    const degree = await get('/api/jobs?fit=review&review=degree');
    assert.equal(degree.length,1);assert.equal(degree[0].salary_amount,'12 000 MDL');
    assert.deepEqual(degree[0].review_reasons,['degree']);
    assert.deepEqual(degree[0].flag_evidence.DEGREE_REQUIRED,[{text:'Completed university degree required.',section:'Requirements'}]);
    assert.equal((await get('/api/jobs?fit=review&review=experience')).length,1);
    assert.equal((await get('/api/jobs?fit=other'))[0].title,'Software Developer');
    assert.equal((await get('/api/jobs'))[0].salary_amount,'');
    assert.equal((await fetch(origin+'/api/jobs?fit=review&review=unknown')).status,400);
    assert.equal(db.prepare('SELECT count(*) n FROM jobs').get().n,4);
  } finally { await new Promise(resolve=>server.close(resolve)); db.close(); }
});

test('multiple tag filters require every condition together with category and source',async()=>{
 const db=initializeDatabase(new Database(':memory:'));
 const insert=db.prepare(`INSERT INTO jobs(title,company,link,source,scraped_at,description,description_quality,location) VALUES(?,?,?,'Delucru.md',?,?,'verified','Chișinău')`);
 for(const [id,requirements] of [[1,'No experience required. English required. Part-time work.'],[2,'No experience required. English required.'],[3,'No experience required. Part-time work.']])insert.run('Junior IT Support',`Employer ${id}`,`https://www.delucru.md/job/${id}`,new Date().toISOString(),`Requirements:\n${requirements}\nBenefits:\nThe employer provides a salary, free training and practical support from our technical team in the office.`);
 const server=createApp(db).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  const params=new URLSearchParams({category:'IT Support & Helpdesk',source:'Delucru.md'});for(const tag of ['No Experience Required','English Required','Part Time'])params.append('tag',tag);
  const response=await fetch(`${origin}/api/jobs?${params}`);assert.equal(response.status,200);const jobs=await response.json();assert.equal(jobs.length,1);assert.equal(jobs[0].company,'Employer 1');
  assert.equal((await (await fetch(`${origin}/api/jobs?tag=English%20Required`)).json()).length,2);
  params.append('tag','Unknown skill');assert.equal((await (await fetch(`${origin}/api/jobs?${params}`)).json()).length,0);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
