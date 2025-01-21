import * as fs from "node:fs";
import { Config } from "../src/containers";

main(process.argv);

async function main(argv: string[]) {
    const cfgJson = JSON.parse(fs.readFileSync(argv[2], "utf-8"));
    const cfg = new Config(cfgJson);

    const finalizedSubscriber = cfg.initSubscriber("finalizedVaa");

    for await (const [, msg] of finalizedSubscriber) {
        console.log("Received finalized VAA", msg.toString("base64"));
    }
}
