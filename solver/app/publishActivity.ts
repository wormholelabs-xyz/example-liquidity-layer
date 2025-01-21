import { chainToPlatform } from "@wormhole-foundation/sdk-base";
import "dotenv/config";
import * as fs from "node:fs";
import { Config } from "../src/containers";

const EVM_FAST_CONSISTENCY_LEVEL = 200;

main(process.argv);

// impl

async function main(argv: string[]) {
    const cfgJson = JSON.parse(fs.readFileSync(argv[2], "utf-8"));
    const cfg = new Config(cfgJson);

    const logger = cfg.initLogger("publisher");
    const vaaSpy = cfg.initVaaSpy();

    // ZMQ publishers for VAAs and auction account data.
    const fastVaaPublisher = cfg.initPublisher("fastVaa");
    const finalizedVaaPublisher = cfg.initPublisher("finalizedVaa");

    const vaaDelayedThreshold = cfg.vaaDelayedThreshold();

    vaaSpy.onObservation(async ({ raw, parsed, chain }) => {
        if (
            chainToPlatform(parsed.emitterChain) == "Evm" &&
            parsed.consistencyLevel == EVM_FAST_CONSISTENCY_LEVEL
        ) {
            const currentTime = Math.floor(Date.now() / 1000);
            const fastVaaSequence = parsed.sequence;

            // Since were using the vaa timestamp, there is potentially some clock drift. However,
            // we don't want to accept VAA's that are too far in the past.
            if (currentTime - parsed.timestamp > vaaDelayedThreshold) {
                logger.info(
                    `Ignoring stale Fast VAA, chain=${chain}, sequence=${fastVaaSequence}, vaaTime=${parsed.timestamp}`,
                );
                return;
            }

            // VAAs could be blasted so we avoid trying to write to socket when it is busy.
            await fastVaaPublisher.send(raw, logger);

            logger.info(
                `Fast VAA. chain=${chain}, sequence=${fastVaaSequence}, vaaTime=${parsed.timestamp}`,
            );
        } else {
            // VAAs could be blasted so we avoid trying to write to socket when it is busy.
            await finalizedVaaPublisher.send(raw, logger);

            const fastVaaSequence = parsed.sequence + 1n;
            logger.info(
                `Finalized VAA, chain=${chain}, fastVaaSequence=${fastVaaSequence}, vaaTime=${parsed.timestamp}`,
            );
        }
    });
}
