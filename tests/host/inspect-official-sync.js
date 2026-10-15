'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.ANYDEVICE_POC_BASE,pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 assert.ok(process.env.ANYDEVICE_SYNTHETIC_PROFILE,'Synthetic profile is required');
 let remote;for(let i=0;i<100;i++){try{
  const [port,browser]=String(await fs.readFile(path.join(process.env.ANYDEVICE_SYNTHETIC_PROFILE,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);
  assert.match(port,/^[1-9]\d{0,4}$/);assert.ok(Number(port)<=65535);assert.match(browser,/^\/devtools\/browser\/[a-f0-9-]+$/);
  const candidate=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json(),endpoint=new URL(candidate.webSocketDebuggerUrl);
  assert.equal(endpoint.protocol,'ws:');assert.equal(endpoint.hostname,'127.0.0.1');assert.equal(endpoint.port,port);assert.equal(endpoint.pathname,browser);
  remote=candidate;break;
 }catch{await pause(200);}}
 assert.ok(remote);const ws=new WebSocket(remote.webSocketDebuggerUrl);let next=0;const pending=new Map(),contexts=new Map(),attached=new Map(),exceptions=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error('cdp-failed')):p.resolve(m.result);}}
  else if(m.method==='Runtime.executionContextCreated'){const c=m.params.context;if(c.auxData?.isDefault)contexts.set(m.sessionId+':'+c.id,{sessionId:m.sessionId,id:c.id});}
  else if(m.method==='Runtime.executionContextDestroyed')contexts.delete(m.sessionId+':'+m.params.executionContextId);
  else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text);});
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next,t=setTimeout(()=>{pending.delete(id);reject(Error('cdp-timeout'));},5000);
  pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});ws.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});
 const evaluate=(context,expression)=>call('Runtime.evaluate',{contextId:context.id,returnByValue:true,expression},context.sessionId).then(r=>r.result?.value);
 let panel,lastSummary;
 for(let i=0;i<180;i++){
  const {targetInfos}=await call('Target.getTargets');
  for(const target of targetInfos.filter(t=>['page','iframe'].includes(t.type))){if(attached.has(target.targetId))continue;
   const {sessionId}=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true});attached.set(target.targetId,{sessionId,type:target.type,url:target.url});await call('Runtime.enable',{},sessionId);}
  for(const c of contexts.values())try{
   const summary=await evaluate(c,`({live:document.body.innerText.includes('Synthetic mobile progress'),signIn:/sign in|log in/i.test(document.body.innerText),
    textLength:document.body.innerText.length,inputCount:document.querySelectorAll('textarea,[contenteditable="true"]').length})`);
   if(summary?.live){panel=c;lastSummary=summary;break;}
   if(summary?.inputCount||summary?.signIn)lastSummary=summary;
  }catch{}
  if(process.argv.includes('--snapshot')&&i===8){const details=[];for(const c of contexts.values())try{details.push(await evaluate(c,`({href:location.protocol,ready:document.readyState,body:document.body.innerText.slice(0,3500),html:document.body.innerHTML.slice(0,2200),scripts:[...document.scripts].map(s=>s.src.split('/').at(-1))})`));}catch{}await fs.writeFile(path.join(base,'startup-inspection.json'),JSON.stringify({lastSummary,details,exceptions}));ws.close();return;}
  if(panel)break;await pause(150);
 }
 console.log(JSON.stringify({nativeUiLiveSummary:lastSummary}));
 if(!panel){const details=[];for(const c of contexts.values())try{details.push(await evaluate(c,`({href:location.protocol,body:document.body.innerText.slice(0,2200)})`));}catch{}await fs.writeFile(path.join(base,'inspection-failed.json'),JSON.stringify({lastSummary,details}));ws.close();throw Error('native-ui-live-not-visible');}
 await fs.writeFile(path.join(base,'live-confirmed'),'true');
 let completed=false;
 for(let i=0;i<120;i++){completed=await evaluate(panel,`document.body.innerText.includes('Synthetic mobile completed')`);if(completed)break;await pause(100);}
 assert.ok(completed);
 const composed=await evaluate(panel,`(()=>{const el=document.querySelector('textarea')||document.querySelector('[contenteditable="true"]');if(!el)return false;
  el.focus();if(el.tagName==='TEXTAREA'){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Continue this same synthetic conversation without using tools.');el.dispatchEvent(new Event('input',{bubbles:true}));}
  else{document.execCommand('insertText',false,'Continue this same synthetic conversation without using tools.');}return true;})()`);
 assert.ok(composed);await pause(200);
 // Synthetic composer input only. This does not press or bypass an approval dialog.
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},panel.sessionId);
 await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},panel.sessionId);
 let continued=false;for(let i=0;i<100;i++){continued=await evaluate(panel,`document.body.innerText.includes('Synthetic desktop follow-up confirmed')`);if(continued)break;await pause(100);}
 console.log(JSON.stringify({nativeUiCompleted:completed,nativeUiSameThreadContinued:continued}));assert.ok(continued);
 const workbench=[...attached.values()].find(t=>t.type==='page'&&t.url.includes('workbench'));
 if(workbench){await call('Page.enable',{},workbench.sessionId);const capture=await call('Page.captureScreenshot',{format:'png'},workbench.sessionId);await fs.writeFile(path.join(base,'native-ui.png'),Buffer.from(capture.data,'base64'));}
 await fs.writeFile(path.join(base,'completion-confirmed'),'true');ws.close();
})().catch(e=>{console.log(JSON.stringify({inspectionFailure:e.message}));process.exitCode=1;});
