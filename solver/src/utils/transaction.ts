import {
    BlockhashWithExpiryBlockHeight,
    ComputeBudgetProgram,
    Connection,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import { PreparedTransaction } from "@wormhole-foundation/example-liquidity-layer-solana";
import { Logger } from "winston";

export const DEFAULT_RETRY_COUNT = 0;

export type SendTransactionOptions = {
    delay?: number;
    retryCount?: number;
    retryTimeoutMs?: number;
};

export async function sendTransaction(
    connection: Connection,
    preparedTransaction: PreparedTransaction,
    latestBlockhash: BlockhashWithExpiryBlockHeight,
    logger: Logger,
    opts: SendTransactionOptions = {},
): Promise<string | null> {
    let { delay, retryCount, retryTimeoutMs } = opts;
    delay ??= 0;
    retryCount ??= DEFAULT_RETRY_COUNT;
    retryTimeoutMs ??= 200;

    if (delay > 0) {
        logger.debug(`Delaying transaction by ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const skipPreFlight = preparedTransaction.confirmOptions?.skipPreflight ?? false;

    // If skipPreFlight is false, we will retry the transaction if it fails.
    let txSig: string | null = null;
    let counter = 0;
    while (txSig === null && counter <= retryCount) {
        if (counter > 0) {
            logger.error(`Retrying failed transaction, attempt=${counter}`);

            // Wait half a slot before trying again.
            await new Promise((resolve) => setTimeout(resolve, retryTimeoutMs));
        }

        const response = await _sendTransaction(
            connection,
            preparedTransaction,
            latestBlockhash,
            logger,
        );
        txSig = response.txSig;

        if (!skipPreFlight) {
            ++counter;
        }
    }

    return txSig;
}

export async function sendOrderedTransactions(
    connection: Connection,
    preparedTransactions: PreparedTransaction[],
    latestBlockhash: BlockhashWithExpiryBlockHeight,
    logger: Logger,
    opts: SendTransactionOptions = {},
): Promise<Array<string | null>> {
    const numPrepared = preparedTransactions.length;
    const txSigs = new Array<string | null>(numPrepared).fill(null);
    for (let i = 0; i < numPrepared; ++i) {
        txSigs[i] = await sendTransaction(
            connection,
            preparedTransactions[i],
            latestBlockhash,
            logger,
            opts,
        );
    }

    return txSigs;
}

async function _sendTransaction(
    connection: Connection,
    preparedTransaction: PreparedTransaction,
    latestBlockhash: BlockhashWithExpiryBlockHeight,
    logger: Logger,
): Promise<{ success: boolean; txSig: string | null }> {
    const { ixs, computeUnits, feeMicroLamports, signers, addressLookupTableAccounts } =
        preparedTransaction;

    const payer = signers[0];
    const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits });
    const computeUnitPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: feeMicroLamports,
    });

    // Uptick nonce account, or fetch recent block hash.
    const [messageV0, confirmStrategy] = await (async () => {
        return [
            new TransactionMessage({
                payerKey: payer.publicKey,
                recentBlockhash: latestBlockhash.blockhash,
                instructions: [computeLimitIx, computeUnitPriceIx, ...ixs],
            }).compileToV0Message(addressLookupTableAccounts),
            latestBlockhash,
        ];
    })();

    const txName = preparedTransaction.txName;
    const tx = new VersionedTransaction(messageV0);

    let serialized: Uint8Array;
    try {
        tx.sign(signers);
        serialized = tx.serialize();
    } catch (err) {
        if (txName !== undefined) {
            logger.error(`Transaction (${txName}): ${err}`);
        } else {
            logger.error(`Transaction: ${err}`);
        }
        return { success: false, txSig: null };
    }

    if (serialized.length > 1232) {
        if (txName != undefined) {
            logger.error(`Transaction (${txName}): too large, ${serialized.length} bytes`);
        } else {
            logger.error(`Transaction: too large, ${serialized.length} bytes`);
        }
        return { success: false, txSig: null };
    }

    let success = true;
    let txSignature = await connection
        .sendRawTransaction(serialized, preparedTransaction.confirmOptions)
        .catch((err) => {
            success = false;

            if (err.logs !== undefined) {
                const logs: string[] = err.logs;
                logger.error(logs.join("\n"));
            } else {
                logger.error(err);
            }

            return null;
        })
        .then(async (txSig) => {
            const commitment = preparedTransaction.confirmOptions?.commitment;
            if (txSig !== null && commitment !== undefined) {
                await connection.confirmTransaction(
                    {
                        signature: txSig,
                        ...confirmStrategy,
                    },
                    commitment,
                );
            }

            return txSig;
        })
        .catch((err) => {
            success = false;

            if (err.logs !== undefined) {
                const logs: string[] = err.logs;
                logger.error(logs.join("\n"));
            } else {
                logger.error(err);
            }

            return null;
        });

    if (txName !== undefined) {
        logger.info(`Transaction (${txName}): ${txSignature}`);
    } else {
        logger.info(`Transaction: ${txSignature}`);
    }

    return { success, txSig: txSignature };
}

export function bumpComputeUnits(bump: number): number {
    return (255 - bump) * 1_500;
}
