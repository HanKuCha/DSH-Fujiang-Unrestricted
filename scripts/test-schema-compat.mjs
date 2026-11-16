import assert from 'node:assert/strict';
import {normalizeReaToolSchemas,apply} from '../payload/dsh-ws-helper-preset/schema-compat.mjs';

const pattern=String.raw`^[^\uD800-\uDFFF]*$`;
const nulPattern=String.raw`^[^\x00]*$`;
const schema={
  type:'object',
  properties:{path:{type:'string',allOf:[{pattern:nulPattern},{pattern}]}},
  required:['path'],
  additionalProperties:false,
  $defs:{guard:{type:'string',pattern}},
  default:{pattern},
  examples:[{pattern}],
};
const original=[
  {name:'mcp__fujiang_rea__fixture',description:'Fixture',parameters:schema},
  {name:'other_tool',parameters:{type:'object',properties:{value:{type:'string',pattern}}}},
];
const snapshot=structuredClone(original);
const result=normalizeReaToolSchemas(original);
assert.equal(result.repaired,2);
assert.equal(result.tools.length,original.length);
assert.deepEqual(result.tools.map(tool=>tool.name),original.map(tool=>tool.name));
assert.deepEqual(original,snapshot,'Original validation schemas remain intact');
assert.equal(result.tools[0].parameters.properties.path.allOf[0].pattern,nulPattern);
assert.deepEqual(result.tools[0].parameters.properties.path.allOf[1],{});
assert.deepEqual(result.tools[0].parameters.required,['path']);
assert.equal(result.tools[0].parameters.additionalProperties,false);
assert.deepEqual(result.tools[0].parameters.default,{pattern});
assert.deepEqual(result.tools[0].parameters.examples,[{pattern}]);
assert.equal(result.tools[1],original[1]);
const repeated=normalizeReaToolSchemas(result.tools);
assert.equal(repeated.repaired,0);
assert.equal(repeated.tools,result.tools);
assert.equal(normalizeReaToolSchemas([]).repaired,0);
const scope=Object.freeze({id:'scope-fixture'});
const toolSet=Object.freeze({id:'admission-fixture'});
const runtime={async assemble(receivedScope,receivedSet){
  assert.equal(receivedScope,scope);
  assert.equal(receivedSet,toolSet);
  return {tools:structuredClone(original),sections:['original-sections']};
}};
const originalExporter=runtime.assemble;
let dispose;
apply({systemPrompt:runtime,effect:callback=>{dispose=callback();}});
const assembled=await runtime.assemble(scope,toolSet);
assert.deepEqual(assembled.sections,['original-sections']);
const request=Object.freeze({tools:Object.freeze(assembled.tools)});
assert.equal(request.tools[0].parameters.properties.path.allOf[1].pattern,undefined);
assert.equal(original[0].parameters.properties.path.allOf[1].pattern,pattern);
dispose();
assert.equal(runtime.assemble,originalExporter);
console.log('SCHEMA_COMPAT_PASS: exact metadata rule, original schemas, names, fields, other constraints, examples and idempotency');
