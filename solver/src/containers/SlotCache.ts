import { Connection } from "@solana/web3.js";

export class SlotCache {
    private _slot: number;
    private _timestamp: number;
    private _initialized: boolean;

    private constructor() {
        this._slot = -1;
        this._timestamp = -1;
        this._initialized = false;
    }

    static async initialize(connection: Connection) {
        const out = new SlotCache();

        connection.onSlotChange(async ({ slot }) => {
            out._slot = slot;
            out._timestamp = Date.now();
            out._initialized = true;
        });

        return out;
    }

    get current(): { slot: bigint; timestamp: number } {
        return { slot: BigInt(this._slot), timestamp: this._timestamp };
    }

    get initialized(): boolean {
        return this._initialized;
    }
}
