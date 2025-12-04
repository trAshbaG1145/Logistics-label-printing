import assert from 'assert';
import { tryExtractJsonString } from '../index.js';

console.log('Running parse/extract tests...');

// Test: well-formed fenced json
const input1 = '```json\n[{"name":"张三"}]\n```';
assert.strictEqual(tryExtractJsonString(input1), '[{"name":"张三"}]');

// Test: inline object
const input2 = 'some intro text {"name":"张三","phone":"138"} some tail';
assert.strictEqual(tryExtractJsonString(input2), '{"name":"张三","phone":"138"}');

// Test: no json
const input3 = 'this is plain text, nothing to parse';
assert.strictEqual(tryExtractJsonString(input3), null);

console.log('All tests passed.');