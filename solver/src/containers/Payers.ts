import { Keypair, PublicKey } from "@solana/web3.js";

export class Payers {
    _payers: { payer: Keypair; enabled: boolean }[];
    _index: number;

    constructor() {
        this._payers = [];
        this._index = 0;
    }

    add(payer: Keypair) {
        this._payers.push({ payer, enabled: false });
    }

    useNext(): Keypair | null {
        const payers = this._payers;
        let index = (this._index + 1) % payers.length;

        for (let i = 0; i < payers.length; ++i) {
            index = (index + i) % payers.length;
            const { payer, enabled } = payers[index];
            if (enabled) {
                this._index = index;
                return payer;
            }
        }

        return null;
    }

    isEmpty(): boolean {
        return this._payers.length == 0 || this._payers.every((payer) => !payer.enabled);
    }

    setEnabled(payer: PublicKey, shouldEnable: boolean): boolean {
        const index = this._payers.findIndex((p) => p.payer.publicKey.equals(payer));
        if (index < 0) {
            return false;
        }

        const selected = this._payers[index];
        const wasEnabled = selected.enabled;
        selected.enabled = shouldEnable;
        return wasEnabled;
    }
}
