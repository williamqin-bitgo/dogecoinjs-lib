/// <reference types="node" />
import BigNumber from 'bignumber.js';
import { Signer } from './ecpair';
import { Network } from './networks';
import { Transaction } from './transaction';
interface TxbSignArg {
    prevOutScriptType: string;
    vin: number;
    keyPair: Signer;
    redeemScript?: Buffer;
    hashType?: number;
    witnessValue?: BigNumber;
    witnessScript?: Buffer;
    controlBlock?: Buffer;
    annex?: Buffer;
}
export declare class TransactionBuilder {
    network: Network;
    maximumFeeRate: number;
    static fromTransaction(transaction: Transaction, network?: Network): TransactionBuilder;
    private __PREV_TX_SET;
    private __INPUTS;
    private __TX;
    private __USE_LOW_R;
    constructor(network?: Network, maximumFeeRate?: number);
    setLowR(setting?: boolean): boolean;
    setLockTime(locktime: number): void;
    setVersion(version: number): void;
    addInput(txHash: Buffer | string | Transaction, vout: number, sequence?: number, prevOutScript?: Buffer, value?: BigNumber): number;
    addOutput(scriptPubKey: string | Buffer, value: BigNumber): number;
    build(): Transaction;
    buildIncomplete(): Transaction;
    sign(signParams: number | TxbSignArg, keyPair?: Signer, redeemScript?: Buffer, hashType?: number, witnessValue?: BigNumber, witnessScript?: Buffer, controlBlock?: Buffer, annex?: Buffer): void;
    private __addInputUnsafe;
    private __build;
    private __canModifyInputs;
    private __needsOutputs;
    private __canModifyOutputs;
    private __overMaximumFees;
}
export {};
