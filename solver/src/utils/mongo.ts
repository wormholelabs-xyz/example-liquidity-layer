import mongoose from "mongoose";

export interface IMongoExecutedOrder extends Document {
    _id: mongoose.Types.ObjectId;
    auctionVaaHash: Buffer;
    fastVaa: Buffer;
    fastVaaSequence: bigint;
    executeTxSignature?: string;
    savedAt: Date;
}

export interface IMongoSettledOrder extends Document {
    _id: mongoose.Types.ObjectId;
    finalizedVaa: Buffer;
    finalizedVaaSequence: bigint;
    settleTxSignature?: string;
    executedOrder: IMongoExecutedOrder;
    savedAt: Date;
}

export const MongoExecutedOrderSchema: mongoose.Schema = new mongoose.Schema<IMongoExecutedOrder>({
    auctionVaaHash: {
        type: Buffer,
        required: true,
        unique: true,
    },
    fastVaa: {
        type: Buffer,
        required: true,
        unique: true,
    },
    fastVaaSequence: {
        type: mongoose.Schema.Types.BigInt,
        required: true,
    },
    executeTxSignature: {
        type: String,
        unique: false,
    },
    savedAt: {
        type: Date,
        default: Date.now,
    },
});

export const MongoSettledOrderSchema: mongoose.Schema = new mongoose.Schema<IMongoSettledOrder>({
    finalizedVaa: {
        type: Buffer,
        required: true,
        unique: true,
    },
    finalizedVaaSequence: {
        type: mongoose.Schema.Types.BigInt,
        required: true,
    },
    settleTxSignature: {
        type: String,
        unique: false,
    },
    executedOrder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ExecutedOrder",
    },
    savedAt: {
        type: Date,
        default: Date.now,
    },
});

export const MongoExecutedOrder: mongoose.Model<IMongoExecutedOrder> =
    mongoose.model<IMongoExecutedOrder>("ExecutedOrder", MongoExecutedOrderSchema);

export const MongoSettledOrder: mongoose.Model<IMongoSettledOrder> =
    mongoose.model<IMongoSettledOrder>("SettledOrder", MongoSettledOrderSchema);

// export async function saveOrderExecutionAttempt(
//     args: MongoFastOrder,
// ): Promise<IMongoExecutedOrder> {
//     const newOrderExecutionAttempt = new MongoExecutedOrder(args);
//     return newOrderExecutionAttempt.save();
// }

export async function getOrderExecutionAttemptById(
    attemptId: mongoose.Types.ObjectId,
): Promise<IMongoExecutedOrder | null> {
    return MongoExecutedOrder.findById(attemptId);
}

export async function getOrderExecutionAttemptByAuction(
    auctionVaaHash: Buffer,
): Promise<IMongoExecutedOrder | null> {
    return MongoExecutedOrder.findOne({ auctionVaaHash });
}

// export async function getUnsettledOrderExecutionAttempts(): Promise<IMongoOrderExecutionAttempt[]> {
//     return MongoOrderExecutionAttempt.find({ settleTxSignature: { $exists: false } });
// }

export async function saveExecutionTxSignature(
    auctionVaaHash: Buffer,
    executeTxSignature: string,
): Promise<IMongoExecutedOrder> {
    const updated = await MongoExecutedOrder.findOneAndUpdate(
        { auctionVaaHash },
        { executeTxSignature },
        { new: true },
    );

    if (updated === null) {
        throw new Error("Executed order not found");
    }

    return updated;
}

// export async function settledOrderExecutionAttempt(
//     executedOrderId: MongooseTypes.ObjectId,
//     auctionVaaHash: Buffer,
//     finalizedVaa: Buffer,
// ): Promise<IMongoOrderExecutionAttempt> {
//     const updated = await MongoOrderExecutionAttempt.findOneAndUpdate(
//         { executedOrderId },
//         { settled: true },
//         { new: true },
//     );

//     if (updated === null) {
//         throw new Error("Executed order not found");
//     }

//     return updated;
// }
