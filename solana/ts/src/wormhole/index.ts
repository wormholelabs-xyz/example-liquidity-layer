import { Connection, PublicKey } from "@solana/web3.js";
import { ChainId, isChainId, toChainId } from "@wormhole-foundation/sdk-base";
import { deserialize, keccak256 } from "@wormhole-foundation/sdk-definitions";
export * from "./spy";

export type PostedVaaV1 = {
    consistencyLevel: number;
    timestamp: number;
    signatureSet: PublicKey;
    guardianSetIndex: number;
    nonce: number;
    sequence: bigint;
    emitterChain: ChainId;
    emitterAddress: Array<number>;
    payload: Buffer;
};

export type EmitterInfo = {
    chain: ChainId;
    address: Array<number>;
    sequence: bigint;
};

export class VaaAccount {
    private _postedVaaV1?: PostedVaaV1;

    static async fetch(connection: Connection, addr: PublicKey): Promise<VaaAccount> {
        const accInfo = await connection.getAccountInfo(addr);
        if (accInfo === null) {
            throw new Error("no VAA account info found");
        }
        return VaaAccount.deserialize(accInfo.data);
    }

    static deserialize(data: Buffer): VaaAccount {
        let offset = 0;
        const disc = data.subarray(offset, (offset += 4));
        if (disc.equals(Uint8Array.from([118, 97, 97, 1]))) {
            const consistencyLevel = data[offset];
            offset += 1;
            const timestamp = data.readUInt32LE(offset);
            offset += 4;
            const signatureSet = new PublicKey(data.subarray(offset, (offset += 32)));
            const guardianSetIndex = data.readUInt32LE(offset);
            offset += 4;
            const nonce = data.readUInt32LE(offset);
            offset += 4;
            const sequence = data.readBigUInt64LE(offset);
            offset += 8;
            const emitterChain = data.readUInt16LE(offset);
            if (!isChainId(emitterChain)) {
                throw new Error("invalid emitter chain");
            }
            offset += 2;
            const emitterAddress = Array.from(data.subarray(offset, (offset += 32)));
            const payloadLen = data.readUInt32LE(offset);
            offset += 4;
            const payload = data.subarray(offset, (offset += payloadLen));

            return new VaaAccount({
                postedVaaV1: {
                    consistencyLevel,
                    timestamp,
                    signatureSet,
                    guardianSetIndex,
                    nonce,
                    sequence,
                    emitterChain,
                    emitterAddress,
                    payload,
                },
            });
        } else {
            throw new Error("invalid VAA account data");
        }
    }

    emitterInfo(): EmitterInfo {
        if (this._postedVaaV1 !== undefined) {
            const { emitterChain: chain, emitterAddress: address, sequence } = this._postedVaaV1;
            return {
                chain,
                address,
                sequence,
            };
        } else {
            throw new Error("impossible: emitterInfo() failed");
        }
    }

    timestamp(): number {
        if (this._postedVaaV1 !== undefined) {
            return this._postedVaaV1.timestamp;
        } else {
            throw new Error("impossible: timestamp() failed");
        }
    }

    payload(): Buffer {
        if (this._postedVaaV1 !== undefined) {
            return this._postedVaaV1.payload;
        } else {
            throw new Error("impossible: payload() failed");
        }
    }

    hash(): Uint8Array {
        if (this._postedVaaV1 !== undefined) {
            const {
                consistencyLevel,
                timestamp,
                nonce,
                sequence,
                emitterChain,
                emitterAddress,
                payload,
            } = this._postedVaaV1;

            let offset = 0;
            const buf = Buffer.alloc(51 + payload.length);
            offset = buf.writeUInt32BE(timestamp, offset);
            offset = buf.writeUInt32BE(nonce, offset);
            offset = buf.writeUInt16BE(emitterChain, offset);
            buf.set(emitterAddress, offset);
            offset += 32;
            offset = buf.writeBigUInt64BE(sequence, offset);
            offset = buf.writeUInt8(consistencyLevel, offset);
            buf.set(payload, offset);

            return keccak256(buf);
        } else {
            throw new Error("impossible: hash() failed");
        }
    }

    digest(): Uint8Array {
        return keccak256(this.hash());
    }

    get postedVaaV1(): PostedVaaV1 {
        if (this._postedVaaV1 === undefined) {
            throw new Error("VaaAccount does not have postedVaaV1");
        }
        return this._postedVaaV1;
    }

    private constructor(data: { postedVaaV1?: PostedVaaV1 }) {
        const { postedVaaV1 } = data;
        this._postedVaaV1 = postedVaaV1;
    }
}
