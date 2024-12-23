import { Logger } from "winston";
import { Publisher as ZmqPublisher } from "zeromq";

export class Publisher {
    private _name: string;
    private _sock: ZmqPublisher | undefined;

    constructor(name: string, channel?: string) {
        this._name = name;

        if (channel !== undefined) {
            this._sock = new ZmqPublisher();
            this._sock.bind(channel);
        }
    }

    canPublish(): boolean {
        return this._sock !== undefined;
    }

    async send(msg: Buffer, logger: Logger, topic?: Buffer) {
        if (this._sock === undefined) {
            logger.warn(`Socket "${this._name}" not configured to publish`);
            return;
        }

        return this._sock.send([topic ?? Buffer.alloc(0), msg]).catch((err) => {
            logger.error(`Failed to send message: ${err.toString()}`);
        });
    }

    get name(): string {
        return this._name;
    }
}
