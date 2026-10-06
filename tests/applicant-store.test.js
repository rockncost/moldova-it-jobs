const test=require('node:test');
const assert=require('node:assert/strict');
const {create,KEY}=require('../public/applicant-store');
const job={title:'Junior QA',link:'https://www.rabota.md/job/1',sources:[{name:'Rabota.md',link:'https://www.rabota.md/job/1'},{name:'Lucru.md',link:'https://www.lucru.md/job/2'}],tags:['No Experience Required']};
function storage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};}
test('saved snapshots, hiding and application progress persist independently across reloads and representative changes',()=>{
 const disk=storage(),store=create(disk);store.update(job,{saved:true,status:'applied'});const date=store.state(job).appliedAt;
 store.update(job,{hidden:true});const reload=create(disk),alternate={...job,link:job.sources[1].link,sources:[]};
 assert.equal(reload.state(alternate).saved,true);assert.equal(reload.state(alternate).hidden,true);assert.equal(reload.state(alternate).status,'applied');
 assert.deepEqual(reload.counts(),{saved:1,applications:1,hidden:1});assert.equal(reload.jobs('saved')[0].title,job.title);
 reload.update(alternate,{status:'interview'});assert.equal(reload.state(job).appliedAt,date);
 reload.update(alternate,{saved:false,hidden:false});assert.deepEqual(reload.counts(),{saved:0,applications:1,hidden:0});
 reload.update(alternate,{status:''});assert.deepEqual(reload.counts(),{saved:0,applications:0,hidden:0});assert.equal(create(disk).jobs('applications').length,0);
});
test('blocked storage retains current-page choices and reports failures',()=>{
 let errors=0;const store=create({getItem(){throw Error();},setItem(){throw Error();}},()=>errors++);
 store.update(job,{saved:true});assert.equal(store.state(job).saved,true);assert.equal(errors,2);
});
test('corrupt storage and unsafe source links cannot introduce tracked listings',()=>{
 const disk=storage();disk.setItem(KEY,JSON.stringify({version:1,entries:[{job:{sources:'invalid'},links:[],status:''},{job:{link:'javascript:alert(1)'},links:[],status:''}]}));
 assert.equal(create(disk).jobs('saved').length,0);assert.throws(()=>create(disk).update({link:'https://evil.example/1'},{saved:true}),/Invalid/);
 assert.throws(()=>create(disk).update(job,{status:'invented'}),/Unknown/);
 disk.setItem(KEY,'{broken');let errors=0;create(disk,()=>errors++);assert.equal(errors,1);
});
test('storage refresh observes choices made by another tab and site-data clearing',()=>{
 const disk=storage(),first=create(disk),second=create(disk);first.update(job,{saved:true});second.reload();assert.equal(second.counts().saved,1);
 disk.setItem(KEY,JSON.stringify({version:1,entries:[]}));second.reload();assert.equal(second.counts().saved,0);
});
