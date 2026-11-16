export const name = 'ws-helper-schema-compat';
export const inject = ['systemPrompt'];

const REA_SURROGATE_PATTERN = String.raw`^[^\uD800-\uDFFF]*$`;
const schemaMaps = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas', 'dependencies'];
const schemaArrays = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const schemaChildren = ['items', 'additionalItems', 'additionalProperties', 'unevaluatedItems', 'unevaluatedProperties', 'contains', 'propertyNames', 'not', 'if', 'then', 'else'];

// Adapt model-facing snapshots while execution uses the original tool schemas.
export function normalizeReaToolSchemas(tools) {
  let repaired = 0;
  function visit(schema) {
    if (!schema || typeof schema !== 'object') return;
    if (Array.isArray(schema)) {
      schema.forEach(visit);
      return;
    }
    if (schema.pattern === REA_SURROGATE_PATTERN) {
      delete schema.pattern;
      repaired++;
    }
    for (const key of schemaMaps) Object.values(schema[key] ?? {}).forEach(visit);
    for (const key of schemaArrays) (schema[key] ?? []).forEach(visit);
    for (const key of schemaChildren) visit(schema[key]);
  }
  const adapted = tools.map(tool => {
    if (!tool.name.startsWith('mcp__fujiang_rea__')) return tool;
    const before = repaired;
    const parameters = structuredClone(tool.parameters);
    visit(parameters);
    return repaired === before ? tool : { ...tool, parameters };
  });
  return { tools: repaired ? adapted : tools, repaired };
}

export function apply(ctx) {
  const runtime = ctx.systemPrompt;
  const originalDescriptor = Object.getOwnPropertyDescriptor(runtime, 'assemble');
  const original = runtime.assemble;
  if (typeof original !== 'function') throw new Error('当前 DSH 缺少工具说明导出 API，无法加载 REA Schema 兼容模块。');
  async function compatibleAssembly(...args) {
    const assembly = await original.apply(this, args);
    const result = normalizeReaToolSchemas(assembly.tools);
    return result.repaired ? { ...assembly, tools: result.tools } : assembly;
  }
  runtime.assemble = compatibleAssembly;
  const installed = runtime.assemble;
  ctx.effect(() => () => {
    if (runtime.assemble !== installed) return;
    if (originalDescriptor) Object.defineProperty(runtime, 'assemble', originalDescriptor);
    else delete runtime.assemble;
  });
}
