import { Connection } from "@solana/web3.js";

export class SlotCache {
    private _slot: bigint;
    private _localTimestamp: number;

    private constructor() {
        this._slot = -1n;
        this._localTimestamp = -1;
    }

    static async initialize(connection: Connection) {
        const out = new SlotCache();

        connection.onSlotChange(async ({ slot }) => {
            out._slot = BigInt(slot);
            out._localTimestamp = Date.now();
        });

        return out;
    }

    get current(): { slot: bigint; localTimestamp: number } {
        return {
            slot: this._slot,
            localTimestamp: this._localTimestamp,
        };
    }
}
