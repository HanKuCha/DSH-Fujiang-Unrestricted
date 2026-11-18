import assert from 'node:assert/strict';
import path from 'node:path';
import { apply, stripRawToolMarkup } from '../payload/dsh-ws-helper-preset/communication.mjs';
import { apply as applyDiscovery } from '../payload/dsh-ws-helper-preset/tool-discovery.mjs';

assert.equal(
  stripRawToolMarkup('收到，先看文件本体。\n\n<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="shell">\n<｜｜DSML｜｜ parameter name="command" string="true">Get-Item foo</｜｜DSML｜｜ parameter>\n</｜｜DSML｜｜ invoke>\n</｜｜DSML｜｜ calls>'),
  '收到，先看文件本体。'
);
assert.equal(
  stripRawToolMarkup('<｜DSML｜function_calls><｜DSML｜invoke name="shell"></｜DSML｜invoke></｜DSML｜function_calls>'),
  ''
);
assert.equal(
  stripRawToolMarkup('收到，准备检查。<tool_call>{"name":"shell"}</tool_call>'),
  '收到，准备检查。'
);

const anchor = path.join(process.env.LOCALAPPDATA, 'Programs/DeepSeek Harness/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json');
const handlers = new Map();
const sections = [];
const original = '我已有 newapi 和 workbuddy，只想判断有没有必要换工具，能否在服务器用。';
const message = text => ({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] });
const agent = {
  id: 'scope-fixture',
  ctx: {},
  session: { header: {}, deriveMessages: () => [message(original)] },
};
await apply({
  profileContext: { installAnchor: anchor },
  agentPresets: { composedPreset: () => 'ws-helper' },
  systemPrompt: { section: value => sections.push(value), getSectionOrder: () => 10200 },
  get: () => ({ enabled: true }),
  on: (name, handler) => handlers.set(name, handler),
});
const signal = new AbortController().signal;
const preStep = (messages, targetAgent = agent) => handlers.get('agent/pre-step')({ agent: targetAgent, messages, signal }, async () => ({ kind: 'enter', messages: [] }));
const event = (type, data, id = agent.id) => handlers.get('session/event')({ id }, { type, data });
await preStep([message(original)]);
event('assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text: '我先核实项目能力。' }] } });
event('tool/call', { name: 'compress', callId: 'compression-1' });
event('tool/result', { message: { toolCallId: 'compression-1' } });
const checked = await preStep([]);
const text = checked.messages[0].content[0].text;
assert.equal(checked.kind, 'enter');
assert(text.includes(original));
assert(text.includes('Open objectives'));
assert(text.includes('避免把能力评估扩成部署'));
assert(text.includes('不要重复抓取同一来源'));
assert(text.includes('仅用于 compress 工具'));
assert(!text.includes('刚才若有影响目标的发现'), 'Archival compress alone must not trigger mid-investigation discovery prompt');
assert(sections[0].text({ agent }).includes('删去重复'));
assert(sections[0].text({ agent }).includes('Open objectives'));
assert(sections[0].text({ agent }).includes('调查完成状态'));
assert(!/\d+至\d+字|\d+[–-]\d+字/.test(sections[0].text({ agent })));
assert.equal(sections[0].text({}), '');
assert(!/\d+至\d+字|\d+[–-]\d+字/.test(text));
assert.equal((await preStep([])).messages.length, 0);

// Subsequent tool result in an already-compressed session retains original request scope guard
event('tool/call', { name: 'web_fetch', callId: 'fetch-after-compress' });
event('tool/result', { message: { toolCallId: 'fetch-after-compress' } });
const followChecked = await preStep([]);
const followText = followChecked.messages[0].content[0].text;
assert(followText.includes(original));
assert(followText.includes('刚才若有影响目标的发现'));

// Latest user correction supersedes original request
event('tool/call', { name: 'compress', callId: 'compression-2' });
event('tool/result', { message: { toolCallId: 'compression-2' } });
const correction = '改一下，这次只判断是否值得换，详细部署以后再说。';
const updated = await preStep([message(correction)]);
const latest = updated.messages[0].content[0].text;
assert(latest.includes(correction));
assert(!latest.includes(original));
assert.equal(updated.kind, 'enter');
assert(!signal.aborted);

// Resumed session with existing compressed section restores compressed flag automatically
const resumedAgent = {
  id: 'resumed-scope-fixture',
  ctx: {},
  session: {
    header: {},
    deriveMessages: () => [
      message(original),
      { role: 'user', source: { kind: 'bili' }, content: [{ type: 'text', text: '[Compressed conversation section]\nm00001 summary' }] },
    ],
  },
};
await preStep([], resumedAgent);
event('tool/result', { message: { toolCallId: 'later-tool' } }, resumedAgent.id);
const resumedChecked = await preStep([], resumedAgent);
assert(resumedChecked.messages[0].content[0].text.includes(original));

// Verify tool-discovery enriches both compress.description and compress.parameters.properties.content.description
const prompts = {
  section: () => {},
  getSectionOrder: () => 10200,
  assemble: async () => ({
    sections: [],
    tools: [{
      name: 'compress',
      description: 'Fold ranges.',
      parameters: { type: 'object', properties: { content: { type: 'string', description: 'Summary text.' } } },
    }],
  }),
};
await applyDiscovery({
  profileContext: { installAnchor: anchor },
  tools: { register: () => {}, definitions: () => [] },
  systemPrompt: prompts,
  agentPresets: { composedPreset: () => 'ws-helper' },
  get: () => ({ enabled: true }),
  on: () => {},
  effect: () => {},
});
const assembled = await prompts.assemble({ agent });
assert(assembled.tools[0].description.includes('investigation completion status'));
assert(assembled.tools[0].parameters.properties.content.description.includes('mNNNNN'));

console.log('SCOPE_GUARD_PASS: original request restored after compression, multi-step & resume preserved, latest correction wins, compress schema enriched, no pause and no word cap');
