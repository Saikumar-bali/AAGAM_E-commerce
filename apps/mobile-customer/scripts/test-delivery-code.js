const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/domain/deliveryCode.ts');
const source = fs.readFileSync(filename, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
    esModuleInterop: true,
  },
  fileName: filename,
  reportDiagnostics: true,
});

const errors = (output.diagnostics || []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
assert.equal(errors.length, 0, errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'));

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(output.outputText, filename);

const {
  formatDeliveryCode,
  secondsUntilExpiry,
  shouldShowDeliveryCode,
} = compiled.exports;

assert.equal(shouldShowDeliveryCode('RIDER_AT_CUSTOMER'), true);
assert.equal(shouldShowDeliveryCode('OUT_FOR_DELIVERY'), false);
assert.equal(shouldShowDeliveryCode(null), false);
assert.equal(formatDeliveryCode('123456'), '1 2 3 4 5 6');
assert.equal(formatDeliveryCode('12-34-56-78'), '1 2 3 4 5 6');
assert.equal(
  secondsUntilExpiry('2026-07-29T12:00:30.000Z', Date.parse('2026-07-29T12:00:00.000Z')),
  30,
);
assert.equal(
  secondsUntilExpiry('2026-07-29T11:59:00.000Z', Date.parse('2026-07-29T12:00:00.000Z')),
  0,
);

console.log('Customer delivery-code helper tests passed.');
