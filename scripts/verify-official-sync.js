'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const {parseArgs}=require('node:util');
const {values}=parseArgs({options:{vscode:{type:'string'},codex:{type:'string'},'official-extension':{type:'string'},payload:{type:'string'}}});
for(const key of ['vscode','codex','official-extension'])if(!values[key]||!path.isAbsolute(values[key]))throw Error('Provide absolute --vscode, --codex and --official-extension paths.');
const repository=path.resolve(__dirname,'..');fs.mkdirSync(path.join(repository,'.tmp'),{recursive:true});
const payload=values.payload?path.resolve(values.payload):repository;
const {SharedIntegration,OFFICIAL_VERSION}=require(path.join(payload,'extension/lib/shared-integration'));
const {en}=require(path.join(payload,'extension/lib/strings'));
const base=fs.mkdtempSync(path.join(repository,'.tmp','official-sync-')),binary=values.codex;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(base,{recursive:true});for(const n of ['project','user/User','host-tests','storage'])fs.mkdirSync(path.join(base,n),{recursive:true});
 fs.writeFileSync(path.join(base,'project/README.md'),'Synthetic production sync project.\n');
 for(const n of ['done','live-confirmed','completion-confirmed','mobile-thread','result.json','cancel-model-started'])try{fs.unlinkSync(path.join(base,n));}catch{}
 let finishResponse,calls=0,authenticatedCalls=0;
 const provider=http.createServer((req,res)=>{
  req.resume();calls++;if(req.headers.authorization!=='Bearer synthetic-live-key'){res.writeHead(401);res.end();return;}authenticatedCalls++;
  let text=calls===1?'Synthetic mobile live A':'Synthetic desktop follow-up confirmed';
  const item={id:'msg_synthetic_'+calls,type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text,annotations:[]}]};
  res.writeHead(200,{'Content-Type':'text/event-stream'});const emit=e=>res.write('event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n');
  emit({type:'response.created',response:{id:'resp_synthetic_'+calls,status:'in_progress',output:[]}});
  emit({type:'response.output_item.added',output_index:0,item:{...item,content:[]}});emit({type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:text});
  const pulse=[1,3].includes(calls)?setInterval(()=>{const delta=' Synthetic mobile progress';text+=delta;emit({type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta});},500):undefined;
  res.on('close',()=>clearInterval(pulse));
  const finish=()=>{clearInterval(pulse);if(calls===1){text+=' Synthetic mobile completed';emit({type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:' Synthetic mobile completed'});}item.content[0].text=text;
   emit({type:'response.output_item.done',output_index:0,item});emit({type:'response.completed',response:{id:'resp_synthetic_'+calls,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2,input_tokens_details:{cached_tokens:0}}}});res.end();};
  if(calls===1)finishResponse=finish;else if(calls===3)fs.writeFileSync(path.join(base,'cancel-model-started'),'ready');else finish();
 });
 await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 const home=fs.mkdtempSync(path.join(base,'home-'));
 fs.writeFileSync(path.join(home,'config.toml'),['model="synthetic-model"','model_provider="synthetic_auth"','cli_auth_credentials_store="file"','allow_remote_control=false','[analytics]','enabled=false',
  '[model_providers.synthetic_auth]','name="Synthetic production provider"','base_url="http://127.0.0.1:'+provider.address().port+'/v1"','wire_api="responses"','requires_openai_auth=true','request_max_retries=0','stream_idle_timeout_ms=100000'].join('\n'));
 const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','APPDATA','LOCALAPPDATA'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 Object.assign(env,{CODEX_HOME:home,NO_COLOR:'1',OPENAI_API_KEY:'synthetic-live-key',ANYDEVICE_POC_BASE:base,ANYDEVICE_SYNTHETIC_BINARY:binary,ANYDEVICE_REPO:payload});
 execFileSync(binary,['login','--with-api-key'],{input:'synthetic-live-key\n',env,stdio:['pipe','ignore','ignore'],timeout:10000,windowsHide:true});
 const storageBase=fs.mkdtempSync(path.join(base,'storage-'));
 env.ANYDEVICE_SYNTHETIC_STORAGE=storageBase;
 const setup=new SharedIntegration({extensions:{getExtension:()=>({packageJSON:{version:OFFICIAL_VERSION}})}},
  {globalStorageUri:{fsPath:storageBase},extensionUri:{fsPath:payload}},en,{run:async()=>({code:0,stdout:'codex-cli 0.162.0-alpha.17.2'})});
 const launcher=await setup.prepare({file:binary,prefix:[]});await setup.prepare({file:binary,prefix:[]});
 const profile=fs.mkdtempSync(path.join(base,'profile-'));fs.mkdirSync(path.join(profile,'User'));
 env.ANYDEVICE_SYNTHETIC_PROFILE=profile;
 fs.writeFileSync(path.join(profile,'User/settings.json'),JSON.stringify({'security.workspace.trust.enabled':false,'telemetry.telemetryLevel':'off','workbench.startupEditor':'none','update.mode':'none','extensions.autoUpdate':false,'chatgpt.cliExecutable':launcher,'chatgpt.openOnStartup':true}));
 env.ANYDEVICE_SYNTHETIC_LAUNCHER=launcher;
 const runtime=values.vscode,extensions=path.join(base,'extensions');fs.mkdirSync(extensions);const officialVersion=JSON.parse(fs.readFileSync(path.join(values['official-extension'],'package.json'),'utf8')).version;fs.cpSync(values['official-extension'],path.join(extensions,'openai.chatgpt-'+officialVersion),{recursive:true});
 const official=fs.readdirSync(extensions).find(n=>n.startsWith('openai.chatgpt-'));
 const log=fs.openSync(path.join(base,'host.log'),'w');
 const host=spawn(runtime,['--new-window','--user-data-dir='+profile,'--extensions-dir='+extensions,'--disable-workspace-trust','--skip-welcome','--skip-release-notes','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',
  '--extensionDevelopmentPath='+path.join(extensions,official),'--extensionTestsPath='+path.join(repository,'tests/host/official-sync.js'),path.join(base,'project')],{env,cwd:path.resolve(__dirname,'..'),stdio:['ignore',log,log],windowsHide:true,shell:false});
 let inspector;try{
  fs.writeFileSync(path.join(base,'owned-pids.json'),JSON.stringify({host:host.pid,main:process.pid}));
  for(let i=0;i<350;i++){if(fs.existsSync(path.join(base,'mobile-thread'))||fs.existsSync(path.join(base,'result.json')))break;await pause(100);}
  for(let i=0;i<100&&!finishResponse&&!fs.existsSync(path.join(base,'result.json'));i++)await pause(100);
  if(!finishResponse){
   const snapshot=spawn(process.execPath,[path.join(repository,'tests/host/inspect-official-sync.js'),'--snapshot'],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','pipe','ignore'],windowsHide:true});snapshot.stdout.pipe(process.stdout);await new Promise(r=>snapshot.on('exit',r));
   console.log(JSON.stringify({hostStage:fs.existsSync(path.join(base,'host-stage.json'))?fs.readFileSync(path.join(base,'host-stage.json'),'utf8'):'not-run',diagnosticDirectory:path.basename(base)}));
  }assert.ok(finishResponse,'Production phone turn was submitted');
  inspector=spawn(process.execPath,[path.join(repository,'tests/host/inspect-official-sync.js')],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','pipe','ignore'],windowsHide:true});inspector.stdout.pipe(process.stdout);
  const inspectDone=new Promise(r=>inspector.on('exit',r));
  for(let i=0;i<350;i++){if(fs.existsSync(path.join(base,'live-confirmed'))||inspector.exitCode!==null)break;await pause(100);}
  const live=fs.existsSync(path.join(base,'live-confirmed'));console.log(JSON.stringify({productionNativeUiLiveObserved:live}));finishResponse();
  const code=await inspectDone;fs.writeFileSync(path.join(base,'done'),'done');
  for(let i=0;i<300;i++){try{if(JSON.parse(fs.readFileSync(path.join(base,'result.json'),'utf8')).recoveryCompleted)break;}catch{}await pause(100);}
  const result=JSON.parse(fs.readFileSync(path.join(base,'result.json'),'utf8'));
  console.log(JSON.stringify({productionResult:result,inspectionExit:code,localMockCalls:calls,authenticatedCalls,realModelCalls:0}));assert.ok(live);assert.equal(code,0);assert.equal(calls,4);assert.equal(authenticatedCalls,4);assert.equal(result.status,'completed');assert.equal(result.cancelled,true);assert.equal(result.recoveryCompleted,true);assert.equal(result.sameThreadPhoneResumed,true);assert.equal(result.externalProject,true);assert.equal(result.dialogueHistoryRead,true);
 }finally{fs.writeFileSync(path.join(base,'done'),'cleanup');inspector?.kill();host.kill();provider.closeAllConnections();await new Promise(r=>provider.close(r));}
})().catch(e=>{console.log(JSON.stringify({failure:e.code||(/^[\w-]+$/.test(e.message)?e.message:'synthetic-production-failed')}));process.exitCode=1;});
