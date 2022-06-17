import BigNumber from 'bignumber.js';
import * as types from './types';

const typeforce = require('typeforce');
const varuint = require('varuint-bitcoin');

// https://github.com/feross/buffer/blob/master/index.js#L1127
function verifuint(value: BigNumber, max: BigNumber): void {
  if (!BigNumber.isBigNumber(value))
    throw new Error('cannot write a non-bignumber as a number');
  if (value.lt(0))
    throw new Error('specified a negative value for writing an unsigned value');
  if (value.gt(max)) throw new Error('RangeError: value out of range');
  if (!value.isInteger()) throw new Error('value has a fractional component');
}

export function readUInt64LE(buffer: Buffer, offset: number): BigNumber {
  const a = buffer.readUInt32LE(offset);
  const b = buffer.readUInt32LE(offset + 4);
  let bigB = new BigNumber(b);
  bigB = bigB.multipliedBy('0x100000000');
  bigB = bigB.plus(a);

  verifuint(bigB, new BigNumber('0xffffffffffffffff'));
  return bigB;
}

export function writeUInt64LE(
  buffer: Buffer,
  value: BigNumber,
  offset: number,
): number {
  verifuint(value, new BigNumber('0xffffffffffffffff'));

  // Little endian - write 32 least significant bits first
  buffer.writeUInt32LE(value.mod('0x100000000').toNumber(), offset);
  // Now write 32 most significant bits
  buffer.writeUInt32LE(
    value
      .dividedToIntegerBy('0x100000000')
      .mod('0x100000000')
      .toNumber(),
    offset + 4,
  );
  return offset + 8;
}

export function reverseBuffer(buffer: Buffer): Buffer {
  if (buffer.length < 1) return buffer;
  let j = buffer.length - 1;
  let tmp = 0;
  for (let i = 0; i < buffer.length / 2; i++) {
    tmp = buffer[i];
    buffer[i] = buffer[j];
    buffer[j] = tmp;
    j--;
  }
  return buffer;
}

export function cloneBuffer(buffer: Buffer): Buffer {
  const clone = Buffer.allocUnsafe(buffer.length);
  buffer.copy(clone);
  return clone;
}

/**
 * Helper class for serialization of bitcoin data types into a pre-allocated buffer.
 */
export class BufferWriter {
  static withCapacity(size: number): BufferWriter {
    return new BufferWriter(Buffer.alloc(size));
  }

  constructor(public buffer: Buffer, public offset: number = 0) {
    typeforce(types.tuple(types.Buffer, types.UInt32), [buffer, offset]);
  }

  writeUInt8(i: number): void {
    this.offset = this.buffer.writeUInt8(i, this.offset);
  }

  writeInt32(i: number): void {
    this.offset = this.buffer.writeInt32LE(i, this.offset);
  }

  writeUInt32(i: number): void {
    this.offset = this.buffer.writeUInt32LE(i, this.offset);
  }

  // UInt64 requires bignumber as js number has max size UInt53
  writeUInt64(i: BigNumber): void {
    this.offset = writeUInt64LE(this.buffer, i, this.offset);
  }

  writeVarInt(i: number): void {
    varuint.encode(i, this.buffer, this.offset);
    this.offset += varuint.encode.bytes;
  }

  writeSlice(slice: Buffer): void {
    if (this.buffer.length < this.offset + slice.length) {
      throw new Error('Cannot write slice out of bounds');
    }
    this.offset += slice.copy(this.buffer, this.offset);
  }

  writeVarSlice(slice: Buffer): void {
    this.writeVarInt(slice.length);
    this.writeSlice(slice);
  }

  writeVector(vector: Buffer[]): void {
    this.writeVarInt(vector.length);
    vector.forEach((buf: Buffer) => this.writeVarSlice(buf));
  }

  end(): Buffer {
    if (this.buffer.length === this.offset) {
      return this.buffer;
    }
    throw new Error(`buffer size ${this.buffer.length}, offset ${this.offset}`);
  }
}

/**
 * Helper class for reading of bitcoin data types from a buffer.
 */
export class BufferReader {
  constructor(public buffer: Buffer, public offset: number = 0) {
    typeforce(types.tuple(types.Buffer, types.UInt32), [buffer, offset]);
  }

  readUInt8(): number {
    const result = this.buffer.readUInt8(this.offset);
    this.offset++;
    return result;
  }

  readInt32(): number {
    const result = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return result;
  }

  readUInt32(): number {
    const result = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return result;
  }

  // UInt64 requires bignumber as js number has max size UInt53
  readUInt64(): BigNumber {
    const result = readUInt64LE(this.buffer, this.offset);
    this.offset += 8;
    return result;
  }

  readVarInt(): number {
    const vi = varuint.decode(this.buffer, this.offset);
    this.offset += varuint.decode.bytes;
    return vi;
  }

  readSlice(n: number): Buffer {
    if (this.buffer.length < this.offset + n) {
      throw new Error('Cannot read slice out of bounds');
    }
    const result = this.buffer.slice(this.offset, this.offset + n);
    this.offset += n;
    return result;
  }

  readVarSlice(): Buffer {
    return this.readSlice(this.readVarInt());
  }

  readVector(): Buffer[] {
    const count = this.readVarInt();
    const vector: Buffer[] = [];
    for (let i = 0; i < count; i++) vector.push(this.readVarSlice());
    return vector;
  }
}
