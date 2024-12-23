import { keccak256 } from "@wormhole-foundation/sdk-definitions";
import * as solanaCore from "@wormhole-foundation/sdk-solana-core";
import "dotenv/config";
import * as fs from "fs";
import * as utils from "../../src/utils";

main(process.argv);

async function main(argv: string[]) {
    const cfgJson = JSON.parse(fs.readFileSync(argv[2], "utf-8"));
    const cfg = new utils.AppConfig(cfgJson);

    const logger = cfg.initLogger("publishActivity");

    const connection = cfg.solanaConnection();
    const matchingEngine = cfg.initMatchingEngineProgram();
    const coreBridgeProgramId = matchingEngine.coreBridgeProgramId();

    const vaaSpy = cfg.initVaaSpy();

    // ZMQ publishers for VAAs and auction account data.
    const fastVaaPublisher = cfg.initPublisher("fastVaa");
    const finalizedVaaPublisher = cfg.initPublisher("finalizedVaa");
    const auctionPublisher = cfg.initPublisher("auction");

    const postedVaaPublisher = cfg.initPublisher("postedVaa");
    const publishPostedVaa = postedVaaPublisher.canPublish();

    const vaaDelayedThreshold = cfg.vaaDelayedThreshold();

    const postedVaaListenerIds = new Map<string, number>();
    const auctionListenerIdsAndData = new Map<string, { listenerId: number; data?: Buffer }>();

    vaaSpy.onObservation(async ({ raw, parsed, chain }) => {
        if (cfg.isFastFinality(parsed)) {
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

            utils.publishVaa(fastVaaPublisher, raw, logger);

            const messageHash = Buffer.from(parsed.hash);
            const listenerIdKey = messageHash.toString("base64");

            const postedVaaListenerId = (() => {
                if (publishPostedVaa) {
                    const postedVaaListenerId = connection.onAccountChange(
                        solanaCore.utils.derivePostedVaaKey(coreBridgeProgramId, messageHash),
                        ({ data }, { slot }) => {
                            utils.publishPostedVaa(
                                postedVaaPublisher,
                                slot,
                                messageHash,
                                data,
                                logger,
                            );

                            // This may not look safe... but there will be some number of slots between
                            // observing this VAA and when the VAA will be written to an account. So when we
                            // do observe the PostedVAA, we can safely remove the listener for the VAA.
                            const listenerId = postedVaaListenerIds.get(listenerIdKey);
                            if (listenerId !== undefined) {
                                connection.removeAccountChangeListener(listenerId);
                                postedVaaListenerIds.delete(listenerIdKey);
                            } else {
                                logger.error(
                                    `Posted VAA listener not found for sequence=${fastVaaSequence}`,
                                );
                            }
                        },
                        { commitment: "confirmed", encoding: "base64" },
                    );

                    // Save the posted VAA listener ID for clean up later once we hear it on the websocket.
                    postedVaaListenerIds.set(listenerIdKey, postedVaaListenerId);

                    return postedVaaListenerId;
                }
            })();

            // Subscribe to auction account.
            const auctionListenerId = connection.onAccountChange(
                matchingEngine.auctionAddress(keccak256(messageHash)),
                ({ data }, { slot }) => {
                    const stored = auctionListenerIdsAndData.get(listenerIdKey);

                    if (stored !== undefined) {
                        // Deserialize the auction to determine its status. If it is settled, clean
                        // up the listener.
                        const { status } = utils.decodeAuction(data);

                        if (status.settled !== undefined) {
                            connection.removeAccountChangeListener(stored.listenerId);
                            auctionListenerIdsAndData.delete(listenerIdKey);
                            logger.info(
                                `Auction sequence=${fastVaaSequence} settled, slot=${slot}`,
                            );
                        } else if (stored.data === undefined || !data.equals(stored.data)) {
                            utils.publishAuction(auctionPublisher, slot, data, logger);

                            // Update the stored data.
                            stored.data = data;
                            auctionListenerIdsAndData.set(listenerIdKey, stored);
                        }
                    } else {
                        logger.error(`Auction listener not found for sequence=${fastVaaSequence}`);
                    }
                },
                { commitment: "confirmed", encoding: "base64" },
            );

            // Set with the finalized VAA sequence for clean up when we hear the finalized VAA.
            auctionListenerIdsAndData.set(listenerIdKey, { listenerId: auctionListenerId });

            if (postedVaaListenerId === undefined) {
                logger.info(
                    `Fast VAA. auctionListenerId: ${auctionListenerId}, chain=${chain}, sequence=${fastVaaSequence}, vaaTime=${parsed.timestamp}`,
                );
            } else {
                logger.info(
                    `Fast VAA. postedVaaListenerId: ${postedVaaListenerId}, auctionListenerId: ${auctionListenerId}, chain=${chain}, sequence=${fastVaaSequence}, vaaTime=${parsed.timestamp}`,
                );
            }
        } else {
            utils.publishVaa(finalizedVaaPublisher, raw, logger);

            const fastVaaSequence = parsed.sequence + 1n;
            logger.info(
                `Finalized VAA, chain=${chain}, fastVaaSequence=${fastVaaSequence}, vaaTime=${parsed.timestamp}`,
            );
        }
    });
}
