import { Keypair } from "@solana/web3.js";
import { Logger } from "winston";

export class Payers {
    _payers: { payer: Keypair; enabled: boolean }[];
    _index: number;

    constructor() {
        this._payers = [];
        this._index = 0;
    }

    add(payer: Keypair, logger: Logger) {
        this._payers.push({ payer, enabled: true });
        logger.info(`Adding payer: ${payer.publicKey.toString()}`);
    }

    useNext(): Keypair | undefined {
        const index = this._index;
        const payers = this._payers;

        for (let i = 0; i < payers.length; ++i) {
            const { payer, enabled } = payers[index];
            if (enabled) {
                this._index = (index + i + 1) % payers.length;
                return payer;
            }
        }
    }

    isEmpty(): boolean {
        return this._payers.length == 0 || this._payers.every((payer) => !payer.enabled);
    }
}
