import { PublicKey } from "@solana/web3.js";
import {
    AuctionInfo,
    MessageProtocol,
} from "@wormhole-foundation/example-liquidity-layer-solana/matchingEngine";
import { KnownFastOrder } from "./KnownFastOrders";

export type AuctionExecution = {
    fastVaaHash: Buffer;
    preparedBy: PublicKey;
    auctionInfo: AuctionInfo;
};

export type AuctionExecutionWithOrder = AuctionExecution & KnownFastOrder;

export class AuctionExecutionCandidates {
    private _candidates: Map<
        string,
        {
            endSlot: bigint;
            auctionExecution: AuctionExecution;
            targetProtocol: MessageProtocol;
            execute: boolean;
        }
    >;

    constructor() {
        this._candidates = new Map();
    }

    add(endSlot: bigint, auctionExecution: AuctionExecution, targetProtocol: MessageProtocol) {
        const key = auctionExecution.fastVaaHash.toString("base64");
        const candidates = this._candidates;
        if (candidates.has(key)) {
            candidates.get(key)!.execute = true;
        } else {
            candidates.set(key, {
                endSlot,
                auctionExecution,
                targetProtocol,
                execute: true,
            });
        }
    }

    update(fastVaaHash: Buffer, execute: boolean): boolean {
        const key = fastVaaHash.toString("base64");
        const found = this._candidates.has(key);
        if (found) {
            this._candidates.get(key)!.execute = execute;
        }
        return found;
    }

    remove(fastVaaHash: Buffer): boolean {
        return this._candidates.delete(fastVaaHash.toString("base64"));
    }

    isEmpty(): boolean {
        return this._candidates.size == 0;
    }

    candidates(): Array<{
        endSlot: bigint;
        auctionExecution: AuctionExecution;
        targetProtocol: MessageProtocol;
        execute: boolean;
    }> {
        return Array.from(this._candidates.values());
    }
}
