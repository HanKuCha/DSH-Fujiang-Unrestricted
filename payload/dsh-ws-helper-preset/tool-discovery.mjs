import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { normalizeReaToolSchemas } from './schema-compat.mjs';

export const name = 'ws-helper-tool-discovery';
export const inject = ['tools', 'systemPrompt', 'agentPresets', 'profileContext'];

const searchName = 'ws_helper_find_tools';
const external = name => name.startsWith('mcp__');
const entryPoint = name => /__(open_binary|binary_session|inspect_artifact)$/.test(name);

function relevance(tool, words) {
  const name = tool.name.toLowerCase();
  const description = String(tool.description ?? '').toLowerCase();
  let score = 0;
  for (const word of words) {
    if (name === word || name.endsWith('__' + word)) score += 100;
    else if (name.includes(word)) score += 10;
    else if (description.includes(word)) score++;
  }
  return score;
}

export async function apply(ctx) {
  const { defineTool, ToolArgsError } = await import(pathToFileURL(createRequire(ctx.profileContext.installAnchor).resolve('@deepseek-ai/dsh-tools')).href);
  const registry = ctx.tools;
  const supportsStepSelection = typeof registry.resolve === 'function';
  const selected = new Map();
  const enabled = agent => agent && (
    ctx.agentPresets.composedPreset(agent.ctx) === 'ws-helper' || ctx.get('fujiangPromptState')?.enabled
  );

  function selection(agent) {
    if (selected.has(agent.id)) return selected.get(agent.id);
    const names = new Set();
    const history = agent.session.toolHistory?.();
    for (const tool of history?.tools ?? []) if (external(tool.name)) names.add(tool.name);
    for (const update of history?.updates ?? []) {
      for (const tool of update.additions ?? []) if (external(tool.name)) names.add(tool.name);
    }
    const searches = new Set();
    for (const message of agent.session.deriveMessages()) {
      if (message.role === 'assistant') {
        for (const block of message.content) {
          if (block.type !== 'tool-call') continue;
          if (external(block.name)) names.add(block.name);
          if (block.name === searchName) searches.add(block.id);
        }
      }
      if (message.role !== 'tool' || !searches.has(message.toolCallId)) continue;
      for (const block of message.content) {
        if (block.type !== 'text') continue;
        try {
          const result = JSON.parse(block.text);
          for (const name of result.loaded_tools ?? []) {
            if (typeof name === 'string' && external(name)) names.add(name);
          }
        } catch { /* Earlier or interrupted results may contain ordinary text. */ }
      }
    }
    selected.set(agent.id, names);
    return names;
  }

  ctx.tools.register(defineTool({
    name: searchName,
    description: 'Find tools by exact name or English capability keywords. Load matching MCP tools for the next model step and return their current input schemas. Use this when a skill names a tool missing from the current list.',
    parameters: {
      query: { type: 'string', required: true, description: 'Nonempty tool names or English capability keywords, separated by spaces or commas.' },
      limit: { type: 'integer', description: 'Maximum results to load, from 1 to 20. Defaults to 5.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    isConcurrencySafe: () => true,
    execute(args, exec) {
      const words = args.query.toLowerCase().split(/[\s,，]+/).filter(Boolean);
      const limit = args.limit ?? 5;
      if (!words.length) throw new ToolArgsError(['query must contain a tool name or keyword']);
      if (limit < 1 || limit > 20) throw new ToolArgsError(['limit must be between 1 and 20']);
      const matches = ctx.tools.definitions(exec.agent)
        .filter(tool => tool.name !== searchName)
        .map(tool => ({ tool, score: relevance(tool, words) }))
        .filter(row => row.score > 0)
        .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
      const tools = matches.slice(0, limit).map(({ tool }) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
      const names = selection(exec.agent);
      for (const tool of tools) if (external(tool.name)) names.add(tool.name);
      return JSON.stringify({
        matches: matches.length,
        loaded_tools: tools.map(tool => tool.name),
        tools: normalizeReaToolSchemas(tools).tools,
        next_step: 'Call the loaded tools in the next step using their declared parameters. Broaden or refine the search when the required tool is absent.',
      });
    },
  }), { when: ({ agent }) => !!enabled(agent) });

  if (supportsStepSelection) {
    const descriptor = Object.getOwnPropertyDescriptor(registry, 'resolve');
    const original = registry.resolve;
    async function resolve(context) {
      const tools = await original.call(this, context);
      if (!enabled(context.agent)) return tools;
      // Freeze admission for the whole step. Discovery takes effect on the next
      // step, including when search and a guessed call arrive in the same batch.
      const admitted = new Set(selection(context.agent));
      return Object.freeze({
        dispose: () => tools.dispose(),
        view: scope => new Map([...tools.view(scope)].filter(([name]) => !external(name) || entryPoint(name) || admitted.has(name))),
      });
    }
    registry.resolve = resolve;
    const installed = registry.resolve;
    ctx.effect(() => () => {
      if (registry.resolve !== installed) return;
      if (descriptor) Object.defineProperty(registry, 'resolve', descriptor);
      else delete registry.resolve;
    });
  }

  const prompts = ctx.systemPrompt;
  const promptDescriptor = Object.getOwnPropertyDescriptor(prompts, 'assemble');
  const assemble = prompts.assemble;
  async function assembleWithGuidance(context = {}) {
    const result = await assemble.call(this, context);
    if (!enabled(context.agent)) return result;
    return { ...result, tools: result.tools.map(tool => {
      if (tool.name === 'pwsh' || tool.name === 'bash') return { ...tool, description: tool.description + '\nUse this for quick commands. For builds, downloads, tests or other potentially slow work, open a terminal and use terminal_send with run_in_background=true, then collect with job_output.' };
      if (tool.name === 'terminal_send') return { ...tool, description: tool.description + '\nPrefer run_in_background=true for potentially slow commands so the conversation can accept corrections while work continues.' };
      if (tool.name === 'compress') {
        const guidance = '\nPreserve the user\'s original request, later corrections, constraints and reply preferences. Always record investigation completion status (which repos/docs/files were already verified and whether evidence is sufficient to answer, so post-compression steps do not re-fetch them). For evaluation, comparison, or feasibility questions where the user has not asked to deploy or configure, group the original question, verified decisive facts, key limitations, and completion status together; leave unrequested setup commands, port/env/parameter lists, and secondary feature inventories in retrievable history via a one-line mNNNNN content index for search_context/decompress. Open objectives must contain only unfinished user requests, never assistant-proposed deployment commands or migration plans.';
        const contentParam = tool.parameters?.properties?.content;
        const parameters = contentParam && typeof contentParam.description === 'string'
          ? {
            ...tool.parameters,
            properties: {
              ...tool.parameters.properties,
              content: {
                ...contentParam,
                description: contentParam.description + '\nFor evaluation/judgment questions without a setup request: place the user\'s original question, verified sources/completion status, decisive trade-off facts, and key limitations together; reference unrequested setup commands/ports/env vars via one-line mNNNNN index entries instead of expanding them into active tasks; keep Open objectives strictly to unfinished user-requested items.',
              },
            },
          }
          : tool.parameters;
        return { ...tool, description: tool.description + guidance, parameters };
      }
      return tool;
    }) };
  }
  prompts.assemble = assembleWithGuidance;
  const installedAssembly = prompts.assemble;
  ctx.effect(() => () => {
    if (prompts.assemble !== installedAssembly) return;
    if (promptDescriptor) Object.defineProperty(prompts, 'assemble', promptDescriptor);
    else delete prompts.assemble;
  });

  ctx.systemPrompt.section({
    name: 'ws-helper:tool-routing',
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX') + 2,
    text: ({ agent }) => enabled(agent)
      ? (supportsStepSelection ? '外部 MCP 工具按需加载，open_binary、binary_session、inspect_artifact 入口保持可见。' : '') + '技能提到的工具若不在当前列表，先用 ws_helper_find_tools 按工具名或英文能力关键词搜索，下一步使用返回的真实 schema 调用。已调用或搜索加载的工具在本会话继续可用。长命令优先使用 terminal_open 和 terminal_send(run_in_background=true)，拿到 jobId 后按需读取 job_output；等待期间继续独立工作并回应用户。job 仍在运行时，保留进行中状态，完成任务前收集实际结果。'
      : '',
  });
  ctx.on('session/event', (session, event) => {
    const names = selected.get(session.id);
    if (!names || event.type !== 'request/header') return;
    for (const tool of event.data.header.tools ?? []) if (external(tool.name)) names.add(tool.name);
  });
  ctx.on('agent/disposed', ({ agent }) => selected.delete(agent.id));
  ctx.on('dispose', () => selected.clear());
}
