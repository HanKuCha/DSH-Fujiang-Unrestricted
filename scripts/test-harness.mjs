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
const home=path.resolve(task,'../outputs/harness-qa-'+(mobile?'mobile-':'desktop-')+process.pid+'-'+Date.now()),dir=home+'/profiles/spec',cwd=home+'/workspace';
process.env.DSH_HOME=home;
const localSkillDir=path.join(home,'skills','existing-user-fixture');
await fs.mkdir(localSkillDir,{recursive:true});
await fs.writeFile(path.join(localSkillDir,'SKILL.md'),'---\nname: existing-user-fixture\ndescription: Verify preservation of a previously installed user skill.\n---\nSynthetic local skill for integration checks.\n');
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


const text = message => (message?.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n');
const user = value => createUserMessage({source: {kind: 'user'}, content: [{type: 'text', text: value}]});
const {setSandboxMode} = await pkg('dsh-sandbox-policy');
const calls = [];
const snapshots = [];
let terminalId;
let jobId;
let waitStarted;
const startedWait = new Promise(resolve => { waitStarted = resolve; });
const noop = (name, parameters = {}) => defineTool({
  name, description: 'Harmless in-memory tool for ' + name, parameters,
  output: {schema: {type: 'string'}, render: (_args, value) => [{type: 'text', text: value}]},
  execute: async args => { calls.push({name, args}); return 'Memory fixture completed'; },
});
for (const name of ['open_binary', 'binary_session', 'inspect_artifact', 'alpha', 'beta']) {
  ctx.tools.register(noop('mcp__qa__' + name, name === 'alpha' ? {value: {type: 'string', required: true}} : {}));
}
function emitCall(name, args) {
  return {type: 'block-end', index: 0, block: {type: 'tool-call', id: name + '-' + Date.now(), name, arguments: JSON.stringify(args)}};
}
class Adapter extends LlmAdapter {
  async *stream(options) {
    if (options.messages.some(message => message.source?.kind === 'ws-helper-ack-context')) {
      yield {type: 'text-delta', index: 0, text: '收到，按当前目标继续。'};
      yield {type: 'finish', reason: {kind: 'stop'}};
      return;
    }
    const index = options.messages.findLastIndex(message => message.source?.kind === 'user');
    const label = text(options.messages[index]);
    const results = options.messages.slice(index + 1).filter(message => message.role === 'tool');
    const names = options.tools.map(tool => tool.name);
    snapshots.push({label, names});
    if (label === 'DISCOVERY') {
      assert(names.includes('ws_helper_find_tools'));
      assert(names.includes('mcp__qa__open_binary'));
      assert(!names.includes('mcp__qa__beta'));
      if (!results.length) {
        assert(!names.includes('mcp__qa__alpha'));
        yield emitCall('ws_helper_find_tools', {query: 'mcp__qa__alpha'});
      } else if (results.length === 1) {
        assert(names.includes('mcp__qa__alpha'));
        yield emitCall('mcp__qa__alpha', {value: 'exact-schema'});
      } else {
        yield {type: 'text-delta', index: 0, text: '工具发现和调用完成。'};
        yield {type: 'finish', reason: {kind: 'stop'}};
        return;
      }
    } else if (label === 'SEARCH_ONLY' && !results.length) {
      yield emitCall('ws_helper_find_tools', {query: 'mcp__qa__beta'});
    } else if (label === 'DIRECT_MCP' && !results.length) {
      yield emitCall('mcp__qa__beta', {});
    } else if (label === 'RESUMED') {
      assert(names.includes('mcp__qa__alpha'));
      assert(names.includes('mcp__qa__beta'));
      yield {type: 'text-delta', index: 0, text: '恢复后已加载的工具仍可用。'};
      yield {type: 'finish', reason: {kind: 'stop'}};
      return;
    } else if (label === 'BACKGROUND') {
      if (!results.length) {
        yield emitCall('terminal_open', {type: 'shell', cwd});
      } else if (results.length === 1) {
        const output = text(results[0]);
        assert(!results[0].isError, output);
        terminalId = output.match(/started terminal session ([^\s(]+)/)?.[1];
        assert(terminalId, output);
        const command = process.platform === 'win32'
          ? "Start-Sleep -Seconds 4; Write-Output 'DSH_HARNESS_QA_DONE'"
          : "sleep 4; printf 'DSH_HARNESS_QA_DONE\\n'";
        yield emitCall('terminal_send', {sessionId: terminalId, text: command, run_in_background: true});
      } else {
        const output = text(results[1]);
        assert(!results[1].isError, output);
        jobId = output.match(/started background job (\S+)/)?.[1];
        assert(jobId, output);
        yield emitCall('job_output', {job_id: jobId, wait: true, timeout_ms: 10000});
      }
    } else if (label === 'CORRECTION') {
      const job = ctx.jobs.get(jobId, options.sessionId);
      yield {type: 'text-delta', index: 0, text: job.status === 'running' ? '收到修正，后台作业继续运行。' : '后台作业已完成。'};
      yield {type: 'finish', reason: {kind: 'stop'}};
      return;
    } else {
      yield {type: 'text-delta', index: 0, text: '检查完成。'};
      yield {type: 'finish', reason: {kind: 'stop'}};
      return;
    }
    yield {type: 'finish', reason: {kind: 'tool-calls'}};
  }
}
ctx.llm.registerAdapter(['harness-qa'], new Adapter());
ctx.on('session/event', (_session, event) => {
  if (event.type === 'tool/call' && event.data.name === 'job_output') waitStarted();
});
const handles = [];
const checks = [];
async function create(id, resume = false) {
  const options = {
    ...(resume ? {resumeSessionId: id} : {sessionId: SessionId(id), meta: {cwd}}),
    agentOptions: {provider: 'harness-qa', model: 'fixture'},
    setup: async agent => { await ctx.agentPresets.mount(agent, 'ws-helper'); },
  };
  const handle = await (resume ? ctx.agents.resume(options) : ctx.agents.create(options));
  if (!resume) setSandboxMode(handle.agent.session, process.env.DSH_TEST_SANDBOX_MODE ?? 'danger-full-access');
  handles.push(handle);
  return handle;
}
async function settle(agent) {
  let timer;
  try { await Promise.race([agent.whenIdle(), new Promise((_, reject) => {timer = setTimeout(() => reject(Error('Harness fixture timeout')), 20000);})]); }
  finally { clearTimeout(timer); }
  const errors = [...agent.session.ownEvents()].filter(event => event.type === 'turn/end' && event.data.reason.kind === 'error');
  assert.equal(errors.length, 0, JSON.stringify(errors));
}
try {
  const id = 'harness-discovery-' + Date.now();
  const discovery = await create(id);
  discovery.agent.followup(user('DISCOVERY'));
  await settle(discovery.agent);
  assert(calls.some(call => call.name === 'mcp__qa__alpha' && call.args.value === 'exact-schema'));
  checks.push('native-loop-loads-exact-schema-before-call');
  discovery.agent.followup(user('SEARCH_ONLY'));
  await settle(discovery.agent);
  assert(!calls.some(call => call.name === 'mcp__qa__beta'));
  await discovery.dispose();
  handles.splice(handles.indexOf(discovery), 1);
  const resumed = await create(id, true);
  resumed.agent.followup(user('RESUMED'));
  await settle(resumed.agent);
  checks.push('resume-restores-used-and-discovered-tools');
  await resumed.dispose();
  handles.splice(handles.indexOf(resumed),1);
  const stored = await ctx.sessionPersistence.open(id,'read');
  let saved;
  try { saved = await stored.read(0); } finally { await stored.close(); }
  const {buildForkSeed} = await pkg('dsh-session');
  const child = await ctx.agents.create({sessionId:SessionId('harness-fork-'+Date.now()),seed:buildForkSeed(saved.events,saved.events.length-1),inheritedEventCount:saved.events.length,meta:{cwd,isSeeded:true,parentSession:SessionId(id),delegationDepth:1},agentOptions:{provider:'harness-qa',model:'fixture'},setup:async agent=>{await ctx.agentPresets.mount(agent,'ws-helper');}});
  handles.push(child);
  child.agent.followup(user('RESUMED'));
  await settle(child.agent);
  checks.push('fork-retains-inherited-tool-availability');

  const fresh = await create('harness-atomic-' + Date.now());
  const selectionContext = {agent: fresh.agent, modelSelection: fresh.agent.model.current(), signal: new AbortController().signal};
  const before = await ctx.tools.resolve(selectionContext);
  const search = ctx.tools.get('ws_helper_find_tools', fresh.agent);
  const result = JSON.parse(await search.execute({query: 'mcp__qa__beta'}, {agent: fresh.agent}));
  assert(result.loaded_tools.includes('mcp__qa__beta'));
  assert(!before.view(fresh.agent).has('mcp__qa__beta'));
  const after = await ctx.tools.resolve(selectionContext);
  assert(after.view(fresh.agent).has('mcp__qa__beta'));
  assert(!after.view(fresh.agent).has('mcp__qa__alpha'));
  before.dispose();
  after.dispose();
  await assert.rejects(search.execute({query: '   '}, {agent: fresh.agent}));
  await assert.rejects(search.execute({query: 'alpha', limit: 99}, {agent: fresh.agent}));
  checks.push('step-admission-is-atomic-and-isolated-between-agents');

  const background = await create('harness-background-' + Date.now());
  background.agent.followup(user('BACKGROUND'));
  let timer;
  try { await Promise.race([startedWait, new Promise((_, reject) => {timer = setTimeout(() => reject(Error('Background terminal did not enter wait')), 15000);})]); }
  finally { clearTimeout(timer); }
  await delay(100);
  const began = Date.now();
  background.agent.steer(user('CORRECTION'));
  await settle(background.agent);
  assert(Date.now() - began < 3000, 'Steering must release the job wait promptly');
  assert.equal(ctx.jobs.get(jobId, background.agent.id).status, 'running');
  checks.push('user-steering-releases-wait-without-killing-job');
  await ctx.jobs.wait(jobId, 10000, background.agent.id);
  assert.equal(ctx.jobs.get(jobId, background.agent.id).status, 'completed');
  const output = ctx.jobs.read(jobId, background.agent.id);
  assert(JSON.stringify(output).includes('DSH_HARNESS_QA_DONE'));
  await settle(background.agent);
  checks.push('background-result-is-retained-until-collected');
  const origin = ctx.webServer.getOrigin();
  await fetch(origin+'/api/dsh-prompt-custom/toggle',{method:'POST',headers:{'content-type':'application/json','x-dsh-ui':'1'},body:JSON.stringify({enabled:false})});
  const standard = await ctx.agents.create({sessionId:SessionId('harness-standard-'+Date.now()),meta:{cwd},agentOptions:{provider:'harness-qa',model:'fixture'},setup:async agent=>{await ctx.agentPresets.mount(agent,'standard');}});
  handles.push(standard);
  const ordinary = await ctx.tools.resolve({agent:standard.agent,modelSelection:standard.agent.model.current(),signal:new AbortController().signal});
  assert(ordinary.view(standard.agent).has('mcp__qa__alpha'));
  assert(!ordinary.view(standard.agent).has('ws_helper_find_tools'));
  ordinary.dispose();
  checks.push('disabled-persona-restores-normal-tool-presentation');
  await fetch(origin+'/api/dsh-prompt-custom/toggle',{method:'POST',headers:{'content-type':'application/json','x-dsh-ui':'1'},body:JSON.stringify({enabled:true})});
  const enabledSet = await ctx.tools.resolve({agent:standard.agent,modelSelection:standard.agent.model.current(),signal:new AbortController().signal});
  assert(!enabledSet.view(standard.agent).has('mcp__qa__beta'));
  enabledSet.dispose();
  await fetch(origin+'/api/dsh-prompt-custom/toggle',{method:'POST',headers:{'content-type':'application/json','x-dsh-ui':'1'},body:JSON.stringify({enabled:false})});
  standard.agent.followup(user('DIRECT_MCP'));
  await settle(standard.agent);
  await fetch(origin+'/api/dsh-prompt-custom/toggle',{method:'POST',headers:{'content-type':'application/json','x-dsh-ui':'1'},body:JSON.stringify({enabled:true})});
  const restoredSet = await ctx.tools.resolve({agent:standard.agent,modelSelection:standard.agent.model.current(),signal:new AbortController().signal});
  assert(restoredSet.view(standard.agent).has('mcp__qa__beta'));
  restoredSet.dispose();
  checks.push('toggle-retains-tools-advertised-during-normal-mode');
  const report = {runtime: runtimeVersion, sandbox: process.env.DSH_TEST_SANDBOX_MODE ?? 'danger-full-access', realModelCalls: 0, checks};
  await fs.writeFile(path.resolve(task, '../outputs/harness-verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  for (const handle of handles.reverse()) await handle.dispose();
  await ctx.fiber.dispose();
}
