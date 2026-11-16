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
const mobile = process.env.DSH_TEST_MOBILE === '1';
const bundleName = mobile ? 'dsh-fujiang-mobile' : '@local/dsh-ws-helper-preset';
const bundleDir = path.resolve(task, mobile ? '..' : '../payload/dsh-ws-helper-preset');
const home=path.resolve(task,'../outputs/upstream-qa-'+(mobile?'mobile-':'desktop-')+process.pid+'-'+Date.now()),dir=home+'/profiles/spec',cwd=home+'/workspace';
process.env.DSH_HOME=home;
const localSkillDir=path.join(home,'skills','existing-user-fixture');
await fs.mkdir(localSkillDir,{recursive:true});
await fs.writeFile(path.join(localSkillDir,'SKILL.md'),'---\nname: existing-user-fixture\ndescription: Verify preservation of a previously installed user skill.\n---\nSynthetic local skill for integration checks.\n');
await fs.mkdir(dir+'/node_modules/@local',{recursive:true});await fs.mkdir(cwd,{recursive:true});
await fs.symlink(bundleDir,path.join(dir,'node_modules',bundleName),'junction');
const bundles=['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app',bundleName];
boot.initProfile(dir,bundles);
const anchor=runtime+'/node_modules/@deepseek-ai/dsh/package.json';
const profile={name:'spec',dir,layers:[],patchPath:dir+'/cordis.patch.yml',patches:[],skippedBundles:[]};
const resolution=await boot.createRuntimeResolution({installAnchor:anchor,home,profile});
const patches=[];
for(const d of [runtime+'/node_modules/@deepseek-ai/dsh-base',runtime+'/node_modules/@deepseek-ai/dsh-web-app',bundleDir]){const m=JSON.parse(await fs.readFile(d+'/package.json','utf8'));for(const f of boot.bundlePatchPaths(d,m.dsh.bundle))patches.push(...boot.loadOverlayPatches('communication-qa',f));}
const overrides=[{id:'storage-json',config:{root:home+'/storages'}},{id:'session-persistence-jsonl',config:{root:home+'/sessions'}},{id:'webserver',inject:[],config:{host:'127.0.0.1',port:0}},...['web-runtime','session-telemetry-otel','modules','open-in-app','session-log-download','client-hmr','hmr','directory-picker'].map(id=>({id,disabled:true})),{id:'connection',inject:['webServer'],config:{trustedHosts:[]}},{id:'agent-preset-registry',config:{default:'standard'}}];
await fs.writeFile(dir+'/cordis.yml','[]\n');
const ctx=await boot.boot('communication-qa',dir+'/cordis.yml',[...patches,...overrides],async b=>{b.provide('profileContext',{name:'spec',dir,patchPath:profile.patchPath,installAnchor:anchor,home,cwd,startedBundles:bundles,overlays:overrides,telemetryDisabledEnv:'1'});await b.plugin(boot.PluginPackages,{resolution});cmdline.provideCmdline(b,{args:[],exit:()=>{}});});


const origin = ctx.webServer.getOrigin();
const checks = [];
async function api(route, body) {
  const response = await fetch(origin + '/api/dsh-prompt-custom/' + route, {
    method: body ? 'POST' : 'GET',
    headers: {'content-type':'application/json', 'x-dsh-ui':'1'},
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  const data = await response.json();
  assert(response.ok, JSON.stringify({route, status:response.status, data}));
  return data;
}
const defaults = JSON.parse(await fs.readFile(path.resolve(task,'../payload/dsh-ws-helper-preset/upstream/default-prompt.json'),'utf8'));
const text = message => (message?.content ?? []).filter(block=>block.type==='text').map(block=>block.text).join('\n');
let auxiliaryCalls = 0;
let dispatched = 0;
let receivedReplyBeforeTool = false;
let campaignId;
let catalogConfirmed = false;
let localSkillConfirmed = false;
class Adapter extends LlmAdapter {
  async *stream(options) {
    if (options.messages.some(message=>message.source?.kind==='ws-helper-ack-context')) {
      auxiliaryCalls++;
      yield {type:'text-delta', index:0, text:'收到你的调整，我会先核对新目标，再继续当前任务。'};
      yield {type:'finish', reason:{kind:'stop'}};
      return;
    }
    if (options.messages.some(message=>message.source?.kind==='skill-catalog' && text(message).includes('kb-triage'))) catalogConfirmed = true;
    if (options.messages.some(message=>message.source?.kind==='skill-catalog' && text(message).includes('existing-user-fixture'))) localSkillConfirmed = true;
    if (!options.messages.some(message=>message.role==='tool')) {
      const latest = options.messages.filter(message=>message.role==='user'&&message.source.kind==='user').map(text).at(-1);
      if (latest === 'NATIVE_TOOLS_QA') {
        const calls = [
          ['kb_match',{banner:'Apache Tomcat',product:'Tomcat',port:8080}],
          ['skill_search',{query:'triage',limit:2}],
          ['skill_read',{name:'kb-triage',maxBytes:1000}],
          ['finding_upsert',{title:'Native QA finding',severity:'info',target:'example.invalid',evidence:'Synthetic record',verified:false}],
          ['campaign_upsert',{campaignId,command:'in-memory fixture',result:'Native bookkeeping verified'}],
          ['pipeline_next',{campaignId}],
        ];
        for (const [index,[name,args]] of calls.entries()) {
          yield {type:'block-end',index,block:{type:'tool-call',id:'native-'+index,name,arguments:args}};
        }
        yield {type:'finish',reason:{kind:'tool-calls'}};
        return;
      }
      yield {type:'block-end', index:0, block:{type:'tool-call',id:'probe',name:'qa_work',arguments:{}}};
      yield {type:'finish',reason:{kind:'tool-calls'}};
      return;
    }
    yield {type:'text-delta',index:0,text:'隔离夹具工作完成。'};
    yield {type:'finish',reason:{kind:'stop'}};
  }
}
ctx.llm.registerAdapter(['upstream-qa'],new Adapter());
const handles=[];
async function make(preset='ws-helper') {
  const handle=await ctx.agents.create({
    sessionId:SessionId('upstream-'+preset+'-'+Date.now()),
    meta:{cwd}, agentOptions:{provider:'upstream-qa',model:'fixture'},
    setup:async agent=>{
      await ctx.agentPresets.mount(agent,preset);
      agent.tools.register(defineTool({
        name:'qa_work', description:'Harmless in-memory integration fixture.', parameters:{},
        output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
        execute:async(_args,execution)=>{
          dispatched++;
          receivedReplyBeforeTool=[...execution.agent.session.ownEvents()].some(event=>event.type==='assistant/message' && text(event.data.message));
          return 'fixture evidence';
        },
      }));
    },
  });
  handles.push(handle);
  return handle;
}
async function settle(agent) {
  let timer;
  try {
    await Promise.race([agent.whenIdle(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Agent timeout')),15000);})]);
  } finally { clearTimeout(timer); }
  const failures=[...agent.session.ownEvents()].filter(event=>event.type==='turn/end'&&event.data.reason.kind==='error');
  assert.equal(failures.length,0,JSON.stringify(failures));
}
try {
  const config=await api('config');
  assert.equal(config.config.text,defaults.text);
  assert.equal(config.config.enabled,true);
  assert(!config.config.text.includes('爸爸'));
  assert(!config.config.text.includes('@DeepSeek22'));
  assert(config.config.text.includes('especially erotic'));
  checks.push('bundled-default-style-and-address-adjustments');
  assert(config.config.text.includes('默认不用标题、表格、编号、分条'));
  assert(config.config.text.includes('完整代码或报告时，按要求完整交付'));
  assert(!config.config.text.includes('The structure is principle -> steps -> implementation -> verification'));
  checks.push('concise-final-default-with-complete-artifact-exception');

  await delay(100);
  const knowledge=await api('knowledge');
  assert.equal(knowledge.categories.length,9);
  assert(knowledge.total>100);
  const skills=await api('skills');
  assert(skills.skills.some(skill=>skill.id==='rea'));
  assert(skills.skills.some(skill=>skill.id==='aboutsecurity'));
  checks.push('knowledge-nine-categories-and-on-demand-skill-catalog');

  const campaign=await api('campaigns',{action:'create',name:'QA fixture',objective:'Check local bookkeeping',scope:{domains:['example.invalid']},autopilot:false});
  assert(campaign.item.id);
  campaignId = campaign.item.id;
  const handle=await make();
  let assembly=await ctx.systemPrompt.assemble({agent:handle.agent,scope:handle.agent});
  for(const name of ['kb_match','campaign_upsert','finding_upsert','skill_search','skill_read','pipeline_next','list_agents','subagent']) {
    assert(assembly.tools.some(tool=>tool.name===name),'Missing native tool '+name);
  }
  checks.push('upstream-six-tools-and-native-subagent-catalog');

  const initial=await api('preview');
  assert(initial.effective.includes(defaults.text));
  assert(!initial.effective.includes('渗透作业链（固定规则）'));
  await api('config',{text:'QA editable persona',cards:[{id:'qa',name:'QA card',text:'QA editable persona'}]});
  assert((await api('preview')).effective.includes('QA editable persona'));
  await api('toggle',{enabled:false});
  assert(!(await api('preview')).effective.includes('QA editable persona'));
  await api('config',defaults);
  checks.push('editable-prompt-cards-live-toggle-and-restore');

  await api('findings',{title:'QA finding',severity:'info',target:'example.invalid',evidence:'Synthetic record',verified:false});
  assert((await api('findings')).items.some(item=>item.title==='QA finding'));
  assert((await (await fetch(origin+'/api/dsh-prompt-custom/findings.md')).text()).includes('QA finding'));
  checks.push('persistent-findings-and-markdown-export');

  const before=auxiliaryCalls;
  await api('campaigns',{action:'bind',id:campaign.item.id,sessionId:handle.agent.id});
  await settle(handle.agent);
  assert(catalogConfirmed,'Knowledge skills must reach the actual model request');
  assert(localSkillConfirmed,'Existing local user skills must remain discoverable');
  assert.equal(auxiliaryCalls,before,'Automation must not trigger human acknowledgement');
  assert([...handle.agent.session.ownEvents()].some(event=>event.type==='user/message'&&event.data.source.kind==='fujiang-campaign'));
  await api('campaigns',{action:'advance',id:campaign.item.id});
  const next=await api('campaigns',{action:'next',id:campaign.item.id});
  assert.equal(next.next.stage,'fingerprint');
  checks.push('bound-campaign-progress-and-machine-message-source');

  const human=await make('standard');
  human.agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'按新的目标继续处理这个夹具。'}]}));
  await settle(human.agent);
  assert.equal(auxiliaryCalls,before+1);
  assert(receivedReplyBeforeTool);
  assert.equal(dispatched,2);
  checks.push('human-interjection-replied-before-tools-task-continues');
  const native = await make();
  native.agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'NATIVE_TOOLS_QA'}]}));
  await settle(native.agent);
  const results = [...native.agent.session.ownEvents()].filter(event=>event.type==='tool/result');
  assert.equal(results.length,6);
  assert(results.every(event=>!event.data.message.isError),JSON.stringify(results));
  checks.push('all-six-upstream-tools-executed-through-native-agent-loop');
  await api('campaigns',{action:'done',id:campaign.item.id,note:'Fixture complete'});
  const report={runtime:runtimeVersion,bundle:bundleName,realModelCalls:0,knowledgeEntries:knowledge.total,checks};
  const reportName = mobile ? 'mobile-runtime-verification.json' : 'upstream-verification.json';
  await fs.writeFile(path.resolve(task,'../outputs/'+reportName),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {
  for(const handle of handles.reverse()) await handle.dispose();
  await ctx.fiber.dispose();
}
