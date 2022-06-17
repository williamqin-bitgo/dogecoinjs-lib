import * as assert from 'assert';
import { describe, it } from 'mocha';
import { ECPair, TransactionBuilder } from '..';
import * as bscript from '../src/script';

import * as fixtures from './fixtures/dogecoin.json';

const NETWORKS = {
  mainnet: {
    messagePrefix: '\x19Dogecoin Signed Message:\n',
    bip32: {
      private: 0x02fac398,
      public: 0x02facafd,
    },
    pubKeyHash: 0x1e,
    scriptHash: 0x16,
    wif: 0x9e,
  },
  testnet: {
    messagePrefix: '\x19Dogecoin Signed Message:\n',
    bip32: {
      private: 0x04358394,
      public: 0x043587cf,
    },
    pubKeyHash: 0x71,
    scriptHash: 0xc4,
    wif: 0xf1,
  },
};

describe('build', () => {
  fixtures.valid.build.forEach((f: any) => {
    it('builds "' + f.description + '"', () => {
      // @ts-ignore
      const network = NETWORKS[f.network];

      const txb = new TransactionBuilder(network);

      // Inputs
      f.inputs.forEach((input: any) => {
        let prevTxScript;
        if (input.prevTxScript) {
          prevTxScript = bscript.fromASM(input.prevTxScript);
        }

        let inputValue;
        if (input.value) {
          inputValue = BigInt(input.value);
        }

        txb.addInput(
          input.txId,
          input.vout,
          input.sequence,
          prevTxScript,
          inputValue,
        );
      });

      // Outputs
      f.outputs.forEach((output: any) => {
        if (output.address) {
          txb.addOutput(output.address, BigInt(output.value));
        } else {
          txb.addOutput(bscript.fromASM(output.script), BigInt(output.value));
        }
      });

      // Sign
      f.inputs.forEach((input: any, index: number) => {
        if (input.signs) {
          input.signs.forEach((sign: any) => {
            const keyPair = ECPair.fromWIF(sign.keyPair, network);
            let redeemScript;
            let witnessScript;
            let witnessValue;
            let controlBlock;

            if (sign.redeemScript) {
              redeemScript = bscript.fromASM(sign.redeemScript);
            }

            if (sign.value) {
              witnessValue = BigInt(sign.value);
            }

            if (sign.witnessScript) {
              witnessScript = bscript.fromASM(sign.witnessScript);
            }

            if (sign.controlBlock) {
              controlBlock = Buffer.from(sign.controlBlock, 'hex');
            }

            txb.sign({
              prevOutScriptType: sign.prevOutScriptType,
              vin: index,
              keyPair,
              redeemScript,
              hashType: sign.hashType,
              witnessValue,
              witnessScript,
              controlBlock,
            });
          });
        }
      });

      const tx = txb.build();

      assert.strictEqual(tx.toHex(), f.txHex);
    });
  });
});
