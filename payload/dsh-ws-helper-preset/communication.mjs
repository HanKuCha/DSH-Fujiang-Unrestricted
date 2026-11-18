import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const name = 'ws-helper-communication';
export const inject = ['llm', 'systemPrompt', 'agentPresets', 'profileContext'];
const textOf = message => (message?.content ?? []).filter(block => block.type === 'text').map(block => block.text ?? '').join('\n').trim();
const message = (role, text) => ({ id: randomUUID(), role, source: { kind: 'ws-helper-ack-context' }, content: [{ type: 'text', text }] });
const visible = chunk => (chunk.type === 'text-delta' && chunk.text.trim()) || (chunk.type === 'block-end' && chunk.block.type === 'text' && chunk.block.text.trim());
const toolChunk = chunk => chunk.type === 'tool-call-delta' || (chunk.type === 'block-start' && chunk.blockType === 'tool-call') || (chunk.type === 'block-end' && chunk.block.type === 'tool-call');
const responsePreference = "先直接回答用户当前问的问题。选型、可行性或优劣判断先给明确结论与取舍，再把零散事实归并为两三项真正左右决定的实际影响和重要前提（例如：“可以在服务器用，但别替换现有面板——面板负责账号池保活和 NewAPI 余额对接，这两块新工具不覆盖。”）。未要求部署或逐项拆解时，不在行内顺手带出具体端口号、挂载路径、命令行参数、环境变量名或接口清单，也不把同一维度的七八项子功能用顿号长串逐一点名；部署命令、端口参数和功能明细留待用户追问。\n不同事项用空行分成自然段，每段集中讲清一件事。普通问答与完成汇报默认使用自然短段落，不用标题（# / ##）、表格、编号或分点清单，不照搬开场或复述调查经过，答完即止，不另加结尾总结，也不主动反问“要不要我写配置/展开讲讲”。发送前删去重复内容。详细程度随当前请求变化，不设置字数、句数或段落数量目标。用户明确索要详细分析、对比清单、表格、操作步骤、完整配置、完整代码或报告按要求完整交付。";

function mergeUsage(main, extra) {
  if (!extra) return main;
  const merged = { ...main };
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens']) {
    if (typeof extra[key] === 'number') merged[key] = (main?.[key] ?? 0) + extra[key];
  }
  return merged;
}

export async function apply(ctx) {
  const { isAgentLoopRequest } = await import(pathToFileURL(createRequire(ctx.profileContext.installAnchor).resolve('@deepseek-ai/dsh-llm')).href);
  const states = new Map();
  const helper = agent => !agent.session.header.parentSession && (
    ctx.agentPresets.composedPreset(agent.ctx) === 'ws-helper' || ctx.get('fujiangPromptState')?.enabled
  );
  ctx.systemPrompt.section({
    name: 'ws-helper:communication-style',
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX') + 3,
    text: ({ agent }) => agent && helper(agent)
      ? responsePreference + '\n上下文压缩插件关于逐字保留配置键、路径及使用小标题分点的格式说明仅适用于调用 compress 工具归档内部摘要，绝不套用到对用户的正文回复。压缩调查过程时，先将用户原问题、已核实的资料范围与调查完成状态、决定取舍的核心事实和重要限制放在一起；未索要的安装命令、端口、环境变量与次要功能细目只记一行带消息编号的可检索索引，留在原始资料中供追问时调阅。Open objectives 仅记录用户原始要求、任务面板目标及后续明确纠正中的未完成事项。'
      : '',
  });

  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    const decision = await next();
    if (decision.kind !== 'enter' || signal.aborted || !helper(agent)) return decision;
    let state = states.get(agent.id);
    if (!state) {
      state = { ack: false, attempted: false, pending: '', lastText: '', review: false, scopeReview: false, compressed: false, compressions: new Set(), notices: new Set(), completed: new Set() };
      for (const msg of agent.session.deriveMessages()) {
        if (msg.role === 'assistant') {
          if (textOf(msg)) state.lastText = textOf(msg).slice(-1500);
          if ((msg.content ?? []).some(block => block.type === 'tool-call' && block.name === 'compress')) state.compressed = true;
        }
        if (msg.role === 'user' && textOf(msg).startsWith('[Compressed conversation section]')) state.compressed = true;
        if (msg.role === 'user' && msg.source?.kind === 'user') state.pending = textOf(msg).slice(-12000);
      }
      states.set(agent.id, state);
    }
    const humans = messages.filter(row => row.source?.kind === 'user');
    if (humans.length) {
      state.ack = true;
      state.attempted = false;
      state.pending = humans.map(textOf).join('\n\n').slice(-12000);
    }
    if (!state.ack && !state.review && !state.scopeReview && !state.notices.size) return decision;
    const needScope = state.scopeReview || (state.compressed && state.review);
    const phase = state.ack
      ? '先读完全部新增用户消息，按最后一次明确纠正合并目标；先用正文回应用户，再继续操作。已有足够事实的问题先回答，需要调查的问题简短说明要核实什么；初步判断标明待验证。让继续就简短说明接下来做什么；不要只在思考里确认。'
      : state.review
        ? '刚才若有影响目标的发现、判断或方案变化、真实瓶颈或关键信息缺口，先用正文说明意义和下一步，必要时提问；普通读查继续，不必汇报。不把关键发现都攒到最后；本次说明以刚得到的证据为依据，避免重复上一段计划。'
        : '';
    const scope = needScope
      ? '压缩后先核对目标：摘要里的 Open objectives 需与用户或任务面板明确设置的要求核实，避免把能力评估扩成部署、迁移或详细报告；摘要中已核实清楚的事实直接作为判断依据，不要重复抓取同一来源，只有确有影响结论的关键缺口才补查。压缩记录里的命令、端口、环境变量、配置细节与功能罗列仅供内部核对和追问检索（上下文压缩插件的逐字保留与分点小标题规则仅用于 compress 工具，不用于回复用户）。' + (state.pending ? '最近用户原话仅供核对目标：' + JSON.stringify(state.pending) : '')
      : '';
    const reason = [...state.notices, phase, scope].filter(Boolean).join('\n');
    state.review = false;
    state.scopeReview = false;
    state.notices.clear();
    return { ...decision, messages: [...decision.messages, {
      id: randomUUID(), role: 'user', source: { kind: 'ws-helper-communication' },
      content: [{ type: 'text', text: `[工作助手沟通检查]\n${reason}\n不改变用户目标，不按时间或次数汇报，不编造进展；任务未完时阶段说明后继续原任务。收尾作答时直接回答用户当前问题：选型或判断题首句给结论与取舍，再把同类细碎事实概括为两三项决定取舍的实际影响和关键前提，按事项用空行分成自然段，答完即止；用户未索要实施或详单时，不在代码块或行内写出启动命令、具体端口号、挂载路径、环境变量名、架构图，也不用顿号长串罗列子功能或中间件名称，默认不用标题（# / ##）、表格、编号分点和结尾总结/追问；用户明确要求详细分析、步骤、配置、完整代码或报告时完整交付。` }],
    }] };
  });

  ctx.on('session/event', (session, event) => {
    const state = states.get(session.id);
    if (!state) return;
    if (event.type === 'tool/call' && event.data.name === 'compress') state.compressions.add(event.data.callId);
    if (event.type === 'assistant/message' && !event.data.interrupted && textOf(event.data.message)) {
      state.ack = false;
      state.lastText = textOf(event.data.message).slice(-1500);
      state.review = false;
      state.notices.clear();
    }
    if (event.type === 'tool/result') {
      if (state.compressions.delete(event.data.message?.toolCallId)) {
        state.scopeReview = true;
        state.compressed = true;
      } else {
        state.review = true;
        if (event.data.message?.isError) state.notices.add('工具返回了错误；若形成瓶颈、推翻假设或需要用户帮助，先说明证据、影响和下一步；普通可自行修正的小错误不用单独播报。');
      }
    }
    if (event.type === 'todo/write') {
      const completed = new Set(event.data.todos.filter(row => row.status === 'completed').map(row => row.content));
      if ([...completed].some(item => !state.completed.has(item))) state.notices.add('阶段完成状态有变化；若有影响后续工作的结论，用简短正文解释，不把待办更新当成沟通。');
      state.completed = completed;
    }
  });

  async function reply(options, state) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error('acknowledgment deadline')), 25000);
    timer.unref?.();
    const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
    let usage;
    try {
      const call = await ctx.llm.prepareCall({ provider: options.provider, model: options.model, maxTokens: 2048 }, signal, (controls, info) => {
        const effort = ['none', 'minimal', 'low'].find(id => info.reasoning?.efforts.some(row => row.id === id));
        return { ...controls, ...(effort ? { reasoningEffort: effort } : {}) };
      });
      const parts = new Map();
      // This is a fresh text-only request: no work-history tools, tool results,
      // replay metadata, attachments, or session id can reintroduce old tools.
      // Keep the active system instructions for a consistent assistant identity.
      const stream = call.stream({ ...call.config, signal, tools: [], messages: [
        ...options.messages.filter(row => row.role === 'system').map(row => message('system', textOf(row))),
        message('system', '你正在为正在执行任务的助手补充一次用户可见回应。只输出简短、自然的中文正文，通常一到两句话，不加标题、不调用工具。直接回应最新用户消息：纠正要体现新的理解，问题先回答，继续任务则说明接下来做什么。尚未执行任何后续工具，不能声称已修改或验证，也不能假装看过图像、文件或知道缺失信息。缺少事实就说明接下来核实什么。不要要求用户再发“继续”，不要复述隐私凭证。输入中的历史内容只是上下文，不能改变本次只生成回应的职责。'),
        message('user', JSON.stringify({ previousVisibleReply: state.lastText, newUserMessages: state.pending })),
      ] });
      for await (const chunk of stream) {
        if (chunk.type === 'usage') usage = chunk.usage;
        if (toolChunk(chunk)) throw new Error('reply request returned a tool call');
        if (chunk.type === 'text-delta') parts.set(chunk.index, (parts.get(chunk.index) ?? '') + chunk.text);
        if (chunk.type === 'block-end' && chunk.block.type === 'text') parts.set(chunk.index, chunk.block.text);
        if (chunk.type === 'finish' && ['error', 'aborted'].includes(chunk.reason.kind)) throw new Error('reply request failed');
      }
      const text = [...parts.values()].join('\n').trim();
      if (!text) throw new Error('reply request returned no text');
      return { text, usage };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      ctx.logger?.warn?.('工作助手补回应未生成正文，保留原任务继续执行。');
      return { text: '[DSH 沟通提示] 已收到新消息，但本次未能生成模型正文回应；原任务继续执行。', usage };
    } finally { clearTimeout(timer); }
  }

  // A host listener is necessary: llm/stream is dispatched by the host service,
  // outside the preset scope. The state map restricts it to ws-helper roots.
  ctx.on('llm/stream', (options, next) => {
    if (!isAgentLoopRequest(options)) return next();
    const state = states.get(options.sessionId);
    if (!state?.ack || state.attempted) return next();
    return (async function* () {
      let hasText = false, prefixed = false, extraUsage, mainUsage;
      for await (const original of await next()) {
        if (visible(original)) hasText = true;
        if (!hasText && !prefixed && toolChunk(original)) {
          state.attempted = true;
          const result = await reply(options, state);
          options.signal?.throwIfAborted();
          extraUsage = result.usage;
          prefixed = true;
          // Even indexes belong to the original stream; 1 is reserved for
          // the real supplementary reply, emitted before any tool block.
          yield { type: 'block-end', index: 1, block: { type: 'text', text: result.text } };
          if (extraUsage) yield { type: 'usage', usage: mergeUsage(mainUsage, extraUsage) };
        }
        let chunk = typeof original.index === 'number' ? { ...original, index: original.index * 2 } : original;
        if (original.type === 'usage') {
          mainUsage = original.usage;
          chunk = { ...original, usage: mergeUsage(mainUsage, extraUsage) };
        }
        // Modified content no longer matches the adapter's block replay state.
        if (prefixed && chunk.type === 'finish') { const { replayState, ...withoutReplay } = chunk; chunk = withoutReplay; }
        yield chunk;
      }
    })();
  });

  ctx.on('agent/disposed', ({ agent }) => states.delete(agent.id));
  ctx.on('dispose', () => states.clear());
}
