// Taproot-specific key aggregation and taptree logic as defined in:
// https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
// https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki

import assert = require('assert');
import FastPriorityQueue = require('fastpriorityqueue');
import * as bcrypto from './crypto';
import * as schnorrBip340 from './schnorrBip340';
import * as bscript from './script';
const varuint = require('varuint-bitcoin');

const ecc = require('tiny-secp256k1');

/**
 * The 0x02 prefix indicating an even Y coordinate which is implicitly assumed
 * on all 32 byte x-only pub keys as defined in BIP340.
 */
export const EVEN_Y_COORD_PREFIX = new Uint8Array([0x02]);
const INITIAL_TAPSCRIPT_VERSION = new Uint8Array([0xc0]);

const TAGS = [
  'TapLeaf',
  'TapBranch',
  'TapTweak',
  'KeyAgg list',
  'KeyAgg coefficient',
  'TapSighash',
] as const;
type TaggedHashPrefix = typeof TAGS[number];
/** An object mapping tags to their tagged hash prefix of [SHA256(tag) | SHA256(tag)] */
const TAGGED_HASH_PREFIXES = Object.fromEntries(
  TAGS.map(tag => {
    const tagHash = bcrypto.sha256(Buffer.from(tag));
    return [tag, Buffer.concat([tagHash, tagHash])];
  }),
) as { [k in TaggedHashPrefix]: Buffer };

/**
 * Calculates a BIP340-style tagged hash of the data with the given prefix.
 * @param prefix the prefix to tag with
 * @param data the data to hash
 * @return {Buffer} the resulting tagged hash
 */
export function taggedHash(prefix: TaggedHashPrefix, data: Buffer): Buffer {
  return bcrypto.sha256(Buffer.concat([TAGGED_HASH_PREFIXES[prefix], data]));
}

/**
 * Aggregates a list of public keys into a single MuSig2* public key
 * according to the MuSig2 paper.
 * @param pubkeys The list of pub keys to aggregate
 * @returns a 32 byte Buffer representing the aggregate key
 */
export function aggregateMuSigPubkeys(pubkeys: Buffer[]): Buffer {
  // TODO: Consider enforcing key uniqueness.
  assert(
    pubkeys.length > 1,
    'at least two pubkeys are required for musig key aggregation',
  );

  // Sort the keys in ascending order
  pubkeys.sort(Buffer.compare);

  // In MuSig all signers contribute key material to a single signing key,
  // using the equation
  //
  //     P = sum_i µ_i * P_i
  //
  // where `P_i` is the public key of the `i`th signer and `µ_i` is a so-called
  // _MuSig coefficient_ computed according to the following equation
  //
  // L = H(P_1 || P_2 || ... || P_n)
  // µ_i = H(L || P_i)

  const L = taggedHash('KeyAgg list', Buffer.concat(pubkeys));

  const tweakedPubkeys: Buffer[] = pubkeys.map((pubkey, index) => {
    const xyPubkey = Buffer.concat([EVEN_Y_COORD_PREFIX, pubkey]);

    if (index === 1) {
      // The second unique key in the pubkey list gets the constant KeyAgg
      // coefficient 1 which saves an exponentiation. See the MuSig2*
      // appendix in the MuSig2 paper for details.
      return xyPubkey;
    }

    const c = taggedHash('KeyAgg coefficient', Buffer.concat([L, pubkey]));

    return ecc.pointMultiply(xyPubkey, c);
  });
  const aggregatePubkey = tweakedPubkeys.reduce((prev, curr) =>
    ecc.pointAdd(prev, curr),
  );

  return aggregatePubkey.slice(1);
}

/**
 * Encodes the length of a script as a bitcoin variable length integer.
 * @param script
 * @returns
 */
export function serializeScriptSize(script: Buffer): Buffer {
  return varuint.encode(script.length);
}

/**
 * Gets a tapleaf tagged hash from a script.
 * @param script
 * @returns
 */
export function hashTapLeaf(script: Buffer): Buffer {
  const size = serializeScriptSize(script);
  return taggedHash(
    'TapLeaf',
    Buffer.concat([INITIAL_TAPSCRIPT_VERSION, size, script]),
  );
}

/**
 * Creates a lexicographically sorted tapbranch from two child taptree nodes
 * and returns its tagged hash.
 * @param child1
 * @param child2
 * @returns the tagged tapbranch hash
 */
export function hashTapBranch(child1: Buffer, child2: Buffer): Buffer {
  // sort the children lexicographically
  const sortedChildren = [child1, child2].sort(Buffer.compare);

  return taggedHash('TapBranch', Buffer.concat(sortedChildren));
}

function calculateTapTweak(pubkey: Buffer, taptreeRoot?: Buffer): Buffer {
  if (taptreeRoot) {
    return taggedHash('TapTweak', Buffer.concat([pubkey, taptreeRoot]));
  }
  // If the spending conditions do not require a script path, the output key should commit to an
  // unspendable script path instead of having no script path.
  // https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki#cite_note-22
  return taggedHash('TapTweak', pubkey);
}

/**
 * Tweaks a privkey, using the tagged hash of its pubkey, and (optionally) a taptree root
 * @param pubkey public key, used to calculate the tweak
 * @param privkey the privkey to tweak
 * @param taptreeRoot the taptree root tagged hash
 * @returns {Buffer} the tweaked privkey
 */
export function tapTweakPrivkey(
  pubkey: Buffer,
  privkey: Buffer,
  taptreeRoot?: Buffer,
): Buffer {
  const tapTweak = calculateTapTweak(pubkey, taptreeRoot);
  return ecc.privateAdd(schnorrBip340.forceEvenYPrivKey(privkey), tapTweak);
}

export interface TweakedPubkey {
  parity: 0 | 1;
  pubkey: Buffer;
}

/**
 * Tweaks an internal pubkey, using the tagged hash of itself, and (optionally) a taptree root
 * @param pubkey the internal pubkey to tweak
 * @param taptreeRoot the taptree root tagged hash
 * @returns {TweakedPubkey} the tweaked pubkey
 */
export function tapTweakPubkey(
  pubkey: Buffer,
  taptreeRoot?: Buffer,
): TweakedPubkey {
  const tapTweak = calculateTapTweak(pubkey, taptreeRoot);

  const tweakedPubkey = ecc.pointAddScalar(
    Buffer.concat([EVEN_Y_COORD_PREFIX, pubkey]),
    tapTweak,
  );
  return {
    parity: tweakedPubkey[0] === EVEN_Y_COORD_PREFIX[0] ? 0 : 1,
    pubkey: tweakedPubkey.slice(1),
  };
}

export interface Taptree {
  root: Buffer;
  paths: Buffer[][];
}

interface WeightedTapScript {
  /** A TapLeaf or TapBranch tagged hash */
  taggedHash: Buffer;
  weight: number;
  paths: {
    [index: number]: Buffer[];
  };
}

/**
 * Gets the root hash of a taptree using a weighted Huffman construction from a
 * list of scripts and corresponding weights.
 * @param scripts
 * @param weights
 * @returns {Taptree} the tree, represented by its root hash, and the paths to that root from each of the input scripts
 */
export function getHuffmanTaptree(
  scripts: Buffer[],
  weights: Array<number | undefined>,
): Taptree {
  assert(
    scripts.length > 0,
    'at least one script is required to construct a tap tree',
  );

  // Create a queue/heap of the provided scripts prioritized according to their
  // corresponding weights.
  const queue = new FastPriorityQueue<WeightedTapScript>(
    (a, b): boolean => {
      return a.weight < b.weight;
    },
  );
  scripts.forEach((script, index) => {
    const weight = weights[index] || 1;
    assert(weight > 0, 'script weight must be a positive value');

    queue.add({
      weight,
      taggedHash: hashTapLeaf(script),
      paths: { [index]: [] },
    });
  });

  // Now that we have a queue of weighted scripts, we begin a loop whereby we
  // remove the two lowest weighted items from the queue. We create a tap branch
  // node from the two items, and add the branch back to the queue with the
  // combined weight of both its children. Each loop reduces the number of items
  // in the queue by one, and we repeat until we are left with only one item -
  // this becomes the tap tree root.
  //
  // For example, if we begin with scripts A, B, C, D with weights 6, 3, 1, 1
  // After first loop: A(6), B(3), CD(1 + 1)
  // After second loop: A(6), B[CD](3 + 2)
  // Final loop: A[B[CD]](6+5)
  // The final tree will look like:
  //
  //        A[B[CD]]
  //       /        \
  //      A         B[CD]
  //               /     \
  //              B      [CD]
  //                    /    \
  //                   C      D
  //
  // This ensures that the spending conditions we believe to have the highest
  // probability of being used are further up the tree than less likely scripts,
  // thereby reducing the size of the merkle proofs for the more likely scripts.
  while (queue.size > 1) {
    // We can safely expect two polls to return non-null elements since we've
    // checked that the queue has at least two elements before looping.
    const child1 = queue.poll()!;
    const child2 = queue.poll()!;

    Object.values(child1.paths).forEach(path => path.push(child2.taggedHash));
    Object.values(child2.paths).forEach(path => path.push(child1.taggedHash));

    queue.add({
      taggedHash: hashTapBranch(child1.taggedHash, child2.taggedHash),
      weight: child1.weight + child2.weight,
      paths: { ...child1.paths, ...child2.paths },
    });
  }

  // After the while loop above completes we should have exactly one element
  // remaining in the queue, which we can safely extract below.
  const rootNode = queue.poll()!;

  const paths = Object.entries(rootNode.paths).reduce((acc, [index, path]) => {
    acc[Number(index)] = path; // TODO: Why doesn't TS know it's a number?
    return acc;
  }, Array(scripts.length));
  return { root: rootNode.taggedHash, paths };
}

export function getControlBlock(
  parity: 0 | 1,
  pubkey: Buffer,
  path: Buffer[],
): Buffer {
  const parityVersion = INITIAL_TAPSCRIPT_VERSION[0] + parity;

  return Buffer.concat([new Uint8Array([parityVersion]), pubkey, ...path]);
}

export interface KeyPathWitness {
  spendType: 'Key';
  signature: Buffer;
  annex?: Buffer;
}

export interface ScriptPathWitness {
  spendType: 'Script';
  scriptSig: Buffer[];
  tapscript: Buffer;
  controlBlock: Buffer;
  annex?: Buffer;
}

export interface ControlBlock {
  parity: number;
  internalPubkey: Buffer;
  leafVersion: number;
  path: Buffer[];
}

/**
 * Parses a taproot witness stack and extracts key data elements.
 * @param witnessStack
 * @returns {ScriptPathWitness|KeyPathWitness} an object representing the
 * parsed witness for a script path or key path spend.
 * @throws {Error} if the witness stack does not conform to the BIP 341 script validation rules
 */
export function parseTaprootWitness(
  witnessStack: Buffer[],
): ScriptPathWitness | KeyPathWitness {
  let annex;
  if (
    witnessStack.length >= 2 &&
    witnessStack[witnessStack.length - 1][0] === 0x50
  ) {
    // If there are at least two witness elements, and the first byte of the last element is
    // 0x50, this last element is called annex a and is removed from the witness stack
    annex = witnessStack[witnessStack.length - 1];
    witnessStack = witnessStack.slice(0, -1);
  }

  if (witnessStack.length < 1) {
    throw new Error('witness stack must have at least one element');
  } else if (witnessStack.length === 1) {
    // key path spend
    const signature = witnessStack[0];
    if (!bscript.isCanonicalSchnorrSignature(signature)) {
      throw new Error('invalid signature');
    }
    return { spendType: 'Key', signature, annex };
  }

  // script path spend
  // second to last element is the tapscript
  const tapscript = witnessStack[witnessStack.length - 2];
  const tapscriptChunks = bscript.decompile(tapscript);

  if (!tapscriptChunks || tapscriptChunks.length === 0) {
    throw new Error('tapscript is not a valid script');
  }

  // The last stack element is called the control block c, and must have length 33 + 32m,
  // for a value of m that is an integer between 0 and 128, inclusive
  const controlBlock = witnessStack[witnessStack.length - 1];
  if (
    controlBlock.length < 33 ||
    controlBlock.length > 33 + 32 * 128 ||
    controlBlock.length % 32 !== 1
  ) {
    throw new Error('invalid control block length');
  }

  return {
    spendType: 'Script',
    scriptSig: witnessStack.slice(0, -2),
    tapscript,
    controlBlock,
    annex,
  };
}

/**
 * Parses a taproot control block.
 * @param controlBlock the control block to parse
 * @returns {ControlBlock} the parsed control block
 * @throws {Error} if the witness stack does not conform to the BIP 341 script validation rules
 */
export function parseControlBlock(controlBlock: Buffer): ControlBlock {
  if ((controlBlock.length - 1) % 32 !== 0)
    throw new TypeError('Invalid control block length');

  const parity = controlBlock[0] & 0x01;

  // Let p = c[1:33] and let P = lift_x(int(p)) where lift_x and [:] are defined as in BIP340.
  // Fail if this point is not on the curve
  const internalPubkey = controlBlock.slice(1, 33);
  if (!ecc.isPoint(Buffer.concat([EVEN_Y_COORD_PREFIX, internalPubkey]))) {
    throw new Error('internal pubkey is not an EC point');
  }

  // The leaf version cannot be 0x50 as that would result in ambiguity with the annex.
  const leafVersion = controlBlock[0] & 0xfe;
  if (leafVersion === 0x50) {
    throw new Error('invalid leaf version');
  }

  const path: Buffer[] = [];
  for (let j = 33; j < controlBlock.length; j += 32) {
    path.push(controlBlock.slice(j, j + 32));
  }

  return {
    parity,
    internalPubkey,
    leafVersion,
    path,
  };
}

/**
 * Calculates the tapleaf hash from a control block and script.
 * @param controlBlock the control block, either raw or parsed
 * @param tapscript the leaf script corresdponding to the control block
 * @returns {Buffer} the tapleaf hash
 */
export function getTapleafHash(
  controlBlock: Buffer | ControlBlock,
  tapscript: Buffer,
): Buffer {
  if (Buffer.isBuffer(controlBlock)) {
    controlBlock = parseControlBlock(controlBlock);
  }
  const { leafVersion } = controlBlock;

  return taggedHash(
    'TapLeaf',
    Buffer.concat([
      new Uint8Array([leafVersion]),
      serializeScriptSize(tapscript),
      tapscript,
    ]),
  );
}

/**
 * Calculates the taptree root hash from a control block and script.
 * @param controlBlock the control block, either raw or parsed
 * @param tapscript the leaf script corresdponding to the control block
 * @param tapleafHash the leaf hash if already calculated
 * @returns {Buffer} the taptree root hash
 */
export function getTaptreeRoot(
  controlBlock: Buffer | ControlBlock,
  tapscript: Buffer,
  tapleafHash?: Buffer,
): Buffer {
  if (Buffer.isBuffer(controlBlock)) {
    controlBlock = parseControlBlock(controlBlock);
  }
  const { path } = controlBlock;

  tapleafHash = tapleafHash || getTapleafHash(controlBlock, tapscript);

  // `taptreeMerkleHash` begins as our tapscript tapleaf hash and its value iterates
  // through its parent tapbranch hashes until it ends up as the taptree root hash
  let taptreeMerkleHash = tapleafHash;
  for (const taptreeSiblingHash of path) {
    taptreeMerkleHash =
      Buffer.compare(taptreeMerkleHash, taptreeSiblingHash) === -1
        ? taggedHash(
            'TapBranch',
            Buffer.concat([taptreeMerkleHash, taptreeSiblingHash]),
          )
        : taggedHash(
            'TapBranch',
            Buffer.concat([taptreeSiblingHash, taptreeMerkleHash]),
          );
  }

  return taptreeMerkleHash;
}
