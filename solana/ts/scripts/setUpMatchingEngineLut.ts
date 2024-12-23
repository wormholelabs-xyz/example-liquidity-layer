import {
    AddressLookupTableProgram,
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    sendAndConfirmTransaction,
} from "@solana/web3.js";
import "dotenv/config";
import { MatchingEngineProgram } from "../src/matchingEngine";
import { TokenRouterProgram } from "../src/tokenRouter";
import { Chain, toChainId } from "@wormhole-foundation/sdk-base";

const MATCHING_ENGINE_PROGRAM_ID = "mPydpGUWxzERTNpyvTKdvS7v8kvw5sgwfiP8WQFrXVS";
const TOKEN_ROUTER_PROGRAM_ID = "tD8RmtdcV7bzBeuFgyrFc8wvayj988ChccEzRQzo6md";
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const CHAINS: Chain[] = [
    "ArbitrumSepolia",
    "Avalanche",
    "BaseSepolia",
    "OptimismSepolia",
    "PolygonSepolia",
    "Sepolia",
    "Solana",
];

// Here we go.
main();

// impl

async function main() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const matchingEngine = new MatchingEngineProgram(
        connection,
        MATCHING_ENGINE_PROGRAM_ID,
        USDC_MINT,
    );
    const tokenRouter = new TokenRouterProgram(
        connection,
        TOKEN_ROUTER_PROGRAM_ID,
        matchingEngine.mint,
    );
    const tokenMessengerMinter = matchingEngine.tokenMessengerMinterProgram();

    if (process.env.SOLANA_PRIVATE_KEY === undefined) {
        throw new Error("SOLANA_PRIVATE_KEY is undefined");
    }
    const payer = Keypair.fromSecretKey(Buffer.from(process.env.SOLANA_PRIVATE_KEY, "base64"));

    const [createIx, lookupTable] = await connection.getSlot("finalized").then((slot) =>
        AddressLookupTableProgram.createLookupTable({
            authority: payer.publicKey,
            payer: payer.publicKey,
            recentSlot: slot,
        }),
    );

    const createSig = await sendAndConfirmTransaction(connection, new Transaction().add(createIx), [
        payer,
    ]);
    console.log("createTx", createSig);

    const usdcCommonAccounts = await matchingEngine.commonAccounts();

    const addresses = [
        ...Object.values(usdcCommonAccounts).filter((key) => key !== undefined),
        payer.publicKey,
    ];

    addresses.push(tokenRouter.custodianAddress());
    addresses.push(tokenRouter.cctpMintRecipientAddress());

    for (const chainName of CHAINS) {
        const routerEndpoint = matchingEngine.routerEndpointAddress(toChainId(chainName));
        addresses.push(routerEndpoint);

        const { protocol } = await matchingEngine.fetchRouterEndpointInfo({
            address: routerEndpoint,
        });

        if (protocol.cctp !== undefined) {
            addresses.push(tokenMessengerMinter.remoteTokenMessengerAddress(protocol.cctp.domain));
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
}
