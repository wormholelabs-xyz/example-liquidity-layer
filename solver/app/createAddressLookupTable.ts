import {
    AddressLookupTableProgram,
    Keypair,
    Transaction,
    sendAndConfirmTransaction,
} from "@solana/web3.js";
import { TokenRouterProgram } from "@wormhole-foundation/example-liquidity-layer-solana/tokenRouter";
import { Chain, toChainId } from "@wormhole-foundation/sdk-base";
import { toUniversal } from "@wormhole-foundation/sdk-definitions";
import { utils as coreUtils } from "@wormhole-foundation/sdk-solana-core";
import "dotenv/config";
import * as fs from "node:fs";
import { Config } from "../src/containers";

const TOKEN_ROUTER_PROGRAM_ID = "tD8RmtdcV7bzBeuFgyrFc8wvayj988ChccEzRQzo6md";

const CHAINS: { chain: Chain; remoteToken: string | null }[] = [
    {
        chain: "ArbitrumSepolia",
        remoteToken: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    },
    { chain: "Avalanche", remoteToken: "0x5425890298aed601595a70ab815c96711a31bc65" },
    { chain: "BaseSepolia", remoteToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
    { chain: "OptimismSepolia", remoteToken: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7" },
    { chain: "PolygonSepolia", remoteToken: "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582" },
    { chain: "Sepolia", remoteToken: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
    { chain: "Solana", remoteToken: null },
];

const CURRENT_GUARDIAN_SET_INDEX: number = 0;

main(process.argv);

// impl

async function main(argv: string[]) {
    const cfgJson = JSON.parse(fs.readFileSync(argv[2], "utf-8"));
    const cfg = new Config(cfgJson);

    const matchingEngine = cfg.initMatchingEngineProgram();
    const connection = matchingEngine.program.provider.connection;

    const tokenRouter = new TokenRouterProgram(
        connection,
        TOKEN_ROUTER_PROGRAM_ID,
        matchingEngine.mint,
    );
    const tokenMessengerMinter = matchingEngine.tokenMessengerMinterProgram();

    if (process.env.SOLANA_PRIVATE_KEY_1 === undefined) {
        throw new Error("SOLANA_PRIVATE_KEY_1 is undefined");
    }
    const payer = Keypair.fromSecretKey(Buffer.from(process.env.SOLANA_PRIVATE_KEY_1, "base64"));

    const [createIx, lookupTable] = await connection.getSlot("finalized").then((slot) =>
        AddressLookupTableProgram.createLookupTable({
            authority: payer.publicKey,
            payer: payer.publicKey,
            recentSlot: slot,
        }),
    );
    console.log("Setting up address lookup table", lookupTable.toBase58());

    const createSig = await sendAndConfirmTransaction(connection, new Transaction().add(createIx), [
        payer,
    ]);
    console.log("createTx", createSig);

    // Add payers and ATAs.
    const addresses = cfg.knownAtaOwners();
    addresses.push(...cfg.recognizedAtaAddresses());

    // Guardian set.
    addresses.push(
        coreUtils.deriveGuardianSetKey(
            matchingEngine.coreBridgeProgramId(),
            CURRENT_GUARDIAN_SET_INDEX,
        ),
    );

    // Matching engine accounts.
    const usdcCommonAccounts = await matchingEngine.commonAccounts();
    addresses.push(...Object.values(usdcCommonAccounts).filter((key) => key !== undefined));

    // Token router accounts.
    addresses.push(tokenRouter.custodianAddress());
    addresses.push(tokenRouter.cctpMintRecipientAddress());

    // Per-chain accounts.
    for (const { chain, remoteToken } of CHAINS) {
        const routerEndpoint = matchingEngine.routerEndpointAddress(toChainId(chain));
        addresses.push(routerEndpoint);

        const { protocol } = await matchingEngine.fetchRouterEndpointInfo({
            address: routerEndpoint,
        });

        if (protocol.cctp !== undefined) {
            addresses.push(tokenMessengerMinter.remoteTokenMessengerAddress(protocol.cctp.domain));

            // TokenMessengerMinter's token pair.
            const tokenPair = tokenMessengerMinter.tokenPairAddress(
                protocol.cctp.domain,
                Array.from(toUniversal(chain, remoteToken!).toUint8Array()),
            );
            addresses.push(tokenPair);
        }
    }

    let index = 0;
    while (index < addresses.length) {
        // Extend.
        const extendIx = AddressLookupTableProgram.extendLookupTable({
            payer: payer.publicKey,
            authority: payer.publicKey,
            lookupTable,
            addresses: addresses.slice(index, index + 20),
        });

        const extendSig = await sendAndConfirmTransaction(
            connection,
            new Transaction().add(extendIx),
            [payer],
            {
                commitment: "confirmed",
            },
        );
        console.log("extendTx", extendSig);
        index += 20;
    }

    console.log("Done");
    process.exit(0);
}
