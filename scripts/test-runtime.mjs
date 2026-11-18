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
const fujiangRoot=path.join(home,'fujiang-skills');
const aboutSkillDir=path.join(fujiangRoot,'aboutsecurity','skills','active-directory','synthetic-ad-attack');
await fs.mkdir(aboutSkillDir,{recursive:true});
await fs.writeFile(path.join(fujiangRoot,'.fujiang-owner.json'),JSON.stringify({owner:'dsh-prompt-custom:skill-library:v1'}));
await fs.writeFile(path.join(fujiangRoot,'aboutsecurity','.fujiang-owner.json'),JSON.stringify({owner:'dsh-prompt-custom:skill-library:v1'}));
await fs.writeFile(path.join(fujiangRoot,'aboutsecurity-state.json'),JSON.stringify({schema:1,enabled:true}));
await fs.writeFile(path.join(aboutSkillDir,'SKILL.md'),'---\nname: synthetic-ad-attack\ndescription: Synthetic AD methodology fixture that must stay out of Turn-1 skill-catalog.\n---\n'+'# Synthetic AD Attack\n'+('AD_METHODOLOGY_LINE '.repeat(280))+'\nEND_OF_LONG_SKILL_MARKER\n');
await fs.mkdir(dir+'/node_modules/@local',{recursive:true});await fs.mkdir(cwd,{recursive:true});
await fs.symlink(bundleDir,path.join(dir,'node_modules',bundleName),'junction');
const bundles=['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app',bundleName];
const savedPromptFixture = process.env.DSH_TEST_PROMPT_FIXTURE ? JSON.parse(await fs.readFile(process.env.DSH_TEST_PROMPT_FIXTURE, 'utf8')) : null;
if (savedPromptFixture) await fs.writeFile(path.join(home, 'prompt-custom.json'), JSON.stringify(savedPromptFixture.config));
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
let aboutIndexConfirmed = false;
let aboutLeafLeaked = false;
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
    if (options.messages.some(message=>message.source?.kind==='skill-catalog' && text(message).includes('aboutsecurity-index'))) aboutIndexConfirmed = true;
    if (options.messages.some(message=>message.source?.kind==='skill-catalog' && text(message).includes('synthetic-ad-attack'))) aboutLeafLeaked = true;
    if (!options.messages.some(message=>message.role==='tool')) {
      const latest = options.messages.filter(message=>message.role==='user'&&message.source.kind==='user').map(text).at(-1);
      if (latest === 'NATIVE_TOOLS_QA') {
        const calls = [
          ['kb_match',{banner:'Apache Tomcat',product:'Tomcat',port:8080}],
          ['skill_search',{query:'synthetic-ad-attack',limit:2}],
          ['skill_read',{name:'synthetic-ad-attack'}],
          ['finding_upsert',{title:'Native QA finding',severity:'info',target:'example.invalid',evidence:'Synthetic record',verified:false}],
          ['campaign_upsert',{campaignId,command:'in-memory fixture',result:'Native bookkeeping verified'}],
          ['pipeline_next',{campaignId}],
          ['ws_helper_find_tools',{query:'heavy_procedure_dump',limit:3}],
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
      agent.tools.register(defineTool({
        name:'mcp__qa__open_binary', description:'MCP entry point fixture.', parameters:{},
        output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
        execute:async()=>'opened',
      }));
      agent.tools.register(defineTool({
        name:'mcp__qa__heavy_procedure_dump', description:'Heavy non-entry MCP tool fixture that must stay out of initial assembly.', parameters:{},
        output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
        execute:async()=>'dumped',
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
  const expectedInitialText = savedPromptFixture?.expect === 'preserve' ? savedPromptFixture.config.text : defaults.text;
  assert.equal(config.config.text,expectedInitialText);
  if (savedPromptFixture) {
    assert.deepEqual(config.config.cards,savedPromptFixture.config.cards);
    const backups = (await fs.readdir(home)).filter(name=>name.startsWith('prompt-custom.json.before-default-update-'));
    assert.equal(backups.length,savedPromptFixture.expect === 'migrate' ? 1 : 0);
    if (backups.length) assert.equal(JSON.parse(await fs.readFile(path.join(home,backups[0]),'utf8')).text,savedPromptFixture.config.text);
    checks.push('saved-persona-'+savedPromptFixture.expect+'-with-cards-preserved');
  }
  assert.equal(config.config.enabled,true);
  assert(!defaults.text.includes('爸爸'));
  assert(!defaults.text.includes('yandere'));
  assert(!defaults.text.includes('@DeepSeek22'));
  assert(defaults.text.includes('## Activation'));
  const upstreamClientSource = await fs.readFile(path.resolve(task,'../payload/dsh-ws-helper-preset/upstream/lib/client.js'),'utf8');
  assert(!upstreamClientSource.includes('DisclaimerGate'));
  assert(!upstreamClientSource.includes('免责声明与使用须知'));
  const shutdownResponse = await fetch(origin + '/api/dsh-prompt-custom/shutdown', {
    method: 'POST',
    headers: {'content-type':'application/json', 'x-dsh-ui':'1'},
    body: '{}',
  });
  assert.notEqual(shutdownResponse.status, 200);
  checks.push('bundled-default-style-and-address-adjustments');
  assert(defaults.text.includes('不同事项用空行分成自然段'));
  assert(defaults.text.includes('不卡死固定字数上限'));
  assert(defaults.text.includes('完整代码或报告时不受四到六句话限制，完整交付'));
  assert(!defaults.text.includes('The structure is principle -> steps -> implementation -> verification'));
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
  for(const name of ['kb_match','campaign_upsert','finding_upsert','skill_search','skill_read','pipeline_next','list_agents','subagent','list_subagent_models']) {
    assert(assembly.tools.some(tool=>tool.name===name),'Missing native tool '+name);
  }
  const subagentSchema = JSON.stringify(assembly.tools.find(tool=>tool.name==='subagent')?.parameters ?? {});
  assert(subagentSchema.includes('"provider"') && subagentSchema.includes('"model"'), 'ws-helper subagent must expose provider/model selection parameters');
  assert(assembly.tools.some(tool=>tool.name==='mcp__qa__open_binary'), 'Entry-point MCP tools must stay visible on Turn 1');
  assert(!assembly.tools.some(tool=>tool.name==='mcp__qa__heavy_procedure_dump'), 'Non-entry MCP tools must be filtered out of Turn-1 assembly');
  checks.push('upstream-six-tools-and-native-subagent-catalog');

  const initial=await api('preview');
  assert(initial.effective.includes((await pkg('dsh-system-prompt')).renderPrompt({...assembly,sections:[{name:'expected-persona',text:expectedInitialText}]})));
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
  assert(aboutIndexConfirmed,'AboutSecurity compact index gateway must reach skill-catalog');
  assert(!aboutLeafLeaked,'AboutSecurity leaf skills must not bloat Turn-1 skill-catalog');
  const fullSnapshot = await ctx.skills.snapshot({cwd, scope: handle.agent});
  const leafSkill = fullSnapshot.skills.find(s => s.name === 'synthetic-ad-attack');
  assert(leafSkill && leafSkill.invocation.userInvocable === true && leafSkill.invocation.modelInvocable === false, 'AboutSecurity leaf skills must remain user-invocable while modelInvocable=false');
  checks.push('aboutsecurity-on-demand-gateway-without-catalog-bloat');
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
  assert.equal(results.length,7);
  assert(results.every(event=>!event.data.message.isError),JSON.stringify(results));
  const skillReadResult = text(results[2].data.message);
  assert(skillReadResult.includes('[Base directory:'), 'skill_read must expose skill base directory');
  assert(skillReadResult.includes('END_OF_LONG_SKILL_MARKER') && skillReadResult.length > 5000, 'skill_read must not truncate SKILL.md at 4000 chars');
  const postDiscoveryAssembly = await ctx.systemPrompt.assemble({agent:native.agent,scope:native.agent});
  assert(postDiscoveryAssembly.tools.some(tool=>tool.name==='mcp__qa__heavy_procedure_dump'), 'Discovered MCP tools must appear in subsequent assembly');
  checks.push('on-demand-mcp-tool-filtering-and-discovery-verified');
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
