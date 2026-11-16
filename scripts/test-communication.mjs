import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const task=path.dirname(fileURLToPath(import.meta.url));
const runtime=process.env.DSH_TEST_RUNTIME || path.join(process.env.LOCALAPPDATA,'Programs/DeepSeek Harness/resources/app.asar/dsh');
async function pkg(name){const d=runtime+'/node_modules/@deepseek-ai/'+name;const m=JSON.parse(await fs.readFile(d+'/package.json','utf8'));return import(pathToFileURL(path.join(d,m.exports?.['.']?.default??m.main)).href);}
const runtimeVersion=JSON.parse(await fs.readFile(runtime+'/node_modules/@deepseek-ai/dsh/package.json','utf8')).version;
const boot=await pkg('dsh-app-boot'),cmdline=await pkg('dsh-cmdline');
const {SessionId}=await pkg('dsh-session');
const {LlmAdapter,createUserMessage}=await pkg('dsh-llm');
const {defineTool}=await pkg('dsh-tools');
const home=path.resolve(task,'../outputs/communication-qa-'+Date.now()),dir=home+'/profiles/spec',cwd=home+'/workspace';
process.env.DSH_HOME=home;
await fs.mkdir(dir+'/node_modules/@local',{recursive:true});await fs.mkdir(cwd,{recursive:true});
try{await fs.symlink(path.resolve(task,'../payload/dsh-ws-helper-preset'),dir+'/node_modules/@local/dsh-ws-helper-preset','junction');}catch(e){if(e.code!=='EEXIST')throw e;}
boot.initProfile(dir,['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@local/dsh-ws-helper-preset']);
const anchor=runtime+'/node_modules/@deepseek-ai/dsh/package.json';
const profile={name:'spec',dir,layers:[],patchPath:dir+'/cordis.patch.yml',patches:[],skippedBundles:[]};
const resolution=await boot.createRuntimeResolution({installAnchor:anchor,home,profile});
const patches=[];
for(const d of [runtime+'/node_modules/@deepseek-ai/dsh-base',runtime+'/node_modules/@deepseek-ai/dsh-web-app',path.resolve(task,'../payload/dsh-ws-helper-preset')]){const m=JSON.parse(await fs.readFile(d+'/package.json','utf8'));for(const f of boot.bundlePatchPaths(d,m.dsh.bundle))patches.push(...boot.loadOverlayPatches('communication-qa',f));}
const overrides=[{id:'storage-json',config:{root:home+'/storages'}},{id:'session-persistence-jsonl',config:{root:home+'/sessions'}},{id:'webserver',inject:[],config:{host:'127.0.0.1',port:0}},...['web-runtime','session-telemetry-otel','modules','open-in-app','session-log-download','client-hmr','hmr','directory-picker'].map(id=>({id,disabled:true})),{id:'connection',inject:['webServer'],config:{trustedHosts:[]}},{id:'agent-preset-registry',config:{default:'standard'}}];
await fs.writeFile(dir+'/cordis.yml','[]\n');
const ctx=await boot.boot('communication-qa',dir+'/cordis.yml',[...patches,...overrides],async b=>{b.provide('profileContext',{name:'spec',dir,patchPath:profile.patchPath,installAnchor:anchor,home,cwd,startedBundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@local/dsh-ws-helper-preset'],overlays:overrides,telemetryDisabledEnv:'1'});await b.plugin(boot.PluginPackages,{resolution});cmdline.provideCmdline(b,{args:[],exit:()=>{}});});

const text=m=>(m?.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
const user=s=>createUserMessage({content:[{type:'text',text:s}],source:{kind:'user'}});
const requests=[],auxiliary=[],executed=[];
let ready;
class Adapter extends LlmAdapter{
 async *stream(o){
  const aux=o.messages.some(m=>m.source?.kind==='ws-helper-ack-context');
  if(aux){
   assert.equal(o.tools.length,0);assert(!o.toolHistory);assert(!o.sessionId);assert(o.messages.every(m=>m.role==='system'||m.role==='user'));
   const context=JSON.parse(text(o.messages.at(-1))),label=context.newUserMessages;
   auxiliary.push(label);
   if(label==='CASE:cancel'||label==='CASE:correct'){ready?.();await delay(5000,undefined,{signal:o.signal});}
   if(label==='CASE:aux-failure'){yield {type:'reasoning-delta',index:0,text:'仅思考，没有正文。'};yield {type:'finish',reason:{kind:'stop'}};return;}
   if(label==='CASE:aux-phantom'){yield {type:'block-end',index:0,block:{type:'tool-call',id:'must-not-run',name:'qa_probe',arguments:{}}};yield {type:'finish',reason:{kind:'tool-calls'}};return;}
   if(label==='CASE:aux-error')throw Error('isolated auxiliary API failed');
   yield {type:'text-delta',index:0,text:'收到，按最新要求继续核对：'+label};
   yield {type:'usage',usage:{inputTokens:7,outputTokens:5,totalTokens:12,cacheReadTokens:3}};
   yield {type:'finish',reason:{kind:'stop'}};return;
  }
  const humans=o.messages.filter(m=>m.role==='user'&&m.source.kind==='user').map(text),label=humans.at(-1)||'';
  const results=o.messages.filter(m=>m.role==='tool');
  requests.push({label,tools:o.tools?.map(t=>t.name),markers:humans});
  const count=label==='CASE:stubborn'?3:1;
  if(label==='CASE:question'){yield {type:'text-delta',index:0,text:'直接回答这个问题。'};yield {type:'finish',reason:{kind:'stop'}};return;}
  if(results.length<count){
   if(label==='CASE:normal'){yield {type:'text-delta',index:0,text:'收到，先检查测试状态。'};}
   else {yield {type:'block-start',index:0,blockType:'reasoning'};yield {type:'reasoning-delta',index:0,text:'只思考，继续工具调用。'};yield {type:'block-end',index:0,block:{type:'reasoning',text:'只思考，继续工具调用。'}};}
   const id='probe-'+label+'-'+results.length;
   if(label==='CASE:delta'){
    yield {type:'block-start',index:1,blockType:'tool-call'};
    yield {type:'tool-call-delta',index:1,id,name:'qa_probe',argumentsDelta:'{'};
    yield {type:'tool-call-delta',index:1,id,argumentsDelta:'}'};
   }else{
    yield {type:'block-end',index:1,block:{type:'tool-call',id,name:'qa_probe',arguments:{}}};
    if(label==='CASE:parallel')yield {type:'block-end',index:2,block:{type:'tool-call',id:'parallel-second',name:'qa_probe',arguments:{}}};
   }
   yield {type:'usage',usage:{inputTokens:100,outputTokens:20,totalTokens:120,cacheReadTokens:50}};
   yield {type:'finish',reason:{kind:'tool-calls'},replayState:{response:{kind:'fixture',version:1},blocks:label==='CASE:parallel'?[{type:'reasoning'},{type:'tool-call'},{type:'tool-call'}]:label==='CASE:normal'?[{type:'text'},{type:'tool-call'}]:[{type:'reasoning'},{type:'tool-call'}]}};return;
  }
  yield {type:'text-delta',index:0,text:'测试任务完成。'};yield {type:'finish',reason:{kind:'stop'}};
 }
}
ctx.llm.registerAdapter(['communication-qa'],new Adapter());
async function make(label,preset='ws-helper',parent){
 return ctx.agents.create({sessionId:SessionId('stream-reply-'+label+'-'+Date.now()),...(parent?{parentAgent:parent}:{}),meta:{cwd,...(parent?{parentSession:parent.id,delegationDepth:1}:{})},agentOptions:{provider:'communication-qa',model:'test'},setup:async a=>{
  await ctx.agentPresets.mount(a,preset);
  a.tools.register(defineTool({name:'qa_probe',description:'Isolated fixture with no filesystem or network side effects.',parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async(_args,exec)=>{
   const events=[...exec.agent.session.ownEvents()];
   const latest=events.filter(e=>e.type==='user/message'&&e.data.source.kind==='user').at(-1);
   const beforeReply=events.find(e=>e.type==='assistant/message'&&e.seq>(latest?.seq??0)&&text(e.data.message));
   executed.push({id:exec.callId,session:exec.agent.id,label:text(latest?.data),reply:beforeReply?text(beforeReply.data.message):null});
   return 'fixture result';
  }}));
 }});
}
async function settle(a){let timer;try{await Promise.race([a.whenIdle(),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('fixture timeout')),12000))]);}finally{clearTimeout(timer);}const failures=[...a.session.ownEvents()].filter(e=>e.type==='turn/end'&&e.data.reason.kind==='error');assert.equal(failures.length,0,JSON.stringify(failures));}
const report={runtime:runtimeVersion,realModelCalls:0,checks:[]};
try{
 for(const label of ['normal','silent','stubborn','delta','parallel','aux-failure','aux-phantom','aux-error']){
  const h=await make(label);const before=auxiliary.length;try{
   h.agent.followup(user('CASE:'+label));await settle(h.agent);
   const events=[...h.agent.session.ownEvents()],calls=executed.filter(e=>e.session===h.agent.id);
   assert.equal(calls.length,label==='stubborn'?3:label==='parallel'?2:1);
   assert(calls.every(c=>c.reply),'Actual dispatch must follow visible text');
   assert.equal(auxiliary.length-before,label==='normal'?0:1,'At most one auxiliary response: '+JSON.stringify({label,before,auxiliary}));
   assert(!events.some(e=>e.type==='request/header'&&e.data.header?.tools?.length===1),'Tools must not be removed');
   assert(!events.some(e=>e.type==='user/message'&&e.data.source.kind==='ws-helper-continue'));
   assert(!events.some(e=>e.type==='tool/result'&&e.data.message.isError));
   if(label==='silent'){
    const first=events.find(e=>e.type==='assistant/message');assert.equal(first.data.usage.inputTokens,107);assert.equal(first.data.usage.outputTokens,25);assert.equal(first.data.usage.totalTokens,132);assert.equal(first.data.usage.cacheReadTokens,53);
    assert(!first.data.message.source.replayState,'Changed block content must not retain mismatched replay metadata');
   }
   if(label.startsWith('aux-'))assert(calls[0].reply.startsWith('[DSH 沟通提示]'),'Failure must be labeled as harness status');
   report.checks.push(label+': reply-before-original-tools-no-pause-no-replan');
  }finally{await h.dispose();}
 }
 const question=await make('question');const aq=auxiliary.length;try{question.agent.followup(user('CASE:question'));await settle(question.agent);assert.equal(auxiliary.length,aq);assert(!executed.some(e=>e.session===question.agent.id));report.checks.push('pure-question-no-extra-request-or-work');}finally{await question.dispose();}
 const standard=await make('standard','standard');const as=auxiliary.length;try{standard.agent.followup(user('CASE:standard'));await settle(standard.agent);assert.equal(auxiliary.length,as+1);assert(executed.some(e=>e.session===standard.agent.id&&e.reply));report.checks.push('active-fujiang-standard-preset-receives-acknowledgement');}finally{await standard.dispose();}
 const parent=await make('parent');const child=await make('child','ws-helper',parent.agent);const ac=auxiliary.length;try{child.agent.followup(user('CASE:child'));await settle(child.agent);assert.equal(auxiliary.length,ac);report.checks.push('subagent-does-not-reply-directly-to-user');}finally{await child.dispose();await parent.dispose();}
 const canceled=await make('cancel');try{const started=new Promise(r=>ready=r);canceled.agent.followup(user('CASE:cancel'));await started;canceled.agent.cancel({kind:'user',reason:'stop fixture'});await canceled.agent.whenIdle();assert(!executed.some(e=>e.session===canceled.agent.id));report.checks.push('user-cancel-during-supplement-prevents-original-tool-dispatch');}finally{ready=undefined;await canceled.dispose();}
 if(process.env.DSH_TEST_STEERING){
 const steering=await import(pathToFileURL(process.env.DSH_TEST_STEERING).href);
 await ctx.plugin(steering,{settleMs:0});
 const changed=await make('correct');try{let sent=false;ready=()=>{if(sent)return;sent=true;changed.agent.steer(user('CORRECTION:wrong'));changed.agent.steer(user('CORRECTION:final'));};changed.agent.followup(user('CASE:correct'));await settle(changed.agent);const calls=executed.filter(e=>e.session===changed.agent.id);assert.equal(calls.length,1);assert.equal(calls[0].label,'CORRECTION:final');assert(calls[0].reply.includes('CORRECTION:final'));assert(!calls[0].reply.includes('CASE:correct'));report.checks.push('latest-corrections-cancel-stale-supplement-and-tools');}finally{ready=undefined;await changed.dispose();}

 }
 await fs.writeFile(path.resolve(task,'../outputs/communication-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await ctx.fiber.dispose();}
