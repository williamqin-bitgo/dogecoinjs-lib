'use strict';
// [pubKeys[0:n-1] OP_CHECKSIGVERIFY] pubKeys[n-1] OP_CHECKSIG
Object.defineProperty(exports, '__esModule', { value: true });
exports.check = void 0;
const schnorrBip340 = require('../../schnorrBip340');
const bscript = require('../../script');
const script_1 = require('../../script');
function check(script, allowIncomplete) {
  const chunks = bscript.decompile(script);
  if (chunks.length < 3) return false;
  const ops = chunks.filter((_, index) => index % 2 === 1);
  if (ops[ops.length - 1] !== script_1.OPS.OP_CHECKSIG) return false;
  if (!ops.slice(0, -1).every(op => op === script_1.OPS.OP_CHECKSIGVERIFY))
    return false;
  if (chunks.length / 2 > 16) return false;
  if (allowIncomplete) return true;
  const keys = chunks.filter((_, index) => index % 2 === 0);
  return keys.every(schnorrBip340.isXOnlyPoint);
}
exports.check = check;
check.toJSON = () => {
  return 'taproot n-of-n output';
};
