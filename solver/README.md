# Testnet Example Solver

This directory warehouses an example solver to fulfill fast orders by
interacting with the Matching Engine on Solana.

**This example is by no means optimized for performance and has only been tested
on Solana devnet. Any assumptions made in this example may not translate to
mainnet.**

## Table of Contents

1. [Getting Started](#getting-started)
2. [Setting up Config](#setting-up-config)
3. [Listening to Activity](#listening-to-activity)
4. [Running the Example Solver](#running-the-example-solver)
5. [Miscellaneous](#miscellaneous)

## Getting Started

In order to build and install dependencies locally in this repo, you will need
`node` v20.18.1 and `npm`. Get started by installing `nvm` using
[this installation guide](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating).

Run the command below to set up your environment. This installs `node`
dependencies and the Matching Engine package.

```sh
make dependencies
```

## Setting up Config

Here is an example _config.json_ file for Solana devnet. All of the keys here
are required for both the publisher and Example Solver processes.

```json
{
  "environment": "Testnet",
  "zmqChannels": {
    "fastVaa": "tcp://localhost:6001",
    "finalizedVaa": "tcp://localhost:6002"
  },
  "publisher": {
    "log": {
      "level": "info"
    },
    "vaaSpy": {
      "host": "localhost:7073",
      "enableObservationCleanup": true,
      "observationSeenThresholdMs": 1500000,
      "observationCleanupIntervalMs": 500,
      "observationsToRemovePerInterval": 5,
      "delayedThresholdMs": 60000
    }
  },
  "solver": {
    "log": {
      "level": "info",
      "filename": "logs/solver.log"
    },
    "connection": {
      "rpc": "https://your-devnet-rpc-here/",
      "maxTransactionsPerSecond": 5,
      "commitment": "processed",
      "addressLookupTable": "YourAddressLookupTab1eHere11111111111111111",
      "matchingEngine": "mPydpGUWxzERTNpyvTKdvS7v8kvw5sgwfiP8WQFrXVS",
      "mint": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "knownAtaOwners": [
        "Payer11111111111111111111111111111111111111",
        "Payer11111111111111111111111111111111111112",
        "Payer11111111111111111111111111111111111113"
      ]
    }
  },
  "routerEndpoints": [
    {
      "chain": "Sepolia",
      "endpoint": "0xE57D917bf955FedE2888AAbD056202a6497F1882",
      "rollbackRisk": 0.0069,
      "offerEdge": 0.042
    },
    {
      "chain": "Avalanche",
      "endpoint": "0x8Cd7D7C980cd72eBD16737dC3fa04469dcFcf07A",
      "rollbackRisk": 0.0069,
      "offerEdge": 0.042
    },
    {
      "chain": "OptimismSepolia",
      "endpoint": "0x6BAa7397c18abe6221b4f6C3Ac91C88a9faE00D8",
      "rollbackRisk": 0.0069,
      "offerEdge": 0.042
    },
    {
      "chain": "ArbitrumSepolia",
      "endpoint": "0xe0418C44F06B0b0D7D1706E01706316DBB0B210E",
      "rollbackRisk": 0.0069,
      "offerEdge": 0.042
    },
    {
      "chain": "BaseSepolia",
      "endpoint": "0x824Ea687CD1CC2f2446235D33Ae764CbCd08e18C",
      "rollbackRisk": 0.0069,
      "offerEdge": 0.042
    },
    {
      "chain": "Polygon",
      "endpoint": "0xa098368AaaDc0FdF3e309cda710D7A5f8BDEeCD9",
      "rollbackRisk": 0.0069,
      "offerEdge": 0.042
    }
  ]
}
```

Rollback risks and offer edges configured in the sample config are arbitrary.
It is your job to determine which makes sense using historical data and your
risk tolerance.

## Listening to Activity

The Example Solver listens to attested Wormhole messages (VAAs) published on the
Wormhole Guardian gossip network. In order to listen to this gossip network and
run the VAA publisher, run the command below. Docker compose is used to listen
to the Pyth Beacon and start up the [publishActivity](app/publishActivity.ts)
process.

```sh
NETWORK=testnet CONFIG=path/to/config.json make run-publisher
```

You should see output resembling:

```sh
Start logging with info level.
2025-01-21 16:38:28.145 [publisher] info: Environment: Testnet
2025-01-21 16:38:36.631 [publisher] info: Fast VAA. chain=OptimismSepolia, sequence=33635, vaaTime=1737499116
2025-01-21 16:38:51.044 [publisher] info: Fast VAA. chain=OptimismSepolia, sequence=33637, vaaTime=1737499130
2025-01-21 16:40:24.890 [publisher] info: Fast VAA. chain=OptimismSepolia, sequence=33639, vaaTime=1737499224
```

## Running the Example Solver

Using the same config for your publisher, run the Example Solver with the
command below.

```sh
CONFIG=path/to/config.json make run-solver
```

**We recommend writing log output to a file so errors can be tracked.** See the
example config above that specifies an example log filename.

This process reads the following environment variables:

```sh
SOLANA_PRIVATE_KEY_1=
SOLANA_PRIVATE_KEY_2=
SOLANA_PRIVATE_KEY_3=
SOLANA_PRIVATE_KEY_4=
SOLANA_PRIVATE_KEY_5=
```

At least one of these environment variables must be defined as a keypair encoded
in base64 format. **These payers must have SOL in order to pay to send
transactions on Solana devnet.** If these payers need funds, go to the
[Solana devnet faucet] to request some.

The Example Solver assumes that these payers are the owners of USDC Associated
Token Accounts, which will be used to fulfill fast transfers. **These ATAs must
be funded with Solana devnet USDC.** If your ATAs need funds, go to the
[Circle testnet faucet] to request some.

Wallets and their corresponding ATA will be disabled if there are not enough
funds to pay for transactions or fulfill fast transfers. These constraints can
be modified using the `updatePayerMinimumLamports` and
`updateTokenMinimumBalance` methods.

An address lookup table is required to execute some transactions. Use the
command below to create one.

```sh
CONFIG=path/to/config.json make create-lut
```

**`SOLANA_PRIVATE_KEY_1` must be defined in order for this script to work.**

The Example Solver has the following toggles depending on which orders you want
to fulfill:

- `enableCctpOrderPipeline()`
- `enableLocalOrderPipeline()`
- `enablePlaceInitialOffer()`
- `enableImproveOffer()`

See the comments in [runExampleSolver] for more information.

This Example Solver does NOT do the following:

- Discriminate between the CCTP source networks. You will have to add logic to
  determine whether you want to constrain fulfilling orders from specific
  networks. This solver will try to fulfill all orders as long as
  `enableCctpOrderPipeline()` is called.
- Discriminate among fulfillment sizes. There is no logic determining how small
  or large fast order transfer sizes should be. This solver will try to fulfill
  anything as long as your balance can handle it.
- Add auctions to auction history. We recommend that after settling a complete
  auction (one that you have won), you write the auction pubkey to a database
  and have a separate process to add auction history entries to reclaim rent
  from these auction accounts. **The auction history time delay is two hours
  after the VAA timestamp.** This example does not prescribe any specific
  database, so add whichever you want.

## Miscellaneous

To set up the Pyth Beacon (which is run using `make run-publisher`), you may
need to increase the UDP buffer size for the OS:

```sh
# for linux
sudo sysctl -w net.core.rmem_max=2097152
sudo sysctl -w net.core.rmem_default=2097152
# for macos
sudo sysctl -w net.inet.udp.recvspace=2097152
```

[Circle testnet faucet]: https://faucet.circle.com
[Pyth Beacon]: https://github.com/pyth-network/beacon
[Solana devnet faucet]: https://faucet.solana.com
[publishActivity]: app/publishActivity.ts
[runExampleSolver]: app/runExampleSolver.ts
[this installation guide]: https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating
