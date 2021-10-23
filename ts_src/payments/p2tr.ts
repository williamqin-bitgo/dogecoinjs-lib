// SegWit version 1 P2TR output type for Taproot defined in
// https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki

import { bitcoin as BITCOIN_NETWORK } from '../networks';
import { isXOnlyPoint } from '../schnorrBip340';
import * as bscript from '../script';
import * as taproot from '../taproot';
import { Payment, PaymentOpts } from './index';
import * as lazy from './lazy';
const typef = require('typeforce');
const OPS = bscript.OPS;

const { bech32m } = require('bech32');

/**
 * A secp256k1 x coordinate with unknown discrete logarithm used for eliminating
 * keypath spends, equal to SHA256(uncompressedDER(SECP256K1_GENERATOR_POINT)).
 */
const H = Buffer.from(
  '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
  'hex',
);
const EMPTY_BUFFER = Buffer.alloc(0);

// output: OP_1 {witnessProgram}
export function p2tr(a: Payment, opts?: PaymentOpts): Payment {
  if (
    !a.address &&
    !a.pubkey &&
    !a.pubkeys &&
    !a.redeems &&
    !a.output &&
    !a.witness
  )
    throw new TypeError('Not enough data');
  opts = Object.assign({ validate: true }, opts || {});

  typef(
    {
      network: typef.maybe(typef.Object),

      address: typef.maybe(typef.String),
      // the output script should be a fixed 34 bytes.
      // 1 byte for OP_1 indicating segwit version 1, one byte for 0x20 to push
      // the next 32 bytes, followed by the 32 byte witness program
      output: typef.maybe(typef.BufferN(34)),
      // a single pubkey
      pubkey: typef.maybe(isXOnlyPoint),
      // the pub key(s) used for keypath signing.
      // aggregated with MuSig2* if > 1
      pubkeys: typef.maybe(typef.arrayOf(isXOnlyPoint)),

      redeems: typef.maybe(
        typef.arrayOf({
          network: typef.maybe(typef.Object),
          output: typef.maybe(typef.Buffer),
          weight: typef.maybe(typef.Number),
          witness: typef.maybe(typef.arrayOf(typef.Buffer)),
        }),
      ),
      redeemIndex: typef.maybe(typef.Number), // Selects the redeem to spend

      controlBlock: typef.maybe(typef.Buffer),
      annex: typef.maybe(typef.Buffer),
    },
    a,
  );

  const _address = lazy.value(() => {
    if (!a.address) return undefined;

    const result = bech32m.decode(a.address);
    const version = result.words.shift();
    const data = bech32m.fromWords(result.words);
    return {
      version,
      prefix: result.prefix,
      data: Buffer.from(data),
    };
  });

  const _taptree = lazy.value(() => {
    if (!a.redeems) return;
    const outputs: Array<Buffer | undefined> = a.redeems.map(
      ({ output }) => output,
    );
    if (!outputs.every(output => output)) return;
    return taproot.getHuffmanTaptree(
      outputs as Buffer[],
      a.redeems.map(({ weight }) => weight),
    );
  });
  const _parsedControlBlock = lazy.value(() => {
    if (!a.controlBlock) return;
    return taproot.parseControlBlock(a.controlBlock);
  });
  const _internalPubkey = lazy.value(() => {
    if (a.pubkey) {
      // single pubkey
      return a.pubkey;
    } else if (a.pubkeys && a.pubkeys.length === 1) {
      return a.pubkeys[0];
    } else if (a.pubkeys && a.pubkeys.length > 1) {
      // multiple pubkeys
      return taproot.aggregateMuSigPubkeys(a.pubkeys);
    } else if (_parsedControlBlock()) {
      return _parsedControlBlock()!.internalPubkey;
    } else {
      // no key path
      if (!a.redeems) return; // must have either redeems or pubkey(s)

      // If there is no key path spending condition, we use an internal key with unknown secret key.
      // TODO: In order to avoid leaking the information that key path spending is not possible it
      // is recommended to pick a fresh integer r in the range 0...n-1 uniformly at random and use
      // H + rG as internal key. It is possible to prove that this internal key does not have a
      // known discrete logarithm with respect to G by revealing r to a verifier who can then
      // reconstruct how the internal key was created.
      return H;
    }
  });
  const _taprootPubkey = lazy.value(() => {
    // this should be `a.output || _address()?.data` but prettier doesn't recognize ? operator
    const output = a.output || (a.address ? _address()!.data : undefined);
    if (output) {
      // we remove the first two bytes (OP_1 0x20) from the output script to
      // extract the 32 byte taproot pubkey (aka witness program)
      return { pubkey: output.slice(2), parity: 0 as (0 | 1) };
    }

    const internalPubkey = _internalPubkey();
    if (!internalPubkey) return;

    let taptreeRoot;
    if (
      a.controlBlock &&
      a.redeems &&
      a.redeems.length &&
      a.redeemIndex !== undefined &&
      a.redeems[a.redeemIndex].output
    ) {
      // Calculate taptree root from script + path
      taptreeRoot = taproot.getTaptreeRoot(
        _parsedControlBlock()!,
        a.redeems[a.redeemIndex].output!,
      );
    } else {
      const taptree = _taptree();
      if (taptree) taptreeRoot = taptree.root;
    }
    return taproot.tapTweakPubkey(internalPubkey, taptreeRoot);
  });

  const network = a.network || BITCOIN_NETWORK;

  const o: Payment = { network };

  lazy.prop(o, 'address', () => {
    if (!a.output && !o.output) return;

    // only encode the 32 byte witness program as bech32m
    const words = bech32m.toWords(_taprootPubkey()!.pubkey);
    words.unshift(0x01);
    return bech32m.encode(network.bech32, words);
  });
  lazy.prop(o, 'controlBlock', () => {
    const taprootPubkey = _taprootPubkey();
    const internalPubkey = _internalPubkey();
    const taptree = _taptree();
    if (
      !taprootPubkey ||
      !internalPubkey ||
      !taptree ||
      a.redeemIndex === undefined
    )
      return;
    return taproot.getControlBlock(
      taprootPubkey.parity,
      internalPubkey,
      taptree.paths[a.redeemIndex],
    );
  });
  lazy.prop(o, 'output', () => {
    if (a.address) {
      const { data } = _address()!;
      return bscript.compile([OPS.OP_1, data]);
    }

    const taprootPubkey = _taprootPubkey();
    if (!taprootPubkey) return;

    // OP_1 indicates segwit version 1
    return bscript.compile([OPS.OP_1, taprootPubkey.pubkey]);
  });
  lazy.prop(o, 'witness', () => {
    if (!a.redeems) {
      if (a.signature) return [a.signature]; // Keypath spend
      return;
    } else if (a.redeemIndex === undefined) {
      return; // No chosen redeem script, can't make witness
    }

    const chosenRedeem = a.redeems[a.redeemIndex];
    if (!chosenRedeem) return;

    let witness;
    // some callers may provide witness elements in the input script
    if (
      chosenRedeem.input &&
      chosenRedeem.input.length > 0 &&
      chosenRedeem.output &&
      chosenRedeem.output.length > 0
    ) {
      // transform redeem input to witness stack
      witness = bscript.toStack(bscript.decompile(chosenRedeem.input)!);

      // assign, and blank the existing input
      o.redeems![a.redeemIndex] = Object.assign({ witness }, chosenRedeem);
      o.redeems![a.redeemIndex].input = EMPTY_BUFFER;
    } else if (
      chosenRedeem.output &&
      chosenRedeem.output.length > 0 &&
      chosenRedeem.witness &&
      chosenRedeem.witness.length > 0
    ) {
      witness = chosenRedeem.witness;
    } else {
      return;
    }

    // tapscript
    witness.push(chosenRedeem.output);

    if (!o.controlBlock) return;
    witness.push(o.controlBlock);

    if (a.annex) {
      witness.push(a.annex);
    }

    return witness;
  });
  lazy.prop(o, 'name', () => {
    const nameParts = ['p2tr'];
    return nameParts.join('-');
  });
  lazy.prop(o, 'redeem', () => {
    if (a.redeems && a.redeemIndex !== undefined)
      return a.redeems[a.redeemIndex];
  });

  // extended validation
  if (opts.validate) {
    // TODO: complete extended validation
    if (a.output) {
      if (a.output[0] !== OPS.OP_1 || a.output[1] !== 0x20)
        throw new TypeError('Output is invalid');

      if (a.address) {
        // if we're passed both an output script and an address, ensure they match
        if (Buffer.compare(_address()!.data, _taprootPubkey()!.pubkey) !== 0) {
          throw new TypeError('mismatch between address & output');
        }
      }
    }

    if (a.controlBlock && a.pubkeys && a.pubkeys.length) {
      if (!_parsedControlBlock()!.internalPubkey.equals(_internalPubkey()!)) {
        throw new TypeError('Internal pubkey mismatch');
      }
    }

    if (a.signature) {
      if (!bscript.isCanonicalSchnorrSignature(a.signature)) {
        throw new TypeError('signature is not a valid schnorr signature');
      }
    }

    if (a.witness) {
      const parsedWitness = taproot.parseTaprootWitness(a.witness);

      if (parsedWitness.spendType === 'Key') {
        // parsedWitness is key path spend schnorr signature
        if (
          a.signature &&
          Buffer.compare(a.signature, parsedWitness.signature) !== 0
        ) {
          throw new TypeError('mismatch between witness & signature');
        }
      } else {
        // parsedWitness is script path spend witness stack
        // ensure that our witness stack contains a script that is included in our taproot pub key
        if (
          !taproot.isValidTapscript(parsedWitness, _taprootPubkey()!.pubkey)
        ) {
          throw new TypeError(
            'tapscript & control block does not match witness program ',
          );
        }
      }
    }
    if (a.redeems) {
      a.redeems.forEach(redeem => {
        if (redeem.network && redeem.network !== network)
          throw new TypeError('Network mismatch');
      });
    }
    if (a.redeemIndex !== undefined && a.redeems) {
      if (a.redeemIndex < 0 || a.redeemIndex >= a.redeems.length)
        throw new TypeError(
          'Redeem index must be 0 <= redeemIndex < redeems.length',
        );
    }
  }

  return Object.assign(o, a);
}
