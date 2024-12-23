import {
    Commitment,
    ConfirmOptions,
    Connection,
    Keypair,
    PublicKey,
    PublicKeyInitData,
    SystemProgram,
    SYSVAR_INSTRUCTIONS_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
} from "@solana/web3.js";
import { PreparedTransaction } from "@wormhole-foundation/example-liquidity-layer-solana";
import { MatchingEngineProgram } from "@wormhole-foundation/example-liquidity-layer-solana/matchingEngine";
import { VAA } from "@wormhole-foundation/sdk-definitions";
import * as solanaCore from "@wormhole-foundation/sdk-solana-core";
import { AppConfig } from "./config";
import { createSecp256k1Instruction } from "./secp256k1";
import { bumpComputeUnits } from "./sendTx";

const GUARDIAN_SETS = new Map<number, solanaCore.utils.GuardianSetData>();

// Only save reused accounts like config and guardian sets.
const BUMP_COSTS = new Map<string, number>();

function unsafeFixSigVerifyIx(sigVerifyIx: TransactionInstruction, sigVerifyIxIndex: number) {
    const { data } = sigVerifyIx;

    const numSignatures = data.readUInt8(0);

    const offsetSpan = 11;
    for (let i = 0; i < numSignatures; ++i) {
        data.writeUInt8(sigVerifyIxIndex, 3 + i * offsetSpan);
        data.writeUInt8(sigVerifyIxIndex, 6 + i * offsetSpan);
        data.writeUInt8(sigVerifyIxIndex, 11 + i * offsetSpan);
    }
}

export async function preparePostVaaTxs(
    connection: Connection,
    cfg: AppConfig,
    matchingEngine: MatchingEngineProgram,
    payer: Keypair,
    vaa: VAA,
    confirmOptions?: ConfirmOptions,
): Promise<PreparedTransaction[]> {
    const coreBridgeProgramId = matchingEngine.coreBridgeProgramId();

    const vaaSignatureSet = Keypair.generate();

    const guardianSetIndex = vaa.guardianSet;

    // Have we cached the guardian set?
    if (!GUARDIAN_SETS.has(guardianSetIndex)) {
        const data = await solanaCore.utils.getGuardianSet(
            connection,
            coreBridgeProgramId,
            guardianSetIndex,
        );

        const encodedGuardianSetIndex = Buffer.alloc(4);
        encodedGuardianSetIndex.writeUInt32BE(guardianSetIndex);

        const [, guardianSetBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("GuardianSet"), encodedGuardianSetIndex],
            coreBridgeProgramId,
        );
        GUARDIAN_SETS.set(guardianSetIndex, data);
        BUMP_COSTS.set("guardianSet", bumpComputeUnits(guardianSetBump));

        const [, configBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("Bridge"), encodedGuardianSetIndex],
            coreBridgeProgramId,
        );
        BUMP_COSTS.set("config", bumpComputeUnits(configBump));
    }

    // Check if Fast VAA has already been posted.
    const vaaVerifySignaturesIxs = await createVerifySignaturesInstructions(
        connection,
        matchingEngine.coreBridgeProgramId(),
        payer.publicKey,
        vaa,
        vaaSignatureSet.publicKey,
        undefined,
        GUARDIAN_SETS.get(guardianSetIndex),
    );
    vaaVerifySignaturesIxs.reverse();

    const preparedTransactions: PreparedTransaction[] = [];

    const firstVerifyCost = 15_000;

    let created = false;
    const guardianSetBumpCost = BUMP_COSTS.get("guardianSet")!;
    const verifySignaturesComputeUnits = cfg.verifySignaturesComputeUnits() + guardianSetBumpCost;

    while (vaaVerifySignaturesIxs.length > 0) {
        const sigVerifyIx = vaaVerifySignaturesIxs.pop()!;
        // This is a spicy meatball. Two compute budget ixs precede the sig verify ix.
        unsafeFixSigVerifyIx(sigVerifyIx, 2);
        const verifySigsIx = vaaVerifySignaturesIxs.pop()!;

        let computeUnits = verifySignaturesComputeUnits;
        if (!created) {
            computeUnits += firstVerifyCost;
        }

        const preparedVerify: PreparedTransaction = {
            ixs: [sigVerifyIx, verifySigsIx],
            signers: [payer, vaaSignatureSet],
            computeUnits,
            feeMicroLamports: 10,
            txName: "verifySignatures",
            confirmOptions,
        };

        preparedTransactions.push(preparedVerify);
        created = true;
    }

    const vaaPostIx = solanaCore.utils.createPostVaaInstruction(
        connection,
        matchingEngine.coreBridgeProgramId(),
        payer.publicKey,
        vaa,
        vaaSignatureSet.publicKey,
    );

    const [, postedVaaBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("PostedVAA"), vaa.hash],
        matchingEngine.coreBridgeProgramId(),
    );

    const preparedPost: PreparedTransaction = {
        ixs: [vaaPostIx],
        signers: [payer],
        computeUnits:
            cfg.postVaaComputeUnits() +
            BUMP_COSTS.get("config")! +
            guardianSetBumpCost +
            bumpComputeUnits(postedVaaBump),
        feeMicroLamports: 10,
        txName: "postVAA",
        confirmOptions,
    };

    preparedTransactions.push(preparedPost);

    return preparedTransactions;
}

// There be dragons. Forked from wormhole typescript SDK.

async function createVerifySignaturesInstructions(
    connection: Connection,
    wormholeProgramId: PublicKeyInitData,
    payer: PublicKeyInitData,
    vaa: VAA<any>,
    signatureSet: PublicKeyInitData,
    commitment?: Commitment,
    guardianSetData?: solanaCore.utils.GuardianSetData,
): Promise<TransactionInstruction[]> {
    const guardianSetIndex = vaa.guardianSet;

    if (guardianSetData === undefined) {
        guardianSetData = await solanaCore.utils.getGuardianSet(
            connection,
            wormholeProgramId,
            guardianSetIndex,
            commitment,
        );
    }

    const guardianSignatures = vaa.signatures;
    const guardianKeys = guardianSetData.keys;

    const batchSize = 7;
    const instructions: TransactionInstruction[] = [];
    for (let i = 0; i < Math.ceil(guardianSignatures.length / batchSize); ++i) {
        const start = i * batchSize;
        const end = Math.min(guardianSignatures.length, (i + 1) * batchSize);

        const signatureStatus = new Array(19).fill(-1);
        const signatures: Buffer[] = [];
        const keys: Buffer[] = [];
        for (let j = 0; j < end - start; ++j) {
            const item = guardianSignatures.at(j + start)!;

            signatures.push(Buffer.from(item.signature.encode()));
            keys.push(guardianKeys.at(item.guardianIndex)!);

            signatureStatus[item.guardianIndex] = j;
        }

        instructions.push(createSecp256k1Instruction(signatures, keys, Buffer.from(vaa.hash)));

        instructions.push(
            createVerifySignaturesInstruction(
                connection,
                wormholeProgramId,
                payer,
                vaa,
                signatureSet,
                signatureStatus,
            ),
        );
    }
    return instructions;
}

/**
 * Make {@link TransactionInstruction} for `verify_signatures` instruction.
 *
 * This is used in {@link createVerifySignaturesInstructions} for each batch of signatures being verified.
 * `signatureSet` is a {@link @solana/web3.Keypair} generated outside of this method, used
 * for writing signatures and the message hash to.
 *
 * https://github.com/certusone/wormhole/blob/main/solana/bridge/program/src/api/verify_signature.rs
 *
 * @param {PublicKeyInitData} wormholeProgramId - wormhole program address
 * @param {PublicKeyInitData} payer - transaction signer address
 * @param {SignedVaa | ParsedVaa} vaa - either signed VAA (Buffer) or parsed VAA
 * @param {PublicKeyInitData} signatureSet - key for signature set account
 * @param {Buffer} signatureStatus - array of guardian indices
 *
 */
function createVerifySignaturesInstruction(
    connection: Connection,
    wormholeProgramId: PublicKeyInitData,
    payer: PublicKeyInitData,
    vaa: VAA,
    signatureSet: PublicKeyInitData,
    signatureStatus: number[],
): TransactionInstruction {
    const methods = solanaCore.utils
        .createReadOnlyWormholeProgramInterface(wormholeProgramId, connection)
        .methods.verifySignatures(signatureStatus);

    // @ts-ignore
    return methods._ixFn(...methods._args, {
        accounts: getVerifySignatureAccounts(wormholeProgramId, payer, signatureSet, vaa) as any,
        signers: undefined,
        remainingAccounts: undefined,
        preInstructions: undefined,
        postInstructions: undefined,
    });
}

export interface VerifySignatureAccounts {
    payer: PublicKey;
    guardianSet: PublicKey;
    signatureSet: PublicKey;
    instructions: PublicKey;
    rent: PublicKey;
    systemProgram: PublicKey;
}

export function getVerifySignatureAccounts(
    wormholeProgramId: PublicKeyInitData,
    payer: PublicKeyInitData,
    signatureSet: PublicKeyInitData,
    vaa: VAA,
): VerifySignatureAccounts {
    return {
        payer: new PublicKey(payer),
        guardianSet: solanaCore.utils.deriveGuardianSetKey(wormholeProgramId, vaa.guardianSet),
        signatureSet: new PublicKey(signatureSet),
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
    };
}
