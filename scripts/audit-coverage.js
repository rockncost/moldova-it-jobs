const db=require('../db'),fs=require('fs'),axios=require('axios'),cheerio=require('cheerio');
const {extractListing}=require('../lib/job-extractor');const {isCandidate,SOURCES}=require('../lib/scrape-source');
const searches=[
 ['Rabota.md','Internships','https://www.rabota.md/ro/vacancies/category/internship'],
 ['Rabota.md','Junior search','https://www.rabota.md/ro/jobs-chisinau-junior'],
 ['Lucru.md','Internships','https://www.lucru.md/ro/posturi-vacante/categorie/internship'],
 ['Lucru.md','Junior search','https://www.lucru.md/ro/lucru-chisinau-junior'],
 ['Delucru.md','Internships','https://www.delucru.md/jobs/internship-programmes'],
 ['Delucru.md','No experience','https://www.delucru.md/jobs/jobs-where-experience-is-not-required'],
 ['Delucru.md','Entry level','https://www.delucru.md/jobs/entry-level']];
async function audit(){const report={at:new Date().toISOString(),scope:'First up to five pages per dedicated search; title candidates require detail review. Live results vary.',searches:[]};
 for(const [source,name,base] of searches){const result={source,name,url:base,pages:0,listings:[],errors:[]};const seen=new Set();
  for(let page=1;page<=5;page++){const url=new URL(base);if(page>1){if(source==='Delucru.md')url.searchParams.set('page',page);else url.pathname+=`/page-${page}`;}
   try{const {data}=await axios.get(url.href,{timeout:15000,maxContentLength:5000000});const jobs=extractListing(data,source),$=cheerio.load(data);if(!jobs.length){result.errors.push(`Page ${page}: no recognized vacancy cards; comparison incomplete.`);break;}const newJobs=jobs.filter(job=>!seen.has(job.link));if(!newJobs.length)break;result.pages++;
    for(const job of newJobs){seen.add(job.link);if(!isCandidate(job.title))continue;const boardId=job.link.match(/\/(\d+)$/)?.[1];const row=db.prepare('SELECT id,status,entry_fit,exclusion_reason,availability,link AS stored_link FROM jobs WHERE source=?').all(source).find(row=>row.stored_link.match(/\/(\d+)$/)?.[1]===boardId);result.listings.push({...job,...row,coverage:row?(row.status==='active'?'visible':'stored / excluded'):'missing'});}
    const next=$('a[href]').toArray().some(e=>{try{const u=new URL($(e).attr('href'),url);return source==='Delucru.md'?u.searchParams.get('page')===String(page+1):u.pathname.endsWith(`/page-${page+1}`);}catch{return false;}});if(!next)break;
   }catch(e){result.errors.push(`Page ${page}: ${e.message}`);break;}await new Promise(r=>setTimeout(r,350));
  }report.searches.push(result);console.log(source,name,result.pages,result.listings.length,'candidates',result.listings.filter(j=>j.coverage==='missing').length,'missing',result.errors);
 }
 fs.mkdirSync('docs',{recursive:true});fs.writeFileSync('docs/coverage-audit.json',JSON.stringify(report,null,2));let md=`# Coverage audit\n\nChecked ${report.at}. ${report.scope}\n\n| Board/search | Pages | Title candidates | Visible | Stored/excluded | Missing |\n|---|---:|---:|---:|---:|---:|\n`;
 for(const r of report.searches){md+=`| [${r.source}: ${r.name}](${r.url}) | ${r.pages} | ${r.listings.length} | ${r.listings.filter(j=>j.coverage==='visible').length} | ${r.listings.filter(j=>j.coverage==='stored / excluded').length} | ${r.listings.filter(j=>j.coverage==='missing').length} |\n`;}
 for(const r of report.searches){md+=`\n## ${r.source}: ${r.name}\n\n`;for(const error of r.errors)md+=`Incomplete: ${error}\n\n`;for(const job of r.listings)md+=`- [${job.title}](${job.link}): ${job.coverage}${job.exclusion_reason?` — ${job.exclusion_reason}`:''}.\n`;}
 fs.writeFileSync('docs/coverage-audit.md',md);return report;
}
if(require.main===module)audit().catch(e=>{console.error(e);process.exitCode=1;});module.exports={audit,searches};


