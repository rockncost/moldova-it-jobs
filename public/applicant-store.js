(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ApplicantStore=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const KEY='first-step.applicant.v1';
  const STATUSES=['','applied','interview','offer','rejected','withdrawn'];
  function links(job){return [...new Set([job?.link,...(Array.isArray(job?.sources)?job.sources:[]).map(source=>source?.link)].filter(link=>{try{const url=new URL(link);return url.protocol==='https:'&&['rabota.md','lucru.md','delucru.md'].includes(url.hostname.replace(/^www\./,''));}catch{return false;}}))].sort();}
  function create(storage,onError=()=>{}){
    let entries=[];
    function read(){try{const data=JSON.parse(storage.getItem(KEY)||'{"version":1,"entries":[]}');if(data.version!==1||!Array.isArray(data.entries))return;entries=data.entries.filter(entry=>entry&&entry.job&&links(entry.job).length&&Array.isArray(entry.links)&&STATUSES.includes(entry.status)).map(entry=>({...entry,links:links({...entry.job,sources:entry.links.map(link=>({link}))}),saved:entry.saved===true,hidden:entry.hidden===true}));}catch{onError();}}
    read();
    const find=job=>{const aliases=links(job);return entries.find(entry=>entry.links.some(link=>aliases.includes(link)));};
    const state=job=>find(job)||{saved:false,hidden:false,status:'',appliedAt:null};
    function persist(){try{storage.setItem(KEY,JSON.stringify({version:1,entries}));}catch{onError();}}
    function update(job,changes){
      if(!links(job).length)throw Error('Invalid job source');
      if(Object.hasOwn(changes,'status')&&!STATUSES.includes(changes.status))throw Error('Unknown application status');
      let entry=find(job);
      if(!entry){entry={links:links(job),job:JSON.parse(JSON.stringify(job)),saved:false,hidden:false,status:'',appliedAt:null};entries.push(entry);}
      const previousStatus=entry.status;
      Object.assign(entry,changes);
      entry.links=[...new Set([...entry.links,...links(job)])].sort();entry.job=JSON.parse(JSON.stringify(job));
      if(Object.hasOwn(changes,'status'))entry.appliedAt=changes.status?(entry.appliedAt||new Date().toISOString()):null;
      entry.updatedAt=new Date().toISOString();
      if(!entry.saved&&!entry.hidden&&!entry.status)entries=entries.filter(item=>item!==entry);
      persist();return {...entry,previousStatus};
    }
    function counts(){return {saved:entries.filter(e=>e.saved).length,applications:entries.filter(e=>e.status).length,hidden:entries.filter(e=>e.hidden).length};}
    function jobs(view){return entries.filter(e=>view==='saved'?e.saved:view==='applications'?e.status:view==='hidden'?e.hidden:false).map(e=>e.job);}
    return {state,update,counts,jobs,reload:read};
  }
  return {create,links,STATUSES,KEY};
});
