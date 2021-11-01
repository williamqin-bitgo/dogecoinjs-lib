'use strict';
// [signatures ...]
Object.defineProperty(exports, '__esModule', { value: true });
exports.check = void 0;
const bscript = require('../../script');
const script_1 = require('../../script');
function isPartialSignature(value) {
  return (
    value === script_1.OPS.OP_0 || bscript.isCanonicalSchnorrSignature(value)
  );
}
function check(script, allowIncomplete) {
  const chunks = bscript.decompile(script);
  if (chunks.length < 1) return false;
  if (allowIncomplete)
    // Don't match completely unsigned to avoid colliding with multisig
    return (
      chunks.every(isPartialSignature) &&
      chunks.some(chunk => chunk !== script_1.OPS.OP_0)
    );
  return chunks.every(bscript.isCanonicalSchnorrSignature);
}
exports.check = check;
check.toJSON = () => {
  return 'taproot n-of-n input';
};
