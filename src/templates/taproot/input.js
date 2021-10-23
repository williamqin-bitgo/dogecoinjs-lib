'use strict';
// key path spend - {signature}
// script path spend - [...stack elements] {tapscript} {control block}
// https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki
Object.defineProperty(exports, '__esModule', { value: true });
exports.check = void 0;
const taproot = require('../../taproot');
function check(chunks) {
  try {
    // check whether parsing the witness as a taproot witness fails
    // this indicates whether `chunks` is a valid taproot input
    taproot.parseTaprootWitness(chunks);
    return true;
  } catch (_a) {
    return false;
  }
}
exports.check = check;
check.toJSON = () => {
  return 'taproot input';
};
