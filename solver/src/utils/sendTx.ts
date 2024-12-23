import {
    ComputeBudgetProgram,
    Connection,
    SystemProgram,
    PublicKey,
    TransactionMessage,
    VersionedTransaction,
    TransactionInstruction,
    BlockhashWithExpiryBlockHeight,
} from "@solana/web3.js";
import * as winston from "winston";
import { PreparedTransaction } from "@wormhole-foundation/example-liquidity-layer-solana";

export async function getNonceAccountData(
    connection: Connection,
    nonceAccount: PublicKey,
): Promise<{ nonce: string; recentSlot: number; advanceIxs: TransactionInstruction[] }> {
    const { context, value } = await connection.getNonceAndContext(nonceAccount);
    if (context === null || value === null) {
        throw new Error("Failed to fetch nonce account data");
    }

    return {
        nonce: value.nonce,
        recentSlot: context.slot,
        advanceIxs: [
            SystemProgram.nonceAdvance({
                authorizedPubkey: value.authorizedPubkey,
                noncePubkey: nonceAccount,
            }),
        ],
    };
}

export async function sendTxBatch(
    connection: Connection,
    preparedTransactions: PreparedTransaction[],
    logger: winston.Logger,
    retryCount?: number,
    cachedBlockhash?: BlockhashWithExpiryBlockHeight,
): Promise<Array<string | null>> {
    retryCount ??= 5;

    const numPrepared = preparedTransactions.length;
    const txSigs = new Array<string | null>(numPrepared).fill(null);
    for (let i = 0; i < numPrepared; ++i) {
        const preparedTransaction = preparedTransactions[i];
        const skipPreFlight = preparedTransaction.confirmOptions?.skipPreflight ?? false;

        // If skipPreFlight is false, we will retry the transaction if it fails.
        let txSig: string | null = null;
        let counter = 0;
        while (txSig === null && counter <= retryCount) {
            if (counter > 0) {
                logger.error(`Retrying failed transaction, attempt=${counter}`);

                // Wait half a slot before trying again.
                await new Promise((resolve) => setTimeout(resolve, 200));
            }

            const response = await sendTx(connection, preparedTransaction, logger, cachedBlockhash);
            txSig = response.txSig;

            if (!skipPreFlight) {
                ++counter;
            }
        }

        // If we have any failures along the way, abandon ship.
        if (txSig === null) {
            break;
        } else {
            txSigs[i] = txSig;
        }
    }

    return txSigs;
}

export async function sendTx(
    connection: Connection,
    preparedTransaction: PreparedTransaction,
    logger: winston.Logger,
    cachedBlockhash?: BlockhashWithExpiryBlockHeight,
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
        const latestBlockhash = cachedBlockhash ?? (await connection.getLatestBlockhash());

        return [
            new TransactionMessage({
                payerKey: payer.publicKey,
                recentBlockhash: latestBlockhash.blockhash,
                instructions: [computeLimitIx, computeUnitPriceIx, ...ixs],
            }).compileToV0Message(addressLookupTableAccounts),
            latestBlockhash,
        ];
    })();

    const tx = new VersionedTransaction(messageV0);
    tx.sign(signers);

    let success = true;
    let txSignature = await connection
        .sendTransaction(tx, preparedTransaction.confirmOptions)
        .then(async (signature) => {
            const commitment = preparedTransaction.confirmOptions?.commitment;
            if (commitment !== undefined) {
                await connection.confirmTransaction(
                    {
                        signature,
                        ...confirmStrategy,
                    },
                    commitment,
                );
            }
            return signature;
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

    if (preparedTransaction.txName !== undefined) {
        logger.info(`Tx (${preparedTransaction.txName}): ${txSignature}`);
    } else {
        logger.info(`Tx: ${txSignature}`);
    }

    return { success, txSig: txSignature };
}

export function bumpComputeUnits(bump: number): number {
    return (255 - bump) * 1_500;
}
