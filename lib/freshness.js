const SOURCES=['Rabota.md','Delucru.md','Lucru.md'];
function refreshStatus(db,now=new Date()){
 return SOURCES.map(source=>{const latest=db.prepare('SELECT * FROM source_refresh WHERE source=? ORDER BY run_id DESC LIMIT 1').get(source);const success=db.prepare("SELECT finished_at FROM source_refresh WHERE source=? AND status='success' ORDER BY run_id DESC LIMIT 1").get(source);
 const stats=db.prepare(`SELECT count(*) total,COALESCE(sum(CASE WHEN julianday(detail_checked_at) IS NULL OR julianday(detail_checked_at)<=julianday(?) THEN 1 ELSE 0 END),0) stale,COALESCE(sum(CASE WHEN detail_error IS NOT NULL THEN 1 ELSE 0 END),0) detail_failures FROM jobs WHERE source=? AND status='active'`).get(new Date(now.getTime()-7*86400000).toISOString(),source);
 return {source,status:latest?.status||'never',started_at:latest?.started_at||null,finished_at:latest?.finished_at||null,last_success:success?.finished_at||null,listing_pages:latest?.listing_pages||0,found:latest?.found||0,verified:latest?.verified||0,closed:latest?.closed||0,failed:latest?.failed||0,errors:latest?JSON.parse(latest.errors):[],...stats};});
}
module.exports={refreshStatus};
