// The intern page (SC-430): one self-contained page on the intern host, served by
// /api/intern/portal. Neutral "TrainerDB Tasks" branding; it only calls the /v1 Task API,
// which limits the intern to his own tasks, files and docs. All text is inserted as text
// (never as HTML).
export const PORTAL_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>TrainerDB Tasks</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='4' fill='%232563eb'/%3E%3Cpath d='M4 8.5l2.5 2.5L12 5.5' stroke='white' stroke-width='2' fill='none'/%3E%3C/svg%3E">
<style>
:root{--bg:#f7f7f8;--card:#fff;--fg:#18181b;--muted:#6b7280;--line:#e5e7eb;--accent:#2563eb;--accent-fg:#fff;--warn:#b45309;--ok:#047857;--bad:#b91c1c;--chip:#f1f5f9}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0d;--card:#151518;--fg:#ececf0;--muted:#9ca3af;--line:#26262b;--accent:#3b82f6;--chip:#1f2329;--warn:#f59e0b;--ok:#34d399;--bad:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--card);position:sticky;top:0}
header b{font-size:16px}header .sp{flex:1}
main{max-width:860px;margin:0 auto;padding:16px}
nav{display:flex;gap:6px;margin-bottom:14px}
button,.btn{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:8px;padding:7px 12px;min-height:36px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}
button.on{background:var(--fg);color:var(--bg);border-color:var(--fg)}
button:disabled{opacity:.5;cursor:default}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:10px}
.row{cursor:pointer}.row:hover{border-color:var(--accent)}
.muted{color:var(--muted);font-size:13px}.err{color:var(--bad);font-size:14px;min-height:20px}
.chip{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:var(--chip);margin-left:6px}
.s-in_progress{color:var(--accent)}.s-stuck{color:var(--warn)}.s-submitted{color:var(--warn)}.s-done{color:var(--ok)}
h1{font-size:20px;margin:6px 0}h2{font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:18px 0 8px}
.pre{white-space:pre-wrap;overflow-wrap:anywhere}
input,textarea{font:inherit;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}
textarea{min-height:120px;resize:vertical}
label{display:block;font-size:13px;color:var(--muted);margin:10px 0 4px}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.login{max-width:360px;margin:12vh auto;padding:0 16px}
ul.plain{list-style:none;padding:0;margin:0}ul.plain li{padding:8px 0;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:8px;align-items:center}
ul.plain li:first-child{border-top:0}
dialog{border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--fg);width:min(560px,calc(100vw - 32px));padding:16px}
dialog::backdrop{background:rgba(0,0,0,.4)}
.hidden{display:none}
</style>
</head>
<body>
<div id="app"></div>
<dialog id="dlg"><form method="dialog" id="dlgForm"><h1 id="dlgTitle"></h1><p class="muted" id="dlgHint"></p><div id="dlgFields"></div><p class="err" id="dlgErr"></p><div class="actions"><button type="submit" class="primary" id="dlgOk">Save</button><button type="button" id="dlgCancel">Cancel</button></div></form></dialog>
<script>
(function(){
var app=document.getElementById('app');
var state={me:null,view:'tasks',which:'open'};
function el(tag,attrs,kids){var e=document.createElement(tag);attrs=attrs||{};for(var k in attrs){if(k==='text')e.textContent=attrs[k];else if(k==='on')for(var ev in attrs.on)e.addEventListener(ev,attrs.on[ev]);else if(attrs[k]!=null&&attrs[k]!==false)e.setAttribute(k,attrs[k]);}(kids||[]).forEach(function(c){if(c!=null)e.appendChild(typeof c==='string'?document.createTextNode(c):c);});return e;}
function api(method,path,body,isForm){var o={method:method,headers:{},credentials:'same-origin'};if(method!=='GET')o.headers['X-Portal']='1';if(body!==undefined){if(isForm)o.body=body;else{o.headers['Content-Type']='application/json';o.body=JSON.stringify(body);}}
 return fetch(path,o).then(function(r){return r.json().catch(function(){return {};}).then(function(d){if(r.status===401&&path!=='/v1/login'){state.me=null;render();throw new Error('Please sign in again.');}if(!r.ok)throw new Error(d.error||('Error '+r.status));return d;});});}
function size(n){return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';}
var STAGE={assigned:'Assigned',in_progress:'In progress',stuck:'Stuck',submitted:'Submitted for review',done:'Done',canceled:'Canceled'};
function stageChip(s){return el('span',{class:'chip s-'+s,text:STAGE[s]||s});}
function ask(title,hint,fields,onOk){var d=document.getElementById('dlg'),f=document.getElementById('dlgFields'),err=document.getElementById('dlgErr');document.getElementById('dlgTitle').textContent=title;document.getElementById('dlgHint').textContent=hint||'';f.textContent='';err.textContent='';
 var inputs={};fields.forEach(function(x){f.appendChild(el('label',{text:x.label}));var i=x.multi?el('textarea',{}):el('input',{type:'text'});i.value=x.value||'';inputs[x.name]=i;f.appendChild(i);});
 var ok=document.getElementById('dlgOk');document.getElementById('dlgForm').onsubmit=function(e){e.preventDefault();var v={};for(var k in inputs)v[k]=inputs[k].value;ok.disabled=true;Promise.resolve(onOk(v)).then(function(){d.close();}).catch(function(e2){err.textContent=e2.message;}).then(function(){ok.disabled=false;});};
 document.getElementById('dlgCancel').onclick=function(){d.close();};d.showModal();var first=f.querySelector('input,textarea');if(first)first.focus();}
function fileList(files,emptyText){if(!files||!files.length)return el('p',{class:'muted',text:emptyText});return el('ul',{class:'plain'},files.map(function(f){return el('li',{},[el('a',{class:'btn',href:f.url,download:f.name,text:'Download'}),el('span',{class:'pre',text:f.name}),el('span',{class:'muted',text:size(f.size)+(f.added_by?' · added by '+f.added_by:'')+(f.added_at_ist?' · '+f.added_at_ist:'')})]);}));}
function uploader(path,after){var inp=el('input',{type:'file',class:'hidden',accept:'.pdf,.png,.jpg,.jpeg,.webp,.md,.txt,.csv'});var msg=el('span',{class:'muted'});
 inp.addEventListener('change',function(){if(!inp.files.length)return;var fd=new FormData();fd.append('file',inp.files[0]);msg.textContent='Uploading…';api('POST',path,fd,true).then(function(){msg.textContent='';after();}).catch(function(e){msg.textContent=e.message;});});
 return el('div',{class:'actions'},[inp,el('button',{type:'button',text:'Upload a file',on:{click:function(){inp.click();}}}),msg,el('span',{class:'muted',text:'PDF, images, Markdown, TXT or CSV, up to 25 MB'})]);}
function render(){app.textContent='';if(!state.me)return renderLogin();
 app.appendChild(el('header',{},[el('b',{text:'TrainerDB Tasks'}),el('span',{class:'sp'}),el('span',{class:'muted',text:state.me.name}),el('button',{type:'button',text:'Sign out',on:{click:function(){api('POST','/v1/logout').catch(function(){}).then(function(){state.me=null;render();});}}})]));
 var m=el('main');app.appendChild(m);
 m.appendChild(el('nav',{},[el('button',{type:'button',class:state.view==='tasks'?'on':'',text:'My tasks',on:{click:function(){state.view='tasks';render();}}}),el('button',{type:'button',class:state.view==='docs'?'on':'',text:'My docs',on:{click:function(){state.view='docs';render();}}})]));
 if(state.view==='tasks')renderTasks(m);else if(state.view==='task')renderTask(m);else if(state.view==='docs')renderDocs(m);else if(state.view==='doc')renderDoc(m);}
function renderLogin(){var err=el('p',{class:'err'}),u=el('input',{type:'text',autocomplete:'username',autocapitalize:'none'}),p=el('input',{type:'password',autocomplete:'current-password'}),b=el('button',{type:'submit',class:'primary',text:'Sign in'});
 var f=el('form',{class:'card'},[el('h1',{text:'TrainerDB Tasks'}),el('p',{class:'muted',text:'Sign in with the username and password you were given.'}),el('label',{text:'Username'}),u,el('label',{text:'Password'}),p,err,b]);
 f.addEventListener('submit',function(e){e.preventDefault();b.disabled=true;err.textContent='';api('POST','/v1/login',{login:u.value,password:p.value}).then(loadMe).catch(function(e2){err.textContent=e2.message;}).then(function(){b.disabled=false;});});
 app.appendChild(el('div',{class:'login'},[f]));u.focus();}
function renderTasks(m){m.appendChild(el('div',{class:'actions',style:'margin:0 0 12px'},[el('button',{type:'button',class:state.which==='open'?'on':'',text:'Open',on:{click:function(){state.which='open';render();}}}),el('button',{type:'button',class:state.which==='all'?'on':'',text:'All',on:{click:function(){state.which='all';render();}}})]));
 var box=el('div',{},[el('p',{class:'muted',text:'Loading…'})]);m.appendChild(box);
 api('GET','/v1/tasks?status='+state.which).then(function(d){box.textContent='';var t=d.tasks||[];if(!t.length)box.appendChild(el('p',{class:'muted',text:state.which==='open'?'No open tasks.':'No tasks yet.'}));
  t.forEach(function(x){box.appendChild(el('div',{class:'card row',on:{click:function(){state.view='task';state.task=x.id;render();}}},[el('div',{},[el('b',{text:x.id+' · '+x.title}),stageChip(x.stage),x.priority?el('span',{class:'chip',text:x.priority}):null]),el('div',{class:'muted',text:'Assigned '+x.assigned_at_ist+' · updated '+x.updated_at_ist})]));});}).catch(function(e){box.textContent='';box.appendChild(el('p',{class:'err',text:e.message}));});}
function act(id,action,title,hint,label,required){ask(title,hint,[{name:'text',label:label,multi:true}],function(v){if(required&&!v.text.trim())throw new Error('Please fill this in.');return api('POST','/v1/tasks/'+encodeURIComponent(id)+'/'+action,{text:v.text}).then(function(){render();});});}
function renderTask(m){var id=state.task;m.appendChild(el('button',{type:'button',text:'← My tasks',on:{click:function(){state.view='tasks';render();}}}));var box=el('div',{},[el('p',{class:'muted',text:'Loading…'})]);m.appendChild(box);
 api('GET','/v1/tasks/'+encodeURIComponent(id)).then(function(r){var t=r.task||r;box.textContent='';var c=el('div',{class:'card'});box.appendChild(c);
  c.appendChild(el('h1',{},[t.id+' · '+t.title,stageChip(t.stage)]));c.appendChild(el('p',{class:'muted',text:'Assigned '+t.assigned_at_ist+(t.priority?' · '+t.priority:'')+(t.backlog_code?' · '+t.backlog_code:'')}));
  if(t.description)c.appendChild(el('div',{class:'pre',text:t.description}));
  var a=el('div',{class:'actions'});
  if(t.stage==='assigned')a.appendChild(el('button',{type:'button',class:'primary',text:'Start',on:{click:function(){api('POST','/v1/tasks/'+encodeURIComponent(t.id)+'/start',{}).then(render).catch(function(e){alert(e.message);});}}}));
  if(t.stage==='assigned'||t.stage==='in_progress'){a.appendChild(el('button',{type:'button',text:'Add progress',on:{click:function(){act(t.id,'progress','Add progress','What did you do?','Update',true);}}}));
   a.appendChild(el('button',{type:'button',text:"I'm stuck",on:{click:function(){act(t.id,'stuck',"I'm stuck",'Say why, so your reviewer can help.','Reason',true);}}}));
   a.appendChild(el('button',{type:'button',text:'Submit for review',on:{click:function(){act(t.id,'close','Submit for review','Summarise what you did (at least 20 characters). After this, wait for feedback.','Summary',true);}}}));}
  if(t.stage==='stuck')a.appendChild(el('button',{type:'button',class:'primary',text:'Resume',on:{click:function(){act(t.id,'unstuck','Resume','Optional: what unblocked you?','Note',false);}}}));
  if(t.stage==='submitted')a.appendChild(el('p',{class:'muted',text:'Submitted for review. Wait for feedback.'}));
  if(t.stage==='done'||t.stage==='canceled')a.appendChild(el('p',{class:'muted',text:'This task is finished.'}));
  c.appendChild(a);
  box.appendChild(el('h2',{text:'Files'}));var fc=el('div',{class:'card'},[fileList(t.files,'No files yet.')]);if(t.stage!=='done'&&t.stage!=='canceled')fc.appendChild(uploader('/v1/tasks/'+encodeURIComponent(t.id)+'/files',render));box.appendChild(fc);
  box.appendChild(el('h2',{text:'Your updates'}));var u=t.updates||[];box.appendChild(el('div',{class:'card'},[u.length?el('ul',{class:'plain'},u.slice().reverse().map(function(x){return el('li',{},[el('span',{class:'chip',text:x.stage}),el('span',{class:'muted',text:x.at_ist}),el('div',{class:'pre',style:'flex-basis:100%',text:x.text})]);})):el('p',{class:'muted',text:'No updates yet.'})]));
 }).catch(function(e){box.textContent='';box.appendChild(el('p',{class:'err',text:e.message}));});}
var DOCST={in_review:'In review',changes_requested:'Changes requested',approved:'Approved'};
function editDoc(d){ask(d?'Edit doc':'New doc',d?'Saving sends it back for review.':'It goes to your reviewer.',[{name:'title',label:'Title',value:d?d.title:''},{name:'body',label:'Text (Markdown)',multi:true,value:d?d.body:''}],function(v){return (d?api('PATCH','/v1/kb/'+d.id,{title:v.title,body:v.body}):api('POST','/v1/kb',{title:v.title,body:v.body})).then(function(r){var doc=r.doc||r;state.view='doc';state.doc=doc.id;render();});});}
function renderDocs(m){m.appendChild(el('div',{class:'actions',style:'margin:0 0 12px'},[el('button',{type:'button',class:'primary',text:'New doc',on:{click:function(){editDoc(null);}}})]));var box=el('div',{},[el('p',{class:'muted',text:'Loading…'})]);m.appendChild(box);
 api('GET','/v1/kb?scope=mine').then(function(d){box.textContent='';var docs=d.docs||[];if(!docs.length)box.appendChild(el('p',{class:'muted',text:'No docs yet.'}));
  docs.forEach(function(x){box.appendChild(el('div',{class:'card row',on:{click:function(){state.view='doc';state.doc=x.id;render();}}},[el('div',{},[el('b',{text:x.title}),el('span',{class:'chip',text:DOCST[x.status]||x.status})]),el('div',{class:'muted',text:x.category+' · updated '+x.updated_at_ist})]));});}).catch(function(e){box.textContent='';box.appendChild(el('p',{class:'err',text:e.message}));});}
function renderDoc(m){m.appendChild(el('button',{type:'button',text:'← My docs',on:{click:function(){state.view='docs';render();}}}));var box=el('div',{},[el('p',{class:'muted',text:'Loading…'})]);m.appendChild(box);
 api('GET','/v1/kb/'+encodeURIComponent(state.doc)).then(function(r){var d=r.doc||r;box.textContent='';var c=el('div',{class:'card'});box.appendChild(c);
  c.appendChild(el('h1',{},[d.title,el('span',{class:'chip',text:DOCST[d.status]||d.status})]));c.appendChild(el('p',{class:'muted',text:d.category+' · updated '+d.updated_at_ist}));c.appendChild(el('div',{class:'pre',text:d.body||''}));
  if(d.mine)c.appendChild(el('div',{class:'actions'},[el('button',{type:'button',text:'Edit',on:{click:function(){editDoc(d);}}})]));
  box.appendChild(el('h2',{text:'Files'}));var fc=el('div',{class:'card'},[fileList(d.files,'No files yet.')]);if(d.mine)fc.appendChild(uploader('/v1/kb/'+encodeURIComponent(d.id)+'/files',render));box.appendChild(fc);
 }).catch(function(e){box.textContent='';box.appendChild(el('p',{class:'err',text:e.message}));});}
function loadMe(){return api('GET','/v1/me').then(function(d){state.me=d;render();});}
loadMe().catch(function(){state.me=null;render();});
})();
</script>
</body>
</html>`;
