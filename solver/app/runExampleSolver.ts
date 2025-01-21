import "dotenv/config";
import * as fs from "node:fs";
import { ExampleSolver } from "../src";
import { Config } from "../src/containers";

main(process.argv);

// impl

async function main(argv: string[]) {
    const cfgJson = JSON.parse(fs.readFileSync(argv[2], "utf-8"));
    const cfg = new Config(cfgJson);

    const logger = cfg.initLogger("solver");

    // Base fee that the winning solver will receive. This fee is configured on
    // each network's Token Router out of convenience (to be encoded in the
    // slow order response associated with the finalized transfer).
    //
    // Your process should figure out whether it is advantageous to participate
    // in an auction based on this base fee. Due to market fluctuation of SOL
    // vs USDC, the rent (in SOL) that a solver pays to settle an auction could
    // be more than what this base fee (USDC) will cover.
    //
    // This fee will be updated in real-time as finalized VAAs are received.
    // But there can be auctions that you participate in that will use a stale
    // base fee, so please be careful and add base fee monitoring wherever
    // appropriate.
    const baseFee = 500_000n;

    // This is where the sausage is made.
    const solver = new ExampleSolver(cfg, logger, baseFee);

    // Initialize the solver with payer keypairs. These env vars are base64
    // encoded and can be undefined.
    await solver.initialize(
        process.env.SOLANA_PRIVATE_KEY_1,
        process.env.SOLANA_PRIVATE_KEY_2,
        process.env.SOLANA_PRIVATE_KEY_3,
        process.env.SOLANA_PRIVATE_KEY_4,
        process.env.SOLANA_PRIVATE_KEY_5,
    );

    ////////////////////////////////////////////////////////////////////////////
    //
    //
    // Below are configurations for the solver. You can enable specific
    // conditions/triggers depending on risk tolerance.
    //
    //
    ////////////////////////////////////////////////////////////////////////////

    // Comment this out if you do not want to participate in orders where the
    // target chain is CCTP (i.e. for a network other than Solana).
    //
    // Because there is a Wormhole message required to fulfill the order, there
    // is rent that is paid to execute this order, which cannot be recovered. So
    // offers made for CCTP orders should account for this rent.
    //
    // The CCTP message account can be closed with a CCTP attestation, so this
    // rent should not have to be factored into the offer price (but consider
    // the cost to execute this instruction to reclaim rent).
    //
    solver.enableCctpOrderPipeline();

    // Comment this out if you do not want to participate in orders where the
    // target chain is Solana.
    //
    // Auction offers for local orders should end up being less than the offers
    // for CCTP orders because there is no Wormhole message having to be posted.
    //
    solver.enableLocalOrderPipeline();

    // Comment this out if you do not want to place initial offers.
    //
    // There may be a case where you only want to collect the initial auction
    // fee by placing initial offers. So if you do not improve any offers, you
    // should figure out whether the initial auction fee will compensate for the
    // SOL required to start the auction. These factors are:
    // * Rent to pay for signature set account (Wormhole core program)
    // * Rent to pay for the posted VAA account (Wormhole core program)
    // * Rent to pay for the auction account minus the amount you would get back
    //   from moving this data to auction history (Matching engine program)
    //
    // There is capital risk in participating in an auction (which is the point
    // of being a solver). So the offer made to start the auction should be
    // enough to cover the risk of the transfer being rolled back (where the
    // amount you provided to fulfill the transfer will never be redeemable
    // when the auction is finally settled).
    //
    solver.enablePlaceInitialOffer();

    // Comment this out if you do not want to improve offers.
    //
    // There is capital risk in participating in an auction (which is the point
    // of being a solver). So the offer made to improve the auction should be
    // enough to cover the risk of the transfer being rolled back (where the
    // amount you provided to fulfill the transfer will never be redeemable
    // when the auction is finally settled).
    //
    solver.enableImproveOffer();
}
