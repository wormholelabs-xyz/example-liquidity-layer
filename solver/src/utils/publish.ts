import { Connection, PublicKey } from "@solana/web3.js";
import { writeUint64BE } from "@wormhole-foundation/example-liquidity-layer-solana/common";
import {
    Auction,
    MatchingEngineProgram,
} from "@wormhole-foundation/example-liquidity-layer-solana/matchingEngine";
import { VaaAccount } from "@wormhole-foundation/example-liquidity-layer-solana/wormhole";
import { Logger } from "winston";
import { Publisher } from "../containers";

const MATCHING_ENGINE_ACCOUNTS_CODER = new MatchingEngineProgram(
    new Connection("http://jk"),
    "MatchingEngine11111111111111111111111111111",
    PublicKey.default,
).program.coder.accounts;

export async function publishVaa(publisher: Publisher, rawVaa: Buffer, logger: Logger) {
    await publisher.send(rawVaa, logger);
}

export async function publishPostedVaa(
    publisher: Publisher,
    slot: number,
    messageHash: Buffer,
    encodedAccountData: Buffer,
    logger: Logger,
) {
    if (messageHash.length != 32) {
        throw new Error("Invalid VAA hash length");
    }
    const encodedSlot = Buffer.alloc(8);
    writeUint64BE(encodedSlot, slot);

    await publisher.send(Buffer.concat([encodedSlot, messageHash, encodedAccountData]), logger);
    logger.debug(`Posted VAA. slot: ${slot}, data.length: ${encodedAccountData.length}`);
}

export function readVaaAccount(msg: Buffer): { messageHash: Buffer; vaa: VaaAccount } {
    return { messageHash: msg.subarray(0, 32), vaa: VaaAccount.deserialize(msg.subarray(32)) };
}

export async function publishAuction(
    publisher: Publisher,
    slot: number,
    encodedAccountData: Buffer,
    logger: Logger,
) {
    const encodedSlot = Buffer.alloc(8);
    writeUint64BE(encodedSlot, slot);

    await publisher.send(Buffer.concat([encodedSlot, encodedAccountData]), logger);
    logger.debug(`Auction. slot: ${slot}, data.length: ${encodedAccountData.length}`);
}

export function readAuction(msg: Buffer): { slot: bigint; auctionData: Auction } {
    const slot = msg.readBigUInt64BE();
    return { slot, auctionData: decodeAuction(msg.subarray(8)) };
}

export function decodeAuction(encodedAuctionData: Buffer): Auction {
    return MATCHING_ENGINE_ACCOUNTS_CODER.decode("auction", encodedAuctionData);
}
