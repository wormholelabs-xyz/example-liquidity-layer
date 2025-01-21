export * from "./logger";
export * from "./transaction";
export * from "./verifyVaa";

import {
    FastMarketOrder,
    payloads,
} from "@wormhole-foundation/example-liquidity-layer-definitions";
import { LiquidityLayerMessage } from "@wormhole-foundation/example-liquidity-layer-solana/common";

export function tryParseFastMarketOrder(payload: Buffer): FastMarketOrder | undefined {
    try {
        return LiquidityLayerMessage.decode(payload).fastMarketOrder;
    } catch (_) {
        return undefined;
    }
}

export function tryParseSlowOrderResponse(
    payload: Buffer,
): { sourceCctpDomain: number; cctpNonce: bigint; baseFee: bigint } | undefined {
    try {
        const { deposit } = LiquidityLayerMessage.decode(payload);
        if (
            deposit === undefined ||
            deposit.message.payload.id !== payloads("SlowOrderResponse").id
        ) {
            return undefined;
        }

        return {
            sourceCctpDomain: deposit.message.sourceCctpDomain,
            cctpNonce: deposit.message.cctpNonce,
            baseFee: deposit.message.payload.baseFee,
        };
    } catch (_) {
        return undefined;
    }
}
