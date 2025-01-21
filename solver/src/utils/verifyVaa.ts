import {
    Commitment,
    Connection,
    PublicKey,
    PublicKeyInitData,
    SystemProgram,
    SYSVAR_INSTRUCTIONS_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
} from "@solana/web3.js";
import { VAA } from "@wormhole-foundation/sdk-definitions";
import { utils as coreUtils } from "@wormhole-foundation/sdk-solana-core";
import { createSecp256k1Instruction } from "./secp256k1";

export function unsafeFixSigVerifyIx(
    sigVerifyIx: TransactionInstruction,
    sigVerifyIxIndex: number,
) {
    const { data } = sigVerifyIx;

    const numSignatures = data.readUInt8(0);

    const offsetSpan = 11;
    for (let i = 0; i < numSignatures; ++i) {
        data.writeUInt8(sigVerifyIxIndex, 3 + i * offsetSpan);
        data.writeUInt8(sigVerifyIxIndex, 6 + i * offsetSpan);
        data.writeUInt8(sigVerifyIxIndex, 11 + i * offsetSpan);
    }
}

// There be dragons. Forked from wormhole typescript SDK.

export async function createVerifySignaturesInstructions(
    connection: Connection,
    wormholeProgramId: PublicKeyInitData,
    payer: PublicKeyInitData,
    vaa: VAA<any>,
    signatureSet: PublicKeyInitData,
    commitment?: Commitment,
    guardianSetData?: coreUtils.GuardianSetData,
): Promise<TransactionInstruction[]> {
    const guardianSetIndex = vaa.guardianSet;

    if (guardianSetData === undefined) {
        guardianSetData = await coreUtils.getGuardianSet(
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
    const methods = coreUtils
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

interface VerifySignatureAccounts {
    payer: PublicKey;
    guardianSet: PublicKey;
    signatureSet: PublicKey;
    instructions: PublicKey;
    rent: PublicKey;
    systemProgram: PublicKey;
}

function getVerifySignatureAccounts(
    wormholeProgramId: PublicKeyInitData,
    payer: PublicKeyInitData,
    signatureSet: PublicKeyInitData,
    vaa: VAA,
): VerifySignatureAccounts {
    return {
        payer: new PublicKey(payer),
        guardianSet: coreUtils.deriveGuardianSetKey(wormholeProgramId, vaa.guardianSet),
        signatureSet: new PublicKey(signatureSet),
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
    };
}
