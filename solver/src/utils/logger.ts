import * as fs from "node:fs";
import * as winston from "winston";

export function defaultLogger(args: {
    label: string;
    level: string;
    filename?: string;
}): winston.Logger {
    const { label, level, filename } = args;

    return winston.createLogger({
        transports: [
            filename === undefined
                ? new winston.transports.Console({
                      level,
                  })
                : new winston.transports.Stream({
                      level,
                      stream: fs.createWriteStream(filename, { flags: "a" }),
                  }),
        ],
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.label({ label }),
            winston.format.splat(),
            winston.format.timestamp({
                format: "YYYY-MM-DD HH:mm:ss.SSS",
            }),
            winston.format.errors({ stack: true }),
            winston.format.printf(({ level, message, label, timestamp }) => {
                return `${timestamp} [${label}] ${level}: ${message}`;
            }),
        ),
    });
}
