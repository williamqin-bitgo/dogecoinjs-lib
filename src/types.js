'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.oneOf = exports.Null = exports.BufferN = exports.Function = exports.UInt32 = exports.UInt8 = exports.tuple = exports.maybe = exports.Hex = exports.Buffer = exports.String = exports.Boolean = exports.Array = exports.Number = exports.Hash256bit = exports.Hash160bit = exports.Buffer256bit = exports.Network = exports.ECPoint = exports.Satoshi = exports.Signer = exports.BIP32Path = exports.UInt31 = void 0;
const bignumber_js_1 = require('bignumber.js');
const typeforce = require('typeforce');
const UINT31_MAX = Math.pow(2, 31) - 1;
function UInt31(value) {
  return typeforce.UInt32(value) && value <= UINT31_MAX;
}
exports.UInt31 = UInt31;
function BIP32Path(value) {
  return typeforce.String(value) && !!value.match(/^(m\/)?(\d+'?\/)*\d+'?$/);
}
exports.BIP32Path = BIP32Path;
BIP32Path.toJSON = () => {
  return 'BIP32 derivation path';
};
function Signer(obj) {
  return (
    (typeforce.Buffer(obj.publicKey) ||
      typeof obj.getPublicKey === 'function') &&
    typeof obj.sign === 'function'
  );
}
exports.Signer = Signer;
const SATOSHI_MAX = new bignumber_js_1.default('1e+18'); // Max doge in a tx is 10 B
function Satoshi(value) {
  return (
    typeof value !== 'undefined' &&
    value instanceof bignumber_js_1.default &&
    value.gte(0) &&
    value.lte(SATOSHI_MAX)
  );
}
exports.Satoshi = Satoshi;
// external dependent types
exports.ECPoint = typeforce.quacksLike('Point');
// exposed, external API
exports.Network = typeforce.compile({
  messagePrefix: typeforce.oneOf(typeforce.Buffer, typeforce.String),
  bip32: {
    public: typeforce.UInt32,
    private: typeforce.UInt32,
  },
  pubKeyHash: typeforce.UInt8,
  scriptHash: typeforce.UInt8,
  wif: typeforce.UInt8,
});
exports.Buffer256bit = typeforce.BufferN(32);
exports.Hash160bit = typeforce.BufferN(20);
exports.Hash256bit = typeforce.BufferN(32);
exports.Number = typeforce.Number; // tslint:disable-line variable-name
exports.Array = typeforce.Array;
exports.Boolean = typeforce.Boolean; // tslint:disable-line variable-name
exports.String = typeforce.String; // tslint:disable-line variable-name
exports.Buffer = typeforce.Buffer;
exports.Hex = typeforce.Hex;
exports.maybe = typeforce.maybe;
exports.tuple = typeforce.tuple;
exports.UInt8 = typeforce.UInt8;
exports.UInt32 = typeforce.UInt32;
exports.Function = typeforce.Function;
exports.BufferN = typeforce.BufferN;
exports.Null = typeforce.Null;
exports.oneOf = typeforce.oneOf;
