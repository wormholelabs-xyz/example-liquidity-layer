import { BlockhashWithExpiryBlockHeight, Commitment, Connection } from "@solana/web3.js";
import { Logger } from "winston";

export class BlockhashCache {
    private _cached: BlockhashWithExpiryBlockHeight;
    private _noise: number;

    private constructor() {
        this._cached = {
            blockhash: "",
            lastValidBlockHeight: -1,
        };
        this._noise = 0;
    }

    static async initialize(
        connection: Connection,
        updateBlockhashFrequency: number,
        commitment: Commitment,
        logger: Logger,
    ) {
        const out = new BlockhashCache();

        let tryAgain = false;
        let counter = 0;
        setInterval(async () => {
            if (tryAgain || counter % updateBlockhashFrequency == 0) {
                tryAgain = await out
                    ._update(connection, commitment, logger)
                    .then((_) => false)
                    .catch((err) => {
                        logger.error(`${err.toString()}`);
                        return true;
                    });
            }

            ++counter;
        }, 400);

        return out;
    }

    // This should only be called after initialize.
    get latest(): BlockhashWithExpiryBlockHeight {
        return this._cached;
    }

    // This allows for unique signatures for each transactions.
    addNoise(value: number) {
        return value + this._noise++;
    }

    private async _update(connection: Connection, commitment: Commitment, logger: Logger) {
        const fetched = await connection.getLatestBlockhash(commitment);
        this._cached = fetched;
        this._noise = 0;
        logger.debug(`New blockhash: ${fetched.blockhash}`);
    }
}
