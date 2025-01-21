import { FastMarketOrder } from "@wormhole-foundation/example-liquidity-layer-definitions";
import { keccak256, VAA } from "@wormhole-foundation/sdk-definitions";

export type KnownFastOrder = { parsed: VAA; fastOrder: FastMarketOrder };

export class KnownFastOrders {
    private _known: Map<string, KnownFastOrder>;

    constructor() {
        this._known = new Map();
    }

    add(parsed: VAA, fastOrder: FastMarketOrder) {
        this._known.set(toBase64(keccak256(parsed.hash)), { parsed, fastOrder });
    }

    remove(fastVaaHash: Uint8Array): boolean {
        return this._known.delete(toBase64(fastVaaHash));
    }

    has(fastVaaHash: Uint8Array): boolean {
        return this._known.has(toBase64(fastVaaHash));
    }

    get(fastVaaHash: Uint8Array): KnownFastOrder | undefined {
        return this._known.get(toBase64(fastVaaHash));
    }
}

function toBase64(arr: Uint8Array): string {
    return Buffer.from(arr).toString("base64");
}
