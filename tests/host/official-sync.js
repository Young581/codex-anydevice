'use strict';
const vscode=require('vscode'),fs=require('node:fs/promises'),path=require('node:path');
async function run(){
 const base=process.env.ANYDEVICE_POC_BASE;
 const taskProject=path.join(base,'task-project');
 await fs.mkdir(taskProject,{recursive:true});await fs.writeFile(path.join(taskProject,'README.md'),'Synthetic task project outside the open workspace.\n');
 await fs.writeFile(path.join(base,'host-stage.json'),'started');
 const {SharedIntegration,KEY}=require(path.join(process.env.ANYDEVICE_REPO,'extension/lib/shared-integration'));
 const {connectTransport}=require(path.join(process.env.ANYDEVICE_REPO,'extension/lib/shared-integration'));
 const {en}=require(path.join(process.env.ANYDEVICE_REPO,'extension/lib/strings'));
 const data=new Map([[KEY,{enabled:true,launcher:process.env.ANYDEVICE_SYNTHETIC_LAUNCHER}]]);
 const context={globalStorageUri:vscode.Uri.file(process.env.ANYDEVICE_SYNTHETIC_STORAGE),globalState:{get:k=>data.get(k)},extensionUri:vscode.Uri.file(process.env.ANYDEVICE_REPO)};
 const shared=new SharedIntegration(vscode,context,en),spec={file:process.env.ANYDEVICE_SYNTHETIC_BINARY,prefix:[]};
 await vscode.extensions.getExtension('openai.chatgpt').activate();let session,cancelSession,recoverySession;
 try{
  for(let i=0;i<60;i++)try{session=await shared.createSession(spec);session.on('phase',p=>{void fs.writeFile(path.join(base,'host-stage.json'),p);});await session.start(taskProject);break;}catch(e){await fs.writeFile(path.join(base,'host-stage.json'),JSON.stringify({attempt:i,error:e.message}));session?.stop();session=undefined;await new Promise(r=>setTimeout(r,100));}
  if(!session)throw Error('synthetic-client-not-ready');
  const descriptor=await shared.descriptor(spec);let authRejected=false;
  try{await connectTransport({...descriptor,token:'A'.repeat(43)},()=>{},()=>{});}catch(e){authRejected=e.message==='syncUnavailable';}
  if(!authRejected)throw Error('synthetic-auth-not-enforced');
  session.on('thread',id=>{void fs.writeFile(path.join(base,'mobile-thread'),id);});
  const result=await session.execute('Return a live message without using tools.',taskProject);
  await fs.writeFile(path.join(base,'result.json'),JSON.stringify({status:result.status,error:result.error,phase:result.phase,authRejected}));
  for(let i=0;i<250;i++){try{await fs.access(path.join(base,'done'));break;}catch{}await new Promise(r=>setTimeout(r,100));}
  session.stop();await new Promise(r=>setTimeout(r,300));
  cancelSession=await shared.createSession(spec);await cancelSession.start(taskProject);
  const dialogue=await cancelSession.readHistory(result.threadId,taskProject);
  if(!dialogue.text.includes('Continue this same synthetic conversation'))throw Error('synthetic-history-not-read');
  let cancelOutcome;
  const cancelling=cancelSession.execute('Return a live cancellable synthetic message without using tools.',taskProject,result.threadId).then(value=>{cancelOutcome=value;return value;});
  for(let i=0;i<250;i++){if(cancelOutcome)throw Error(cancelOutcome.error||'synthetic-cancel-ended-early');try{await fs.access(path.join(base,'cancel-model-started'));break;}catch{}await new Promise(r=>setTimeout(r,100));}
  await fs.access(path.join(base,'cancel-model-started'));await cancelSession.interrupt();const cancelled=(await cancelling).status==='cancelled';
  cancelSession.stop();await new Promise(r=>setTimeout(r,300));
  recoverySession=await shared.createSession(spec);await recoverySession.start(taskProject);
  const recovery=await recoverySession.execute('Return one synthetic message without using tools.',taskProject,result.threadId);
  await fs.writeFile(path.join(base,'result.json'),JSON.stringify({status:result.status,authRejected,cancelled,recoveryCompleted:recovery.status==='completed',sameThreadPhoneResumed:recovery.threadId===result.threadId,externalProject:true,dialogueHistoryRead:true,realApprovalsClicked:0}));
 }catch(e){await fs.writeFile(path.join(base,'result.json'),JSON.stringify({failure:e.message}));throw e;}finally{session?.stop();cancelSession?.stop();recoverySession?.stop();}
}
module.exports={run};
