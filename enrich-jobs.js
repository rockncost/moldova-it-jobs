const axios = require('axios');
const db = require('./db');
const { extractDetails, safeJobLink, detectClosed } = require('./lib/job-extractor');
const { runAnalysisPipeline } = require('./pipeline-analyze');

function pendingDetails(database,{source,force=false,retryFailed=false,limit=100,now=new Date()}={}) {
 const cutoff=new Date(now.getTime()-7*86400000).toISOString(),retry=new Date(now.getTime()-6*3600000).toISOString();
 return database.prepare(`SELECT * FROM jobs WHERE (? IS NULL OR source=?)
 AND (? OR (julianday(detail_checked_at) IS NULL OR julianday(detail_checked_at)<=julianday(?) OR description_quality<>'verified' OR detail_error IS NOT NULL OR (availability='closed' AND julianday(last_seen_at)>julianday(detail_checked_at))))
 AND (? OR julianday(detail_attempted_at) IS NULL OR julianday(detail_attempted_at)<=julianday(?))
 AND (?=0 OR detail_error IS NOT NULL)
 ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, COALESCE(julianday(detail_attempted_at),0), COALESCE(julianday(detail_checked_at),0),id LIMIT ?`).all(source||null,source||null,force?1:0,cutoff,force?1:0,retry,retryFailed?1:0,limit);
}
async function enrichJobs({force=false,retryFailed=false,limit=300,delay=350,database=db,source,request=axios.get,now=new Date(),analyze=true}={}) {
 const sources=source?[source]:['Rabota.md','Delucru.md','Lucru.md'];
 const pending=sources.flatMap(name=>pendingDetails(database,{source:name,force:force||retryFailed,retryFailed,limit:Math.ceil(limit/sources.length),now}));
 const update=database.prepare(`UPDATE jobs SET description=@description,raw_description=COALESCE(raw_description,description),description_quality='verified',
 company=CASE WHEN @company<>'N/A' THEN @company ELSE company END,title=CASE WHEN @title<>'' THEN @title ELSE title END,
 location=@location,work_mode=@work_mode,schedule=@schedule,salary=@salary,source_metadata=@metadata,
 detail_checked_at=@now,detail_attempted_at=@now,detail_error=NULL,availability='open',availability_reason=NULL,analysis_version=0 WHERE id=@id`);
 const close=database.prepare("UPDATE jobs SET availability='closed',availability_reason=?,detail_attempted_at=?,detail_checked_at=?,detail_error=NULL,analysis_version=0 WHERE id=?");
 const fail=database.prepare('UPDATE jobs SET detail_error=?,detail_attempted_at=? WHERE id=?');
 const results={enriched:0,closed:0,failed:0,attempted:pending.length,errors:[],sources:{}};
 for(const name of sources)results.sources[name]={attempted:0,verified:0,closed:0,failed:0,errors:[]};
 for(const job of pending){
  const stats=results.sources[job.source];stats.attempted++;
  const time=new Date().toISOString();
  try{
   if(!safeJobLink(job.link,job.source))throw Error('Invalid source URL');
   const response=await request(job.link,{timeout:15000,maxContentLength:5000000,headers:{'User-Agent':'MoldovaEntryJobs/1.0','Accept-Language':'ro,en;q=0.8'}});
   const finalUrl=response.request?.res?.responseUrl;
   if(finalUrl&&(!safeJobLink(finalUrl,job.source)||safeJobLink(finalUrl,job.source).split('/').pop()!==safeJobLink(job.link,job.source).split('/').pop()))throw Error('Vacancy redirected away from its detail page; availability unconfirmed.');
   const availability=detectClosed(response.data,job.source,now);
   if(availability.closed){close.run(availability.reason,time,time,job.id);results.closed++;stats.closed++;}
   else{const details=extractDetails(response.data,job.source);update.run({...details,metadata:JSON.stringify(details.metadata),id:job.id,now:time});results.enriched++;stats.verified++;}
  }catch(error){
   if([404,410].includes(error.response?.status)){close.run(`Source returned HTTP ${error.response.status}.`,time,time,job.id);results.closed++;stats.closed++;}
   else{const message=`#${job.id}: ${error.message}`.slice(0,300);fail.run(message,time,job.id);results.failed++;stats.failed++;if(stats.errors.length<5)stats.errors.push(message);if(results.errors.length<15)results.errors.push(message);console.error(`[${job.source}] ${message}`);}
  }
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
 }
 if(analyze)runAnalysisPipeline(database,{onlyPending:true,quiet:true});
 console.log(`Detail refresh: ${results.enriched} verified, ${results.closed} closed, ${results.failed} failed of ${results.attempted}.`);
 return results;
}
if(require.main===module)enrichJobs({force:process.argv.includes('--force'),retryFailed:process.argv.includes('--retry-failed')}).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={enrichJobs,pendingDetails};
