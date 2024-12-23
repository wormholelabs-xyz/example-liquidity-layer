import { FastMarketOrder } from "@wormhole-foundation/example-liquidity-layer-definitions";
import { keccak256, VAA } from "@wormhole-foundation/sdk-definitions";

export type KnownFastOrder = { parsed: VAA; fastOrder: FastMarketOrder };

export class KnownFastOrders {
    private _known: Map<string, KnownFastOrder>;

    constructor() {
        this._known = new Map();
    }

    add(parsed: VAA, fastOrder: FastMarketOrder) {
        const fastVaaHash = keccak256(parsed.hash);
        this._known.set(Buffer.from(fastVaaHash).toString("base64"), { parsed, fastOrder });
    }

    remove(fastVaaHash: Buffer): boolean {
        return this._known.delete(fastVaaHash.toString("base64"));
    }

    has(fastVaaHash: Buffer): boolean {
        return this._known.has(fastVaaHash.toString("base64"));
    }

    get(fastVaaHash: Buffer): KnownFastOrder | undefined {
        return this._known.get(fastVaaHash.toString("base64"));
    }
}
