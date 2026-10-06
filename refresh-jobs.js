const db=require('./db');const {scrapeSource,SOURCES}=require('./lib/scrape-source');const {enrichJobs}=require('./enrich-jobs');const {runAnalysisPipeline}=require('./pipeline-analyze');
async function refreshJobs({pages=5,detailLimit=100,database=db,scrape=scrapeSource,enrich=enrichJobs}={}){
 const time=new Date().toISOString();
 const run=database.transaction(()=>{const active=database.prepare("SELECT id FROM refresh_runs WHERE status='running' AND julianday(started_at)>julianday('now','-2 hours')").get();if(active)return null;database.prepare("UPDATE refresh_runs SET status='failed',finished_at=?,error='Interrupted refresh; recovered on next run.' WHERE status='running'").run(time);return database.prepare("INSERT INTO refresh_runs(started_at,status) VALUES(?,'running')").run(time).lastInsertRowid;})();
 if(!run)return {skipped:true,reason:'Another refresh is running.'};
 const results=[];let fatal;
 try{
  for(const source of Object.keys(SOURCES)){
   database.prepare("INSERT INTO source_refresh(run_id,source,started_at,status) VALUES(?,?,?,'running')").run(run,source,new Date().toISOString());
   let listings={found:0,successfulPages:0,failedPages:0,errors:[]},details={attempted:0,enriched:0,closed:0,failed:0,errors:[]};const errors=[];
   try{listings=await scrape(source,{pages,database});errors.push(...(listings.errors||[]));}catch(e){listings.failedPages++;errors.push(e.message);}
   try{details=await enrich({source,limit:detailLimit,database,analyze:false});errors.push(...(details.errors||[]));}catch(e){details.failed++;errors.push(e.message);}
   const status=errors.length||listings.failedPages||details.failed?(listings.successfulPages||details.enriched||details.closed?'partial':'failed'):'success';
   database.prepare('UPDATE source_refresh SET finished_at=?,status=?,listing_pages=?,found=?,detail_attempted=?,verified=?,closed=?,failed=?,errors=? WHERE run_id=? AND source=?').run(new Date().toISOString(),status,listings.successfulPages,listings.found,details.attempted,details.enriched,details.closed,details.failed,JSON.stringify(errors.slice(0,10)),run,source);
   results.push({source,status,...listings,details});
  }
  runAnalysisPipeline(database,{onlyPending:true,quiet:true});
 }catch(e){fatal=e;}
 const status=fatal||results.every(r=>r.status==='failed')?'failed':results.some(r=>r.status!=='success')?'partial':'success';
 database.prepare('UPDATE refresh_runs SET finished_at=?,status=?,error=? WHERE id=?').run(new Date().toISOString(),status,fatal?.message||null,run);
 console.log('Refresh complete:',results.map(r=>({source:r.source,status:r.status,found:r.found,verified:r.details.enriched,closed:r.details.closed,failed:r.details.failed})));
 if(fatal)throw fatal;return {run,status,results};
}
if(require.main===module){const pages=Number(process.argv.find(a=>a.startsWith('--pages='))?.split('=')[1]||5);const limit=Number(process.argv.find(a=>a.startsWith('--details='))?.split('=')[1]||100);refreshJobs({pages:Math.min(10,Math.max(1,pages||5)),detailLimit:Math.min(300,Math.max(1,limit||100))}).then(result=>{if(['failed','partial'].includes(result.status))process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={refreshJobs};
