/// <reference types="node" />
/**
 * The 0x02 prefix indicating an even Y coordinate which is implicitly assumed
 * on all 32 byte x-only pub keys as defined in BIP340.
 */
export declare const EVEN_Y_COORD_PREFIX: Buffer;
declare const TAGS: readonly ["TapLeaf", "TapBranch", "TapTweak", "KeyAgg list", "KeyAgg coefficient", "TapSighash"];
declare type TaggedHashPrefix = typeof TAGS[number];
/**
 * Calculates a BIP340-style tagged hash of the data with the given prefix.
 * @param prefix the prefix to tag with
 * @param data the data to hash
 * @return {Buffer} the resulting tagged hash
 */
export declare function taggedHash(prefix: TaggedHashPrefix, data: Buffer): Buffer;
/**
 * Aggregates a list of public keys into a single MuSig2* public key
 * according to the MuSig2 paper.
 * @param pubkeys The list of pub keys to aggregate
 * @returns a 32 byte Buffer representing the aggregate key
 */
export declare function aggregateMuSigPubkeys(pubkeys: Buffer[]): Buffer;
/**
 * Encodes the length of a script as a bitcoin variable length integer.
 * @param script
 * @returns
 */
export declare function serializeScriptSize(script: Buffer): Buffer;
/**
 * Gets a tapleaf tagged hash from a script.
 * @param script
 * @returns
 */
export declare function hashTapLeaf(script: Buffer): Buffer;
/**
 * Creates a lexicographically sorted tapbranch from two child taptree nodes
 * and returns its tagged hash.
 * @param child1
 * @param child2
 * @returns the tagged tapbranch hash
 */
export declare function hashTapBranch(child1: Buffer, child2: Buffer): Buffer;
/**
 * Tweaks a privkey, using the tagged hash of its pubkey, and (optionally) a taptree root
 * @param pubkey public key, used to calculate the tweak
 * @param privkey the privkey to tweak
 * @param taptreeRoot the taptree root tagged hash
 * @returns {Buffer} the tweaked privkey
 */
export declare function tapTweakPrivkey(pubkey: Buffer, privkey: Buffer, taptreeRoot?: Buffer): Buffer;
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
export declare function tapTweakPubkey(pubkey: Buffer, taptreeRoot?: Buffer): TweakedPubkey;
export interface Taptree {
    root: Buffer;
    paths: Buffer[][];
}
/**
 * Gets the root hash of a taptree using a weighted Huffman construction from a
 * list of scripts and corresponding weights.
 * @param scripts
 * @param weights
 * @returns {Taptree} the tree, represented by its root hash, and the paths to that root from each of the input scripts
 */
export declare function getHuffmanTaptree(scripts: Buffer[], weights: Array<number | undefined>): Taptree;
export declare function getControlBlock(parity: 0 | 1, pubkey: Buffer, path: Buffer[]): Buffer;
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
export declare function parseTaprootWitness(witnessStack: Buffer[]): ScriptPathWitness | KeyPathWitness;
/**
 * Parses a taproot control block.
 * @param controlBlock the control block to parse
 * @returns {ControlBlock} the parsed control block
 * @throws {Error} if the witness stack does not conform to the BIP 341 script validation rules
 */
export declare function parseControlBlock(controlBlock: Buffer): ControlBlock;
/**
 * Calculates the tapleaf hash from a control block and script.
 * @param controlBlock the control block, either raw or parsed
 * @param tapscript the leaf script corresdponding to the control block
 * @returns {Buffer} the tapleaf hash
 */
export declare function getTapleafHash(controlBlock: Buffer | ControlBlock, tapscript: Buffer): Buffer;
/**
 * Calculates the taptree root hash from a control block and script.
 * @param controlBlock the control block, either raw or parsed
 * @param tapscript the leaf script corresdponding to the control block
 * @param tapleafHash the leaf hash if already calculated
 * @returns {Buffer} the taptree root hash
 */
export declare function getTaptreeRoot(controlBlock: Buffer | ControlBlock, tapscript: Buffer, tapleafHash?: Buffer): Buffer;
export {};
