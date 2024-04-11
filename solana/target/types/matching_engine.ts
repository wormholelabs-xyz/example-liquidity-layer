export type MatchingEngine = {
  "version": "0.0.0",
  "name": "matching_engine",
  "instructions": [
    {
      "name": "initialize",
      "docs": [
        "This instruction is be used to generate the program's `custodian` and `auction_config`",
        "configs. It also reates the `owner` and `fee_recipient` accounts. Finally, it sets the upgrade",
        "authority to the `upgrade_manager_authority`. Upgrades are managed by the `upgrade_manager_program`.",
        "# Arguments",
        "",
        "* `ctx`            - `Initialize` context.",
        "* `auction_params` - The auction parameters, see `auction_config.rs`."
      ],
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true,
          "docs": [
            "Owner of the program, who presumably deployed this program."
          ]
        },
        {
          "name": "custodian",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "Custodian account, which saves program data useful for other",
            "instructions."
          ]
        },
        {
          "name": "auctionConfig",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ownerAssistant",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "TODO: do we prevent the owner from being the owner assistant?"
          ]
        },
        {
          "name": "feeRecipient",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "feeRecipientToken",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "cctpMintRecipient",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "usdc",
          "accounts": [
            {
              "name": "mint",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "programData",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "We use the program data to make sure this owner is the upgrade authority (the true owner,",
            "who deployed this program)."
          ]
        },
        {
          "name": "upgradeManagerAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "upgradeManagerProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "bpfLoaderUpgradeableProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "auctionParams",
          "type": {
            "defined": "AuctionParameters"
          }
        }
      ]
    },
    {
      "name": "setPause",
      "docs": [
        "This instruction is used to pause or unpause further processing of new auctions. Only the `owner`",
        "or `owner_assistant` can pause the program.",
        "# Arguments",
        "",
        "* `ctx`   - `SetPause` context.",
        "* `pause` - Boolean indicating whether to pause the program."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "ownerOrAssistant",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "isMut": true,
              "isSigner": false
            }
          ]
        }
      ],
      "args": [
        {
          "name": "pause",
          "type": "bool"
        }
      ]
    },
    {
      "name": "addCctpRouterEndpoint",
      "docs": [
        "This instruction is used to add a new Token Router endpoint from a foreign chain. The endpoint",
        "must be CCTP compatible. This instruction can only be called by the `owner` or `owner_assistant`.",
        "# Arguments",
        "",
        "* `ctx`  - `AddCctpRouterEndpoint` context.",
        "* `args` - The `AddCctpRouterEndpointArgs`, see `admin.rs`."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "admin",
          "accounts": [
            {
              "name": "ownerOrAssistant",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "routerEndpoint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "localCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "usdc",
          "accounts": [
            {
              "name": "mint",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "remoteTokenMessenger",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "Messenger Minter program)."
          ]
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "AddCctpRouterEndpointArgs"
          }
        }
      ]
    },
    {
      "name": "addLocalRouterEndpoint",
      "docs": [
        "This instruction is used to add a new Local Router endpoint. Local means that the",
        "Token Router program exists on Solana. This instruction can only be called by the",
        "`owner` or `owner_assistant`.",
        "# Arguments",
        "",
        "* `ctx` - `AddLocalRouterEndpoint` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "admin",
          "accounts": [
            {
              "name": "ownerOrAssistant",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "routerEndpoint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "local",
          "accounts": [
            {
              "name": "tokenRouterProgram",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "emitter (router endpoint) address."
              ]
            },
            {
              "name": "tokenRouterEmitter",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "tokenRouterMintRecipient",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "disableRouterEndpoint",
      "docs": [
        "This instruction is used to disable a router endpoint. This instruction does not close the",
        "account, it only sets the `protocol` to `None` and clears the `address` and `mint_recipient`.",
        "This instruction can only be called by the `owner`.",
        "# Arguments",
        "",
        "* `ctx` - `DisableRouterEndpoint` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "routerEndpoint",
          "accounts": [
            {
              "name": "endpoint",
              "isMut": true,
              "isSigner": false
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "updateCctpRouterEndpoint",
      "docs": [
        "This instruction is used to update a CCTP router endpoint. It allows the caller to change",
        "the `address`, `mint_recipient`, and `domain`. This instruction can only be called by the",
        "`owner`.",
        "# Arguments",
        "",
        "* `ctx`  - `UpdateCctpRouterEndpoint` context.",
        "* `args` - The `AddCctpRouterEndpointArgs`, see `admin.rs`."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "routerEndpoint",
          "accounts": [
            {
              "name": "endpoint",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "remoteTokenMessenger",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "Messenger Minter program)."
          ]
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "AddCctpRouterEndpointArgs"
          }
        }
      ]
    },
    {
      "name": "updateLocalRouterEndpoint",
      "docs": [
        "This instruction is used to update a Local router endpoint. It allows the caller to change",
        "the `address` and `mint_recipient`. This instruction can only be called by the `owner`.",
        "# Arguments",
        "",
        "* `ctx` - `UpdateLocalRouterEndpoint` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "routerEndpoint",
          "accounts": [
            {
              "name": "endpoint",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "local",
          "accounts": [
            {
              "name": "tokenRouterProgram",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "emitter (router endpoint) address."
              ]
            },
            {
              "name": "tokenRouterEmitter",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "tokenRouterMintRecipient",
              "isMut": false,
              "isSigner": false
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "submitOwnershipTransferRequest",
      "docs": [
        "This instruction sets the `pending_owner` field in the `Custodian` account. This instruction",
        "can only be called by the `owner`. The `pending_owner` address must be valid, meaning it",
        "cannot be the zero address or the current owner.",
        "# Arguments",
        "",
        "* `ctx` - `SubmitOwnershipTransferRequest` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "newOwner",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "New Owner.",
            ""
          ]
        }
      ],
      "args": []
    },
    {
      "name": "confirmOwnershipTransferRequest",
      "docs": [
        "This instruction confirms the ownership transfer request and sets the new `owner` in the",
        "`Custodian` account. This instruction can only be called by the `pending_owner`. The",
        "`pending_owner` must be the same as the `pending_owner` in the `Custodian` account.",
        "# Arguments",
        "",
        "* `ctx` - `ConfirmOwnershipTransferRequest` context."
      ],
      "accounts": [
        {
          "name": "pendingOwner",
          "isMut": false,
          "isSigner": true,
          "docs": [
            "Must be the pending owner of the program set in the [`OwnerConfig`]",
            "account."
          ]
        },
        {
          "name": "custodian",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "cancelOwnershipTransferRequest",
      "docs": [
        "This instruction cancels an ownership transfer request by resetting the `pending_owner` field",
        "in the `Custodian` account. This instruction can only be called by the `owner`.",
        "# Arguments",
        "",
        "* `ctx` - `CancelOwnershipTransferRequest` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "isMut": true,
              "isSigner": false
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "proposeAuctionParameters",
      "docs": [
        "This instruction is used to propose new auction parameters. A proposal cannot be enacted",
        "until one epoch has passed. This instruction can only be called by the `owner` or",
        "`owner_assistant`.",
        "# Arguments",
        "",
        "* `ctx`    - `ProposeAuctionParameters` context.",
        "* `params` - The new `AuctionParameters`, see `auction_config.rs`."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "admin",
          "accounts": [
            {
              "name": "ownerOrAssistant",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "proposal",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "epochSchedule",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": "AuctionParameters"
          }
        }
      ]
    },
    {
      "name": "updateAuctionParameters",
      "docs": [
        "This instruction is used to enact an existing auction update proposal. It can only be",
        "executed after the `slot_enact_delay` has passed. This instruction can only be called by",
        "the `owner` of the proposal.",
        "# Arguments",
        "",
        "* `ctx` - `UpdateAuctionParameters` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "proposal",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "auctionConfig",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "closeProposal",
      "docs": [
        "This instruction is used to close an existing proposal by closing the propsal account. This",
        "instruction can only be called by the `owner`.",
        "# Arguments",
        "",
        "* `ctx` - `CloseProposal` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "ownerOrAssistant",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "proposedBy",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "proposal",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "updateOwnerAssistant",
      "docs": [
        "This instruction is used to update the `owner_assistant` field in the `Custodian` account. This",
        "instruction can only be called by the `owner`.",
        "# Arguments",
        "",
        "* `ctx` - `UpdateOwnerAssistant` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "newOwnerAssistant",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "New Assistant.",
            ""
          ]
        }
      ],
      "args": []
    },
    {
      "name": "updateFeeRecipient",
      "docs": [
        "This instruction is used to update the `fee_recipient` field in the `Custodian` account. This",
        "instruction can only be called by the `owner`.",
        "# Arguments",
        "",
        "* `ctx` - `UpdateFeeRecipient` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "ownerOrAssistant",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "newFeeRecipientToken",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "newFeeRecipient",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "New Fee Recipient.",
            ""
          ]
        }
      ],
      "args": []
    },
    {
      "name": "migrate",
      "docs": [
        "This instruction is used for executing logic during an upgrade. This instruction can only be",
        "called by the `upgrade_manager_program`.",
        "# Arguments",
        "",
        "* `ctx` - `Migrate` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "placeInitialOfferCctp",
      "docs": [
        "This instruction is used to create a new auction given a valid `FastMarketOrder` vaa. This",
        "instruction will record information about the auction and transfer funds from the payer to",
        "an auction-specific token custody account. This instruction can be called by anyone.",
        "# Arguments",
        "",
        "* `ctx`       - `PlaceInitialOfferCctp` context.",
        "* `offer_price` - The fee that the caller is willing to accept in order for fufilling the fast",
        "order. This fee is paid in USDC."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "transferAuthority",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "The auction participant needs to set approval to this PDA.",
            ""
          ]
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "auctionConfig",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "fastOrderPath",
          "accounts": [
            {
              "name": "fastVaa",
              "accounts": [
                {
                  "name": "vaa",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "path",
              "accounts": [
                {
                  "name": "fromEndpoint",
                  "accounts": [
                    {
                      "name": "endpoint",
                      "isMut": false,
                      "isSigner": false
                    }
                  ]
                },
                {
                  "name": "toEndpoint",
                  "accounts": [
                    {
                      "name": "endpoint",
                      "isMut": false,
                      "isSigner": false
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "name": "auction",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "This account should only be created once, and should never be changed to",
            "init_if_needed. Otherwise someone can game an existing auction."
          ]
        },
        {
          "name": "offerToken",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "auctionCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "usdc",
          "accounts": [
            {
              "name": "mint",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "offerPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "improveOffer",
      "docs": [
        "This instruction is used to improve an existing auction offer. The `offer_price` must be",
        "greater than the current `offer_price` in the auction. This instruction will revert if the",
        "`offer_price` is less than the current `offer_price`. This instruction can be called by anyone.",
        "# Arguments",
        "",
        "* `ctx`       - `ImproveOffer` context.",
        "* `offer_price` - The fee that the caller is willing to accept in order for fufilling the fast",
        "order. This fee is paid in USDC."
      ],
      "accounts": [
        {
          "name": "transferAuthority",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "The auction participant needs to set approval to this PDA.",
            ""
          ]
        },
        {
          "name": "activeAuction",
          "accounts": [
            {
              "name": "auction",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "custodyToken",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "config",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "bestOfferToken",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "offerToken",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "offerPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeFastOrderCctp",
      "docs": [
        "This instruction is used to execute the fast order after the auction period has ended.",
        "It should be executed before the `grace_period` has ended, otherwise the `highest_bidder`",
        "will incur a penalty. Once executed, a CCTP transfer will be sent to the recipient encoded",
        "in the `FastMarketOrder` VAA on the target chain.",
        "# Arguments",
        "",
        "* `ctx` - `ExecuteFastOrderCctp` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "payerSequence",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "coreMessage",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "cctpMessage",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "executeOrder",
          "accounts": [
            {
              "name": "fastVaa",
              "accounts": [
                {
                  "name": "vaa",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "activeAuction",
              "accounts": [
                {
                  "name": "auction",
                  "isMut": true,
                  "isSigner": false
                },
                {
                  "name": "custodyToken",
                  "isMut": true,
                  "isSigner": false
                },
                {
                  "name": "config",
                  "isMut": false,
                  "isSigner": false
                },
                {
                  "name": "bestOfferToken",
                  "isMut": true,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "executorToken",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "initialOfferToken",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "toRouterEndpoint",
          "accounts": [
            {
              "name": "endpoint",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "wormhole",
          "accounts": [
            {
              "name": "config",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "emitterSequence",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "feeCollector",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "coreBridgeProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "cctp",
          "accounts": [
            {
              "name": "mint",
              "isMut": true,
              "isSigner": false,
              "docs": [
                "Circle-supported mint.",
                "",
                "Token Messenger Minter program's local token account."
              ]
            },
            {
              "name": "tokenMessengerMinterSenderAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "messageTransmitterConfig",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "tokenMessenger",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "remoteTokenMessenger",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Messenger Minter program)."
              ]
            },
            {
              "name": "tokenMinter",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "CHECK Seeds must be \\[\"token_minter\"\\] (CCTP Token Messenger Minter program)."
              ]
            },
            {
              "name": "localToken",
              "isMut": true,
              "isSigner": false,
              "docs": [
                "Local token account, which this program uses to validate the `mint` used to burn.",
                ""
              ]
            },
            {
              "name": "tokenMessengerMinterEventAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "tokenMessengerMinterProgram",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "messageTransmitterProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sysvars",
          "accounts": [
            {
              "name": "clock",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the clock sysvar based on its legacy implementation.",
                ""
              ]
            },
            {
              "name": "rent",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the rent sysvar based on its legacy implementation.",
                ""
              ]
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "executeFastOrderLocal",
      "docs": [
        "This instruction is used to execute the fast order after the auction period has ended.",
        "It should be executed before the `grace_period` has ended, otherwise the `highest_bidder`",
        "will incur a penalty. Once executed, a `fast_fill` VAA will be emitted.",
        "# Arguments",
        "",
        "* `ctx` - `ExecuteFastOrderLocal` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "payerSequence",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "coreMessage",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "executeOrder",
          "accounts": [
            {
              "name": "fastVaa",
              "accounts": [
                {
                  "name": "vaa",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "activeAuction",
              "accounts": [
                {
                  "name": "auction",
                  "isMut": true,
                  "isSigner": false
                },
                {
                  "name": "custodyToken",
                  "isMut": true,
                  "isSigner": false
                },
                {
                  "name": "config",
                  "isMut": false,
                  "isSigner": false
                },
                {
                  "name": "bestOfferToken",
                  "isMut": true,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "executorToken",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "initialOfferToken",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "toRouterEndpoint",
          "accounts": [
            {
              "name": "endpoint",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "wormhole",
          "accounts": [
            {
              "name": "config",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "emitterSequence",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "feeCollector",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "coreBridgeProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "localCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sysvars",
          "accounts": [
            {
              "name": "clock",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the clock sysvar based on its legacy implementation.",
                ""
              ]
            },
            {
              "name": "rent",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the rent sysvar based on its legacy implementation.",
                ""
              ]
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "completeFastFill",
      "docs": [
        "This instruction is used to complete the fast fill after the `fast_fill` VAA has been",
        "emitted. The Token Router program on Solana will invoke this instruction to complete the",
        "fast fill. Tokens will be deposited into the local endpoint's custody account.",
        "# Arguments",
        "",
        "* `ctx` - `CompleteFastFill` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "fastFillVaa",
          "accounts": [
            {
              "name": "vaa",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "redeemedFastFill",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenRouterEmitter",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "tokenRouterCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "path",
          "accounts": [
            {
              "name": "fromEndpoint",
              "accounts": [
                {
                  "name": "endpoint",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "toEndpoint",
              "accounts": [
                {
                  "name": "endpoint",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "localCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "prepareOrderResponseCctp",
      "docs": [
        "This instruction is used to prepare the order response for a CCTP transfer. This instruction",
        "will redeem the finalized transfer associated with a particular auction, and deposit the funds",
        "to the `prepared_custody_token` account that is created during execution. This instruction",
        "will create a `PreparedOrderResponse` account that will be used to settle the auction.",
        "# Arguments",
        "",
        "* `ctx` - `PrepareOrderResponseCctp` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "fastVaa",
          "accounts": [
            {
              "name": "vaa",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "finalizedVaa",
          "accounts": [
            {
              "name": "vaa",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "preparedOrderResponse",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "preparedCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "usdc",
          "accounts": [
            {
              "name": "mint",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "cctp",
          "accounts": [
            {
              "name": "mintRecipient",
              "accounts": [
                {
                  "name": "mintRecipient",
                  "isMut": true,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "messageTransmitterAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "messageTransmitterConfig",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "usedNonces",
              "isMut": true,
              "isSigner": false,
              "docs": [
                "first_nonce.to_string()\\] (CCTP Message Transmitter program)."
              ]
            },
            {
              "name": "messageTransmitterEventAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "tokenMessenger",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "remoteTokenMessenger",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Messenger Minter program)."
              ]
            },
            {
              "name": "tokenMinter",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "localToken",
              "isMut": true,
              "isSigner": false,
              "docs": [
                "Token Messenger Minter's Local Token account. This program uses the mint of this account to",
                "validate the `mint_recipient` token account's mint.",
                ""
              ]
            },
            {
              "name": "tokenPair",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Token Messenger Minter program)."
              ]
            },
            {
              "name": "tokenMessengerMinterCustodyToken",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "tokenMessengerMinterEventAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "tokenMessengerMinterProgram",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "messageTransmitterProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "CctpMessageArgs"
          }
        }
      ]
    },
    {
      "name": "settleAuctionComplete",
      "docs": [
        "This instruction is used to settle the acution after the `FastMarketOrder` has been executed,",
        "and the `PreparedOrderResponse` has been created. This instruction will settle the auction",
        "by transferring the funds from the `prepared_custody_token` account to the `highest_bidder`",
        "account.",
        "# Arguments",
        "",
        "* `ctx` - `SettleAuctionComplete` context."
      ],
      "accounts": [
        {
          "name": "executor",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "we will always reward the owner of the executor token account with the lamports from the",
            "prepared order response and its custody token account when we close these accounts. This",
            "means we disregard the `prepared_by` field in the prepared order response."
          ]
        },
        {
          "name": "executorToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bestOfferToken",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "Destination token account, which the redeemer may not own. But because the redeemer is a",
            "signer and is the one encoded in the Deposit Fill message, he may have the tokens be sent",
            "to any account he chooses (this one).",
            ""
          ]
        },
        {
          "name": "preparedOrderResponse",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "preparedCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "auction",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "settleAuctionNoneCctp",
      "docs": [
        "This instruction is used to route funds to the `recipient` for a `FastMarketOrder` with",
        "no corresponding auction on Solana. This instruction can be called by anyone, but the",
        "`base_fee` associated with relaying a finalized VAA will be paid to the `fee_recipient`.",
        "This instruction generates a `Fill` message.",
        "# Arguments",
        "",
        "* `ctx` - `SettleAuctionNoneCctp` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "payerSequence",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "coreMessage",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "cctpMessage",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "feeRecipientToken",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "Destination token account, which the redeemer may not own. But because the redeemer is a",
            "signer and is the one encoded in the Deposit Fill message, he may have the tokens be sent",
            "to any account he chooses (this one).",
            ""
          ]
        },
        {
          "name": "prepared",
          "accounts": [
            {
              "name": "by",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "orderResponse",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "custodyToken",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "fastOrderPath",
          "accounts": [
            {
              "name": "fastVaa",
              "accounts": [
                {
                  "name": "vaa",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "path",
              "accounts": [
                {
                  "name": "fromEndpoint",
                  "accounts": [
                    {
                      "name": "endpoint",
                      "isMut": false,
                      "isSigner": false
                    }
                  ]
                },
                {
                  "name": "toEndpoint",
                  "accounts": [
                    {
                      "name": "endpoint",
                      "isMut": false,
                      "isSigner": false
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "name": "auction",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "There should be no account data here because an auction was never created."
          ]
        },
        {
          "name": "wormhole",
          "accounts": [
            {
              "name": "config",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "emitterSequence",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "feeCollector",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "coreBridgeProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "cctp",
          "accounts": [
            {
              "name": "mint",
              "isMut": true,
              "isSigner": false,
              "docs": [
                "Circle-supported mint.",
                "",
                "Token Messenger Minter program's local token account."
              ]
            },
            {
              "name": "tokenMessengerMinterSenderAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "messageTransmitterConfig",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "tokenMessenger",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "remoteTokenMessenger",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Messenger Minter program)."
              ]
            },
            {
              "name": "tokenMinter",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "CHECK Seeds must be \\[\"token_minter\"\\] (CCTP Token Messenger Minter program)."
              ]
            },
            {
              "name": "localToken",
              "isMut": true,
              "isSigner": false,
              "docs": [
                "Local token account, which this program uses to validate the `mint` used to burn.",
                ""
              ]
            },
            {
              "name": "tokenMessengerMinterEventAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "tokenMessengerMinterProgram",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "messageTransmitterProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sysvars",
          "accounts": [
            {
              "name": "clock",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the clock sysvar based on its legacy implementation.",
                ""
              ]
            },
            {
              "name": "rent",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the rent sysvar based on its legacy implementation.",
                ""
              ]
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "settleAuctionNoneLocal",
      "docs": [
        "This instruction is used to settle a `FastMarketOrder` with no corresponding auction. The funds",
        "are routed to the `recipient` on the target chain by executing a CCTP transfer and sending a `Fill`",
        "message. This instruction can be called by anyone, but the `base_fee` associated with relaying a",
        "finalized VAA will be paid to the `fee_recipient`.",
        "# Arguments",
        "",
        "* `ctx` - `SettleAuctionNoneLocal` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "payerSequence",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "coreMessage",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "feeRecipientToken",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "Destination token account, which the redeemer may not own. But because the redeemer is a",
            "signer and is the one encoded in the Deposit Fill message, he may have the tokens be sent",
            "to any account he chooses (this one).",
            ""
          ]
        },
        {
          "name": "prepared",
          "accounts": [
            {
              "name": "by",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "orderResponse",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "custodyToken",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "fastOrderPath",
          "accounts": [
            {
              "name": "fastVaa",
              "accounts": [
                {
                  "name": "vaa",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "path",
              "accounts": [
                {
                  "name": "fromEndpoint",
                  "accounts": [
                    {
                      "name": "endpoint",
                      "isMut": false,
                      "isSigner": false
                    }
                  ]
                },
                {
                  "name": "toEndpoint",
                  "accounts": [
                    {
                      "name": "endpoint",
                      "isMut": false,
                      "isSigner": false
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "name": "auction",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "There should be no account data here because an auction was never created."
          ]
        },
        {
          "name": "wormhole",
          "accounts": [
            {
              "name": "config",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "emitterSequence",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "feeCollector",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "coreBridgeProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "localCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sysvars",
          "accounts": [
            {
              "name": "clock",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the clock sysvar based on its legacy implementation.",
                ""
              ]
            },
            {
              "name": "rent",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the rent sysvar based on its legacy implementation.",
                ""
              ]
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "createFirstAuctionHistory",
      "docs": [
        "This instruction is used to create the first `AuctionHistory` account, whose PDA is derived",
        "using ID == 0.",
        "# Arguments",
        "",
        "* `ctx` - `CreateFirstAuctionHistory` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "firstHistory",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "createNewAuctionHistory",
      "docs": [
        "This instruction is used to create a new `AuctionHistory` account. The PDA is derived using",
        "its ID. A new history account can be created only when the current one is full (number of",
        "entries equals the hard-coded max entries).",
        "# Arguments",
        "",
        "* `ctx` - `CreateNewAuctionHistory` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "currentHistory",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "newHistory",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "addAuctionHistoryEntry",
      "docs": [
        "This instruction is used to add a new entry to the `AuctionHistory` account if there is an",
        "`Auction` with some info. Regardless of whether there is info in this account, the",
        "instruction finishes its operation by closing this auction account. If the history account",
        "is full, this instruction will revert and `create_new_auction_history`` will have to be",
        "called to initialize another history account.",
        "",
        "This mechanism is important for auction participants. The initial offer participant will",
        "pay lamports to create the `Auction` account. This instruction allows him to reclaim some",
        "lamports by closing that account. And the protocol's fee recipient will be able to claim",
        "lamports by closing the empty `Auction` account it creates when he calls any of the",
        "`settle_auction_none_*` instructions.",
        "# Arguments",
        "",
        "* `ctx` - `AddAuctionHistoryEntry` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "history",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "because we will be writing to this account without using Anchor's [AccountsExit]."
          ]
        },
        {
          "name": "auction",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "beneficiary",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "was no auction) or the owner of the initial offer token account."
          ]
        },
        {
          "name": "beneficiaryToken",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "auctionConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "docs": [
              "Monotonically increasing identifier for auction configs."
            ],
            "type": "u32"
          },
          {
            "name": "parameters",
            "docs": [
              "Auction parameters, which are validated by [crate::utils::auction::require_valid_parameters]."
            ],
            "type": {
              "defined": "AuctionParameters"
            }
          }
        ]
      }
    },
    {
      "name": "auctionHistory",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "header",
            "type": {
              "defined": "AuctionHistoryHeader"
            }
          },
          {
            "name": "data",
            "type": {
              "vec": {
                "defined": "AuctionEntry"
              }
            }
          }
        ]
      }
    },
    {
      "name": "auction",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaaHash",
            "docs": [
              "VAA hash of the auction."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "vaaTimestamp",
            "docs": [
              "Timestamp of the fast market order VAA."
            ],
            "type": "u32"
          },
          {
            "name": "targetProtocol",
            "docs": [
              "Transfer protocol used to move assets."
            ],
            "type": {
              "defined": "MessageProtocol"
            }
          },
          {
            "name": "status",
            "docs": [
              "Auction status."
            ],
            "type": {
              "defined": "AuctionStatus"
            }
          },
          {
            "name": "info",
            "docs": [
              "Optional auction info. This field will be `None`` if there is no auction."
            ],
            "type": {
              "option": {
                "defined": "AuctionInfo"
              }
            }
          }
        ]
      }
    },
    {
      "name": "custodian",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "Program's owner."
            ],
            "type": "publicKey"
          },
          {
            "name": "pendingOwner",
            "type": {
              "option": "publicKey"
            }
          },
          {
            "name": "paused",
            "docs": [
              "Boolean indicating whether inbound auctions are paused."
            ],
            "type": "bool"
          },
          {
            "name": "pausedSetBy",
            "type": "publicKey"
          },
          {
            "name": "ownerAssistant",
            "docs": [
              "Program's assistant."
            ],
            "type": "publicKey"
          },
          {
            "name": "feeRecipientToken",
            "type": "publicKey"
          },
          {
            "name": "auctionConfigId",
            "type": "u32"
          },
          {
            "name": "nextProposalId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "payerSequence",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "value",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "preparedOrderResponse",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "fastVaaHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "preparedBy",
            "type": "publicKey"
          },
          {
            "name": "sourceChain",
            "type": "u16"
          },
          {
            "name": "baseFee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "proposal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "action",
            "type": {
              "defined": "ProposalAction"
            }
          },
          {
            "name": "by",
            "type": "publicKey"
          },
          {
            "name": "owner",
            "type": "publicKey"
          },
          {
            "name": "slotProposedAt",
            "type": "u64"
          },
          {
            "name": "slotEnactDelay",
            "type": "u64"
          },
          {
            "name": "slotEnactedAt",
            "type": {
              "option": "u64"
            }
          }
        ]
      }
    },
    {
      "name": "redeemedFastFill",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaaHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "sequence",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "routerEndpoint",
      "docs": [
        "Foreign emitter account data."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "chain",
            "docs": [
              "Emitter chain. Cannot equal `1` (Solana's Chain ID)."
            ],
            "type": "u16"
          },
          {
            "name": "address",
            "docs": [
              "Emitter address. Cannot be zero address."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "mintRecipient",
            "docs": [
              "Future-proof field in case another network has token accounts to send assets to instead of",
              "sending to the address directly."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "protocol",
            "docs": [
              "Specific message protocol used to move assets."
            ],
            "type": {
              "defined": "MessageProtocol"
            }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "CctpMessageArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "encodedCctpMessage",
            "type": "bytes"
          },
          {
            "name": "cctpAttestation",
            "type": "bytes"
          }
        ]
      }
    },
    {
      "name": "AuctionParameters",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "userPenaltyRewardBps",
            "type": "u32"
          },
          {
            "name": "initialPenaltyBps",
            "type": "u32"
          },
          {
            "name": "duration",
            "type": "u16"
          },
          {
            "name": "gracePeriod",
            "docs": [
              "* The grace period of the auction in slots. This is the number of slots the highest bidder\n     * has to execute the fast order before incurring a penalty. About 15 seconds on Avalanche.\n     * This value INCLUDES the `_auctionDuration`."
            ],
            "type": "u16"
          },
          {
            "name": "penaltyPeriod",
            "type": "u16"
          },
          {
            "name": "minOfferDeltaBps",
            "type": "u32"
          },
          {
            "name": "securityDepositBase",
            "docs": [
              "The base security deposit, which will the the additional amount an auction participant must",
              "deposit to participate in an auction."
            ],
            "type": "u64"
          },
          {
            "name": "securityDepositBps",
            "docs": [
              "Additional security deposit based on the notional of the order amount."
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "AuctionEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaaHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "vaaTimestamp",
            "type": "u32"
          },
          {
            "name": "info",
            "type": {
              "defined": "AuctionInfo"
            }
          }
        ]
      }
    },
    {
      "name": "AuctionHistoryHeader",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "minTimestamp",
            "type": {
              "option": "u32"
            }
          },
          {
            "name": "maxTimestamp",
            "type": {
              "option": "u32"
            }
          }
        ]
      }
    },
    {
      "name": "AuctionHistoryInternal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "header",
            "type": {
              "defined": "AuctionHistoryHeader"
            }
          },
          {
            "name": "numEntries",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "AuctionDestinationAssetInfo",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "custodyTokenBump",
            "type": "u8"
          },
          {
            "name": "amountOut",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "AuctionInfo",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "configId",
            "type": "u32"
          },
          {
            "name": "custodyTokenBump",
            "type": "u8"
          },
          {
            "name": "vaaSequence",
            "docs": [
              "Sequence of the fast market order VAA."
            ],
            "type": "u64"
          },
          {
            "name": "sourceChain",
            "docs": [
              "The chain where the transfer is initiated."
            ],
            "type": "u16"
          },
          {
            "name": "bestOfferToken",
            "docs": [
              "The highest bidder of the auction."
            ],
            "type": "publicKey"
          },
          {
            "name": "initialOfferToken",
            "docs": [
              "The initial bidder of the auction."
            ],
            "type": "publicKey"
          },
          {
            "name": "startSlot",
            "docs": [
              "The slot when the auction started."
            ],
            "type": "u64"
          },
          {
            "name": "amountIn",
            "docs": [
              "The amount reflecting the amount of assets transferred into the matching engine. This plus",
              "and the security deposit are used to participate in the auction."
            ],
            "type": "u64"
          },
          {
            "name": "securityDeposit",
            "docs": [
              "The additional deposit made by the highest bidder.",
              "",
              "NOTE: This may not be the same denomination as the `amount_in`."
            ],
            "type": "u64"
          },
          {
            "name": "offerPrice",
            "docs": [
              "The offer price of the auction."
            ],
            "type": "u64"
          },
          {
            "name": "destinationAssetInfo",
            "docs": [
              "If the destination asset is not equal to the asset used for auctions, this will be some",
              "value specifying its custody token bump and amount out.",
              "",
              "NOTE: Because this is an option, the `AuctionDestinationAssetInfo` having some definition while this",
              "field is None will not impact future serialization because the option's serialized value is",
              "zero. Only when there will be other assets will this struct's members have to be carefully",
              "considered."
            ],
            "type": {
              "option": {
                "defined": "AuctionDestinationAssetInfo"
              }
            }
          }
        ]
      }
    },
    {
      "name": "AddCctpRouterEndpointArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "chain",
            "type": "u16"
          },
          {
            "name": "cctpDomain",
            "type": "u32"
          },
          {
            "name": "address",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "mintRecipient",
            "type": {
              "option": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "AuctionStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "NotStarted"
          },
          {
            "name": "Active"
          },
          {
            "name": "Completed",
            "fields": [
              {
                "name": "slot",
                "type": "u64"
              },
              {
                "name": "executePenalty",
                "type": {
                  "option": "u64"
                }
              }
            ]
          },
          {
            "name": "Settled",
            "fields": [
              {
                "name": "baseFee",
                "type": "u64"
              },
              {
                "name": "totalPenalty",
                "type": {
                  "option": "u64"
                }
              }
            ]
          }
        ]
      }
    },
    {
      "name": "ProposalAction",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "None"
          },
          {
            "name": "UpdateAuctionParameters",
            "fields": [
              {
                "name": "id",
                "type": "u32"
              },
              {
                "name": "parameters",
                "type": {
                  "defined": "AuctionParameters"
                }
              }
            ]
          }
        ]
      }
    },
    {
      "name": "MessageProtocol",
      "docs": [
        "Protocol used to transfer assets."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "None"
          },
          {
            "name": "Local",
            "fields": [
              {
                "name": "programId",
                "type": "publicKey"
              }
            ]
          },
          {
            "name": "Cctp",
            "fields": [
              {
                "name": "domain",
                "docs": [
                  "CCTP domain, which is how CCTP registers identifies foreign networks."
                ],
                "type": "u32"
              }
            ]
          }
        ]
      }
    }
  ],
  "events": [
    {
      "name": "AuctionSettled",
      "fields": [
        {
          "name": "auction",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "bestOfferToken",
          "type": {
            "option": "publicKey"
          },
          "index": false
        },
        {
          "name": "tokenBalanceAfter",
          "type": "u64",
          "index": false
        }
      ]
    },
    {
      "name": "AuctionUpdated",
      "fields": [
        {
          "name": "configId",
          "type": "u32",
          "index": false
        },
        {
          "name": "auction",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "vaa",
          "type": {
            "option": "publicKey"
          },
          "index": false
        },
        {
          "name": "sourceChain",
          "type": "u16",
          "index": false
        },
        {
          "name": "targetProtocol",
          "type": {
            "defined": "MessageProtocol"
          },
          "index": false
        },
        {
          "name": "endSlot",
          "type": "u64",
          "index": false
        },
        {
          "name": "bestOfferToken",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "tokenBalanceBefore",
          "type": "u64",
          "index": false
        },
        {
          "name": "amountIn",
          "type": "u64",
          "index": false
        },
        {
          "name": "totalDeposit",
          "type": "u64",
          "index": false
        },
        {
          "name": "maxOfferPriceAllowed",
          "type": "u64",
          "index": false
        }
      ]
    },
    {
      "name": "Enacted",
      "fields": [
        {
          "name": "action",
          "type": {
            "defined": "ProposalAction"
          },
          "index": false
        }
      ]
    },
    {
      "name": "OrderExecuted",
      "fields": [
        {
          "name": "auction",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "vaa",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "targetProtocol",
          "type": {
            "defined": "MessageProtocol"
          },
          "index": false
        }
      ]
    },
    {
      "name": "Proposed",
      "fields": [
        {
          "name": "action",
          "type": {
            "defined": "ProposalAction"
          },
          "index": false
        }
      ]
    }
  ],
  "errors": [
    {
      "code": 6002,
      "name": "OwnerOnly"
    },
    {
      "code": 6004,
      "name": "OwnerOrAssistantOnly"
    },
    {
      "code": 6016,
      "name": "U64Overflow"
    },
    {
      "code": 6018,
      "name": "U32Overflow"
    },
    {
      "code": 6032,
      "name": "SameEndpoint"
    },
    {
      "code": 6034,
      "name": "InvalidEndpoint"
    },
    {
      "code": 6048,
      "name": "InvalidVaa"
    },
    {
      "code": 6066,
      "name": "InvalidDeposit"
    },
    {
      "code": 6068,
      "name": "InvalidDepositMessage"
    },
    {
      "code": 6070,
      "name": "InvalidPayloadId"
    },
    {
      "code": 6072,
      "name": "InvalidDepositPayloadId"
    },
    {
      "code": 6074,
      "name": "NotFastMarketOrder"
    },
    {
      "code": 6076,
      "name": "VaaMismatch"
    },
    {
      "code": 6096,
      "name": "InvalidSourceRouter"
    },
    {
      "code": 6098,
      "name": "InvalidTargetRouter"
    },
    {
      "code": 6100,
      "name": "EndpointDisabled"
    },
    {
      "code": 6102,
      "name": "InvalidCctpEndpoint"
    },
    {
      "code": 6128,
      "name": "Paused"
    },
    {
      "code": 6256,
      "name": "AssistantZeroPubkey"
    },
    {
      "code": 6257,
      "name": "FeeRecipientZeroPubkey"
    },
    {
      "code": 6258,
      "name": "ImmutableProgram"
    },
    {
      "code": 6260,
      "name": "ZeroDuration"
    },
    {
      "code": 6262,
      "name": "ZeroGracePeriod"
    },
    {
      "code": 6263,
      "name": "ZeroPenaltyPeriod"
    },
    {
      "code": 6264,
      "name": "UserPenaltyRewardBpsTooLarge",
      "msg": "Value exceeds 1000000"
    },
    {
      "code": 6266,
      "name": "InitialPenaltyBpsTooLarge",
      "msg": "Value exceeds 1000000"
    },
    {
      "code": 6268,
      "name": "MinOfferDeltaBpsTooLarge",
      "msg": "Value exceeds 1000000"
    },
    {
      "code": 6270,
      "name": "ZeroSecurityDepositBase"
    },
    {
      "code": 6271,
      "name": "SecurityDepositBpsTooLarge",
      "msg": "Value exceeds 1000000"
    },
    {
      "code": 6514,
      "name": "InvalidNewOwner"
    },
    {
      "code": 6516,
      "name": "AlreadyOwner"
    },
    {
      "code": 6518,
      "name": "NoTransferOwnershipRequest"
    },
    {
      "code": 6520,
      "name": "NotPendingOwner"
    },
    {
      "code": 6524,
      "name": "InvalidChain"
    },
    {
      "code": 6576,
      "name": "ChainNotAllowed"
    },
    {
      "code": 6578,
      "name": "InvalidMintRecipient"
    },
    {
      "code": 6768,
      "name": "ProposalAlreadyEnacted"
    },
    {
      "code": 6770,
      "name": "ProposalDelayNotExpired"
    },
    {
      "code": 6772,
      "name": "InvalidProposal"
    },
    {
      "code": 6832,
      "name": "AuctionConfigMismatch"
    },
    {
      "code": 7024,
      "name": "FastMarketOrderExpired"
    },
    {
      "code": 7026,
      "name": "OfferPriceTooHigh"
    },
    {
      "code": 7030,
      "name": "InvalidEmitterForFastFill"
    },
    {
      "code": 7032,
      "name": "AuctionNotActive"
    },
    {
      "code": 7034,
      "name": "AuctionPeriodExpired"
    },
    {
      "code": 7036,
      "name": "AuctionPeriodNotExpired"
    },
    {
      "code": 7044,
      "name": "ExecutorTokenMismatch"
    },
    {
      "code": 7050,
      "name": "AuctionNotCompleted"
    },
    {
      "code": 7054,
      "name": "CarpingNotAllowed"
    },
    {
      "code": 7056,
      "name": "AuctionNotSettled"
    },
    {
      "code": 7058,
      "name": "ExecutorNotPreparedBy"
    },
    {
      "code": 7280,
      "name": "CannotCloseAuctionYet"
    },
    {
      "code": 7282,
      "name": "AuctionHistoryNotFull"
    },
    {
      "code": 7284,
      "name": "AuctionHistoryFull"
    }
  ]
};

export const IDL: MatchingEngine = {
  "version": "0.0.0",
  "name": "matching_engine",
  "instructions": [
    {
      "name": "initialize",
      "docs": [
        "This instruction is be used to generate the program's `custodian` and `auction_config`",
        "configs. It also reates the `owner` and `fee_recipient` accounts. Finally, it sets the upgrade",
        "authority to the `upgrade_manager_authority`. Upgrades are managed by the `upgrade_manager_program`.",
        "# Arguments",
        "",
        "* `ctx`            - `Initialize` context.",
        "* `auction_params` - The auction parameters, see `auction_config.rs`."
      ],
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true,
          "docs": [
            "Owner of the program, who presumably deployed this program."
          ]
        },
        {
          "name": "custodian",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "Custodian account, which saves program data useful for other",
            "instructions."
          ]
        },
        {
          "name": "auctionConfig",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "ownerAssistant",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "TODO: do we prevent the owner from being the owner assistant?"
          ]
        },
        {
          "name": "feeRecipient",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "feeRecipientToken",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "cctpMintRecipient",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "usdc",
          "accounts": [
            {
              "name": "mint",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "programData",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "We use the program data to make sure this owner is the upgrade authority (the true owner,",
            "who deployed this program)."
          ]
        },
        {
          "name": "upgradeManagerAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "upgradeManagerProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "bpfLoaderUpgradeableProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "auctionParams",
          "type": {
            "defined": "AuctionParameters"
          }
        }
      ]
    },
    {
      "name": "setPause",
      "docs": [
        "This instruction is used to pause or unpause further processing of new auctions. Only the `owner`",
        "or `owner_assistant` can pause the program.",
        "# Arguments",
        "",
        "* `ctx`   - `SetPause` context.",
        "* `pause` - Boolean indicating whether to pause the program."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "ownerOrAssistant",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "isMut": true,
              "isSigner": false
            }
          ]
        }
      ],
      "args": [
        {
          "name": "pause",
          "type": "bool"
        }
      ]
    },
    {
      "name": "addCctpRouterEndpoint",
      "docs": [
        "This instruction is used to add a new Token Router endpoint from a foreign chain. The endpoint",
        "must be CCTP compatible. This instruction can only be called by the `owner` or `owner_assistant`.",
        "# Arguments",
        "",
        "* `ctx`  - `AddCctpRouterEndpoint` context.",
        "* `args` - The `AddCctpRouterEndpointArgs`, see `admin.rs`."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "admin",
          "accounts": [
            {
              "name": "ownerOrAssistant",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "routerEndpoint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "localCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "usdc",
          "accounts": [
            {
              "name": "mint",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "remoteTokenMessenger",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "Messenger Minter program)."
          ]
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "AddCctpRouterEndpointArgs"
          }
        }
      ]
    },
    {
      "name": "addLocalRouterEndpoint",
      "docs": [
        "This instruction is used to add a new Local Router endpoint. Local means that the",
        "Token Router program exists on Solana. This instruction can only be called by the",
        "`owner` or `owner_assistant`.",
        "# Arguments",
        "",
        "* `ctx` - `AddLocalRouterEndpoint` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "admin",
          "accounts": [
            {
              "name": "ownerOrAssistant",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "routerEndpoint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "local",
          "accounts": [
            {
              "name": "tokenRouterProgram",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "emitter (router endpoint) address."
              ]
            },
            {
              "name": "tokenRouterEmitter",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "tokenRouterMintRecipient",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "disableRouterEndpoint",
      "docs": [
        "This instruction is used to disable a router endpoint. This instruction does not close the",
        "account, it only sets the `protocol` to `None` and clears the `address` and `mint_recipient`.",
        "This instruction can only be called by the `owner`.",
        "# Arguments",
        "",
        "* `ctx` - `DisableRouterEndpoint` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "routerEndpoint",
          "accounts": [
            {
              "name": "endpoint",
              "isMut": true,
              "isSigner": false
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "updateCctpRouterEndpoint",
      "docs": [
        "This instruction is used to update a CCTP router endpoint. It allows the caller to change",
        "the `address`, `mint_recipient`, and `domain`. This instruction can only be called by the",
        "`owner`.",
        "# Arguments",
        "",
        "* `ctx`  - `UpdateCctpRouterEndpoint` context.",
        "* `args` - The `AddCctpRouterEndpointArgs`, see `admin.rs`."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "routerEndpoint",
          "accounts": [
            {
              "name": "endpoint",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "remoteTokenMessenger",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "Messenger Minter program)."
          ]
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "AddCctpRouterEndpointArgs"
          }
        }
      ]
    },
    {
      "name": "updateLocalRouterEndpoint",
      "docs": [
        "This instruction is used to update a Local router endpoint. It allows the caller to change",
        "the `address` and `mint_recipient`. This instruction can only be called by the `owner`.",
        "# Arguments",
        "",
        "* `ctx` - `UpdateLocalRouterEndpoint` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "routerEndpoint",
          "accounts": [
            {
              "name": "endpoint",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "local",
          "accounts": [
            {
              "name": "tokenRouterProgram",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "emitter (router endpoint) address."
              ]
            },
            {
              "name": "tokenRouterEmitter",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "tokenRouterMintRecipient",
              "isMut": false,
              "isSigner": false
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "submitOwnershipTransferRequest",
      "docs": [
        "This instruction sets the `pending_owner` field in the `Custodian` account. This instruction",
        "can only be called by the `owner`. The `pending_owner` address must be valid, meaning it",
        "cannot be the zero address or the current owner.",
        "# Arguments",
        "",
        "* `ctx` - `SubmitOwnershipTransferRequest` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "newOwner",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "New Owner.",
            ""
          ]
        }
      ],
      "args": []
    },
    {
      "name": "confirmOwnershipTransferRequest",
      "docs": [
        "This instruction confirms the ownership transfer request and sets the new `owner` in the",
        "`Custodian` account. This instruction can only be called by the `pending_owner`. The",
        "`pending_owner` must be the same as the `pending_owner` in the `Custodian` account.",
        "# Arguments",
        "",
        "* `ctx` - `ConfirmOwnershipTransferRequest` context."
      ],
      "accounts": [
        {
          "name": "pendingOwner",
          "isMut": false,
          "isSigner": true,
          "docs": [
            "Must be the pending owner of the program set in the [`OwnerConfig`]",
            "account."
          ]
        },
        {
          "name": "custodian",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "cancelOwnershipTransferRequest",
      "docs": [
        "This instruction cancels an ownership transfer request by resetting the `pending_owner` field",
        "in the `Custodian` account. This instruction can only be called by the `owner`.",
        "# Arguments",
        "",
        "* `ctx` - `CancelOwnershipTransferRequest` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "isMut": true,
              "isSigner": false
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "proposeAuctionParameters",
      "docs": [
        "This instruction is used to propose new auction parameters. A proposal cannot be enacted",
        "until one epoch has passed. This instruction can only be called by the `owner` or",
        "`owner_assistant`.",
        "# Arguments",
        "",
        "* `ctx`    - `ProposeAuctionParameters` context.",
        "* `params` - The new `AuctionParameters`, see `auction_config.rs`."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "admin",
          "accounts": [
            {
              "name": "ownerOrAssistant",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "proposal",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "epochSchedule",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": "AuctionParameters"
          }
        }
      ]
    },
    {
      "name": "updateAuctionParameters",
      "docs": [
        "This instruction is used to enact an existing auction update proposal. It can only be",
        "executed after the `slot_enact_delay` has passed. This instruction can only be called by",
        "the `owner` of the proposal.",
        "# Arguments",
        "",
        "* `ctx` - `UpdateAuctionParameters` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "proposal",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "auctionConfig",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "closeProposal",
      "docs": [
        "This instruction is used to close an existing proposal by closing the propsal account. This",
        "instruction can only be called by the `owner`.",
        "# Arguments",
        "",
        "* `ctx` - `CloseProposal` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "ownerOrAssistant",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "proposedBy",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "proposal",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "updateOwnerAssistant",
      "docs": [
        "This instruction is used to update the `owner_assistant` field in the `Custodian` account. This",
        "instruction can only be called by the `owner`.",
        "# Arguments",
        "",
        "* `ctx` - `UpdateOwnerAssistant` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "newOwnerAssistant",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "New Assistant.",
            ""
          ]
        }
      ],
      "args": []
    },
    {
      "name": "updateFeeRecipient",
      "docs": [
        "This instruction is used to update the `fee_recipient` field in the `Custodian` account. This",
        "instruction can only be called by the `owner`.",
        "# Arguments",
        "",
        "* `ctx` - `UpdateFeeRecipient` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "ownerOrAssistant",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "newFeeRecipientToken",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "newFeeRecipient",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "New Fee Recipient.",
            ""
          ]
        }
      ],
      "args": []
    },
    {
      "name": "migrate",
      "docs": [
        "This instruction is used for executing logic during an upgrade. This instruction can only be",
        "called by the `upgrade_manager_program`.",
        "# Arguments",
        "",
        "* `ctx` - `Migrate` context."
      ],
      "accounts": [
        {
          "name": "admin",
          "accounts": [
            {
              "name": "owner",
              "isMut": false,
              "isSigner": true
            },
            {
              "name": "custodian",
              "accounts": [
                {
                  "name": "custodian",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "placeInitialOfferCctp",
      "docs": [
        "This instruction is used to create a new auction given a valid `FastMarketOrder` vaa. This",
        "instruction will record information about the auction and transfer funds from the payer to",
        "an auction-specific token custody account. This instruction can be called by anyone.",
        "# Arguments",
        "",
        "* `ctx`       - `PlaceInitialOfferCctp` context.",
        "* `offer_price` - The fee that the caller is willing to accept in order for fufilling the fast",
        "order. This fee is paid in USDC."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "transferAuthority",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "The auction participant needs to set approval to this PDA.",
            ""
          ]
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "auctionConfig",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "fastOrderPath",
          "accounts": [
            {
              "name": "fastVaa",
              "accounts": [
                {
                  "name": "vaa",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "path",
              "accounts": [
                {
                  "name": "fromEndpoint",
                  "accounts": [
                    {
                      "name": "endpoint",
                      "isMut": false,
                      "isSigner": false
                    }
                  ]
                },
                {
                  "name": "toEndpoint",
                  "accounts": [
                    {
                      "name": "endpoint",
                      "isMut": false,
                      "isSigner": false
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "name": "auction",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "This account should only be created once, and should never be changed to",
            "init_if_needed. Otherwise someone can game an existing auction."
          ]
        },
        {
          "name": "offerToken",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "auctionCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "usdc",
          "accounts": [
            {
              "name": "mint",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "offerPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "improveOffer",
      "docs": [
        "This instruction is used to improve an existing auction offer. The `offer_price` must be",
        "greater than the current `offer_price` in the auction. This instruction will revert if the",
        "`offer_price` is less than the current `offer_price`. This instruction can be called by anyone.",
        "# Arguments",
        "",
        "* `ctx`       - `ImproveOffer` context.",
        "* `offer_price` - The fee that the caller is willing to accept in order for fufilling the fast",
        "order. This fee is paid in USDC."
      ],
      "accounts": [
        {
          "name": "transferAuthority",
          "isMut": false,
          "isSigner": false,
          "docs": [
            "The auction participant needs to set approval to this PDA.",
            ""
          ]
        },
        {
          "name": "activeAuction",
          "accounts": [
            {
              "name": "auction",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "custodyToken",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "config",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "bestOfferToken",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "offerToken",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "offerPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeFastOrderCctp",
      "docs": [
        "This instruction is used to execute the fast order after the auction period has ended.",
        "It should be executed before the `grace_period` has ended, otherwise the `highest_bidder`",
        "will incur a penalty. Once executed, a CCTP transfer will be sent to the recipient encoded",
        "in the `FastMarketOrder` VAA on the target chain.",
        "# Arguments",
        "",
        "* `ctx` - `ExecuteFastOrderCctp` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "payerSequence",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "coreMessage",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "cctpMessage",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "executeOrder",
          "accounts": [
            {
              "name": "fastVaa",
              "accounts": [
                {
                  "name": "vaa",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "activeAuction",
              "accounts": [
                {
                  "name": "auction",
                  "isMut": true,
                  "isSigner": false
                },
                {
                  "name": "custodyToken",
                  "isMut": true,
                  "isSigner": false
                },
                {
                  "name": "config",
                  "isMut": false,
                  "isSigner": false
                },
                {
                  "name": "bestOfferToken",
                  "isMut": true,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "executorToken",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "initialOfferToken",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "toRouterEndpoint",
          "accounts": [
            {
              "name": "endpoint",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "wormhole",
          "accounts": [
            {
              "name": "config",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "emitterSequence",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "feeCollector",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "coreBridgeProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "cctp",
          "accounts": [
            {
              "name": "mint",
              "isMut": true,
              "isSigner": false,
              "docs": [
                "Circle-supported mint.",
                "",
                "Token Messenger Minter program's local token account."
              ]
            },
            {
              "name": "tokenMessengerMinterSenderAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "messageTransmitterConfig",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "tokenMessenger",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "remoteTokenMessenger",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Messenger Minter program)."
              ]
            },
            {
              "name": "tokenMinter",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "CHECK Seeds must be \\[\"token_minter\"\\] (CCTP Token Messenger Minter program)."
              ]
            },
            {
              "name": "localToken",
              "isMut": true,
              "isSigner": false,
              "docs": [
                "Local token account, which this program uses to validate the `mint` used to burn.",
                ""
              ]
            },
            {
              "name": "tokenMessengerMinterEventAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "tokenMessengerMinterProgram",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "messageTransmitterProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sysvars",
          "accounts": [
            {
              "name": "clock",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the clock sysvar based on its legacy implementation.",
                ""
              ]
            },
            {
              "name": "rent",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the rent sysvar based on its legacy implementation.",
                ""
              ]
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "executeFastOrderLocal",
      "docs": [
        "This instruction is used to execute the fast order after the auction period has ended.",
        "It should be executed before the `grace_period` has ended, otherwise the `highest_bidder`",
        "will incur a penalty. Once executed, a `fast_fill` VAA will be emitted.",
        "# Arguments",
        "",
        "* `ctx` - `ExecuteFastOrderLocal` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "payerSequence",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "coreMessage",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "executeOrder",
          "accounts": [
            {
              "name": "fastVaa",
              "accounts": [
                {
                  "name": "vaa",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "activeAuction",
              "accounts": [
                {
                  "name": "auction",
                  "isMut": true,
                  "isSigner": false
                },
                {
                  "name": "custodyToken",
                  "isMut": true,
                  "isSigner": false
                },
                {
                  "name": "config",
                  "isMut": false,
                  "isSigner": false
                },
                {
                  "name": "bestOfferToken",
                  "isMut": true,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "executorToken",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "initialOfferToken",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "toRouterEndpoint",
          "accounts": [
            {
              "name": "endpoint",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "wormhole",
          "accounts": [
            {
              "name": "config",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "emitterSequence",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "feeCollector",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "coreBridgeProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "localCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sysvars",
          "accounts": [
            {
              "name": "clock",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the clock sysvar based on its legacy implementation.",
                ""
              ]
            },
            {
              "name": "rent",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the rent sysvar based on its legacy implementation.",
                ""
              ]
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "completeFastFill",
      "docs": [
        "This instruction is used to complete the fast fill after the `fast_fill` VAA has been",
        "emitted. The Token Router program on Solana will invoke this instruction to complete the",
        "fast fill. Tokens will be deposited into the local endpoint's custody account.",
        "# Arguments",
        "",
        "* `ctx` - `CompleteFastFill` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "fastFillVaa",
          "accounts": [
            {
              "name": "vaa",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "redeemedFastFill",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenRouterEmitter",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "tokenRouterCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "path",
          "accounts": [
            {
              "name": "fromEndpoint",
              "accounts": [
                {
                  "name": "endpoint",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "toEndpoint",
              "accounts": [
                {
                  "name": "endpoint",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            }
          ]
        },
        {
          "name": "localCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "prepareOrderResponseCctp",
      "docs": [
        "This instruction is used to prepare the order response for a CCTP transfer. This instruction",
        "will redeem the finalized transfer associated with a particular auction, and deposit the funds",
        "to the `prepared_custody_token` account that is created during execution. This instruction",
        "will create a `PreparedOrderResponse` account that will be used to settle the auction.",
        "# Arguments",
        "",
        "* `ctx` - `PrepareOrderResponseCctp` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "fastVaa",
          "accounts": [
            {
              "name": "vaa",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "finalizedVaa",
          "accounts": [
            {
              "name": "vaa",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "preparedOrderResponse",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "preparedCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "usdc",
          "accounts": [
            {
              "name": "mint",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "cctp",
          "accounts": [
            {
              "name": "mintRecipient",
              "accounts": [
                {
                  "name": "mintRecipient",
                  "isMut": true,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "messageTransmitterAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "messageTransmitterConfig",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "usedNonces",
              "isMut": true,
              "isSigner": false,
              "docs": [
                "first_nonce.to_string()\\] (CCTP Message Transmitter program)."
              ]
            },
            {
              "name": "messageTransmitterEventAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "tokenMessenger",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "remoteTokenMessenger",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Messenger Minter program)."
              ]
            },
            {
              "name": "tokenMinter",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "localToken",
              "isMut": true,
              "isSigner": false,
              "docs": [
                "Token Messenger Minter's Local Token account. This program uses the mint of this account to",
                "validate the `mint_recipient` token account's mint.",
                ""
              ]
            },
            {
              "name": "tokenPair",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Token Messenger Minter program)."
              ]
            },
            {
              "name": "tokenMessengerMinterCustodyToken",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "tokenMessengerMinterEventAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "tokenMessengerMinterProgram",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "messageTransmitterProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "CctpMessageArgs"
          }
        }
      ]
    },
    {
      "name": "settleAuctionComplete",
      "docs": [
        "This instruction is used to settle the acution after the `FastMarketOrder` has been executed,",
        "and the `PreparedOrderResponse` has been created. This instruction will settle the auction",
        "by transferring the funds from the `prepared_custody_token` account to the `highest_bidder`",
        "account.",
        "# Arguments",
        "",
        "* `ctx` - `SettleAuctionComplete` context."
      ],
      "accounts": [
        {
          "name": "executor",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "we will always reward the owner of the executor token account with the lamports from the",
            "prepared order response and its custody token account when we close these accounts. This",
            "means we disregard the `prepared_by` field in the prepared order response."
          ]
        },
        {
          "name": "executorToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bestOfferToken",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "Destination token account, which the redeemer may not own. But because the redeemer is a",
            "signer and is the one encoded in the Deposit Fill message, he may have the tokens be sent",
            "to any account he chooses (this one).",
            ""
          ]
        },
        {
          "name": "preparedOrderResponse",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "preparedCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "auction",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "settleAuctionNoneCctp",
      "docs": [
        "This instruction is used to route funds to the `recipient` for a `FastMarketOrder` with",
        "no corresponding auction on Solana. This instruction can be called by anyone, but the",
        "`base_fee` associated with relaying a finalized VAA will be paid to the `fee_recipient`.",
        "This instruction generates a `Fill` message.",
        "# Arguments",
        "",
        "* `ctx` - `SettleAuctionNoneCctp` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "payerSequence",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "coreMessage",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "cctpMessage",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "feeRecipientToken",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "Destination token account, which the redeemer may not own. But because the redeemer is a",
            "signer and is the one encoded in the Deposit Fill message, he may have the tokens be sent",
            "to any account he chooses (this one).",
            ""
          ]
        },
        {
          "name": "prepared",
          "accounts": [
            {
              "name": "by",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "orderResponse",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "custodyToken",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "fastOrderPath",
          "accounts": [
            {
              "name": "fastVaa",
              "accounts": [
                {
                  "name": "vaa",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "path",
              "accounts": [
                {
                  "name": "fromEndpoint",
                  "accounts": [
                    {
                      "name": "endpoint",
                      "isMut": false,
                      "isSigner": false
                    }
                  ]
                },
                {
                  "name": "toEndpoint",
                  "accounts": [
                    {
                      "name": "endpoint",
                      "isMut": false,
                      "isSigner": false
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "name": "auction",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "There should be no account data here because an auction was never created."
          ]
        },
        {
          "name": "wormhole",
          "accounts": [
            {
              "name": "config",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "emitterSequence",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "feeCollector",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "coreBridgeProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "cctp",
          "accounts": [
            {
              "name": "mint",
              "isMut": true,
              "isSigner": false,
              "docs": [
                "Circle-supported mint.",
                "",
                "Token Messenger Minter program's local token account."
              ]
            },
            {
              "name": "tokenMessengerMinterSenderAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "messageTransmitterConfig",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "tokenMessenger",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "remoteTokenMessenger",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Messenger Minter program)."
              ]
            },
            {
              "name": "tokenMinter",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "CHECK Seeds must be \\[\"token_minter\"\\] (CCTP Token Messenger Minter program)."
              ]
            },
            {
              "name": "localToken",
              "isMut": true,
              "isSigner": false,
              "docs": [
                "Local token account, which this program uses to validate the `mint` used to burn.",
                ""
              ]
            },
            {
              "name": "tokenMessengerMinterEventAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "tokenMessengerMinterProgram",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "messageTransmitterProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sysvars",
          "accounts": [
            {
              "name": "clock",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the clock sysvar based on its legacy implementation.",
                ""
              ]
            },
            {
              "name": "rent",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the rent sysvar based on its legacy implementation.",
                ""
              ]
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "settleAuctionNoneLocal",
      "docs": [
        "This instruction is used to settle a `FastMarketOrder` with no corresponding auction. The funds",
        "are routed to the `recipient` on the target chain by executing a CCTP transfer and sending a `Fill`",
        "message. This instruction can be called by anyone, but the `base_fee` associated with relaying a",
        "finalized VAA will be paid to the `fee_recipient`.",
        "# Arguments",
        "",
        "* `ctx` - `SettleAuctionNoneLocal` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "payerSequence",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "coreMessage",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "feeRecipientToken",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "Destination token account, which the redeemer may not own. But because the redeemer is a",
            "signer and is the one encoded in the Deposit Fill message, he may have the tokens be sent",
            "to any account he chooses (this one).",
            ""
          ]
        },
        {
          "name": "prepared",
          "accounts": [
            {
              "name": "by",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "orderResponse",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "custodyToken",
              "isMut": true,
              "isSigner": false
            }
          ]
        },
        {
          "name": "fastOrderPath",
          "accounts": [
            {
              "name": "fastVaa",
              "accounts": [
                {
                  "name": "vaa",
                  "isMut": false,
                  "isSigner": false
                }
              ]
            },
            {
              "name": "path",
              "accounts": [
                {
                  "name": "fromEndpoint",
                  "accounts": [
                    {
                      "name": "endpoint",
                      "isMut": false,
                      "isSigner": false
                    }
                  ]
                },
                {
                  "name": "toEndpoint",
                  "accounts": [
                    {
                      "name": "endpoint",
                      "isMut": false,
                      "isSigner": false
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "name": "auction",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "There should be no account data here because an auction was never created."
          ]
        },
        {
          "name": "wormhole",
          "accounts": [
            {
              "name": "config",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "emitterSequence",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "feeCollector",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "coreBridgeProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "localCustodyToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sysvars",
          "accounts": [
            {
              "name": "clock",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the clock sysvar based on its legacy implementation.",
                ""
              ]
            },
            {
              "name": "rent",
              "isMut": false,
              "isSigner": false,
              "docs": [
                "Wormhole Core Bridge needs the rent sysvar based on its legacy implementation.",
                ""
              ]
            }
          ]
        }
      ],
      "args": []
    },
    {
      "name": "createFirstAuctionHistory",
      "docs": [
        "This instruction is used to create the first `AuctionHistory` account, whose PDA is derived",
        "using ID == 0.",
        "# Arguments",
        "",
        "* `ctx` - `CreateFirstAuctionHistory` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "firstHistory",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "createNewAuctionHistory",
      "docs": [
        "This instruction is used to create a new `AuctionHistory` account. The PDA is derived using",
        "its ID. A new history account can be created only when the current one is full (number of",
        "entries equals the hard-coded max entries).",
        "# Arguments",
        "",
        "* `ctx` - `CreateNewAuctionHistory` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "currentHistory",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "newHistory",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "addAuctionHistoryEntry",
      "docs": [
        "This instruction is used to add a new entry to the `AuctionHistory` account if there is an",
        "`Auction` with some info. Regardless of whether there is info in this account, the",
        "instruction finishes its operation by closing this auction account. If the history account",
        "is full, this instruction will revert and `create_new_auction_history`` will have to be",
        "called to initialize another history account.",
        "",
        "This mechanism is important for auction participants. The initial offer participant will",
        "pay lamports to create the `Auction` account. This instruction allows him to reclaim some",
        "lamports by closing that account. And the protocol's fee recipient will be able to claim",
        "lamports by closing the empty `Auction` account it creates when he calls any of the",
        "`settle_auction_none_*` instructions.",
        "# Arguments",
        "",
        "* `ctx` - `AddAuctionHistoryEntry` context."
      ],
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "custodian",
          "accounts": [
            {
              "name": "custodian",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "history",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "because we will be writing to this account without using Anchor's [AccountsExit]."
          ]
        },
        {
          "name": "auction",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "beneficiary",
          "isMut": true,
          "isSigner": false,
          "docs": [
            "was no auction) or the owner of the initial offer token account."
          ]
        },
        {
          "name": "beneficiaryToken",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "auctionConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "docs": [
              "Monotonically increasing identifier for auction configs."
            ],
            "type": "u32"
          },
          {
            "name": "parameters",
            "docs": [
              "Auction parameters, which are validated by [crate::utils::auction::require_valid_parameters]."
            ],
            "type": {
              "defined": "AuctionParameters"
            }
          }
        ]
      }
    },
    {
      "name": "auctionHistory",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "header",
            "type": {
              "defined": "AuctionHistoryHeader"
            }
          },
          {
            "name": "data",
            "type": {
              "vec": {
                "defined": "AuctionEntry"
              }
            }
          }
        ]
      }
    },
    {
      "name": "auction",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaaHash",
            "docs": [
              "VAA hash of the auction."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "vaaTimestamp",
            "docs": [
              "Timestamp of the fast market order VAA."
            ],
            "type": "u32"
          },
          {
            "name": "targetProtocol",
            "docs": [
              "Transfer protocol used to move assets."
            ],
            "type": {
              "defined": "MessageProtocol"
            }
          },
          {
            "name": "status",
            "docs": [
              "Auction status."
            ],
            "type": {
              "defined": "AuctionStatus"
            }
          },
          {
            "name": "info",
            "docs": [
              "Optional auction info. This field will be `None`` if there is no auction."
            ],
            "type": {
              "option": {
                "defined": "AuctionInfo"
              }
            }
          }
        ]
      }
    },
    {
      "name": "custodian",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "Program's owner."
            ],
            "type": "publicKey"
          },
          {
            "name": "pendingOwner",
            "type": {
              "option": "publicKey"
            }
          },
          {
            "name": "paused",
            "docs": [
              "Boolean indicating whether inbound auctions are paused."
            ],
            "type": "bool"
          },
          {
            "name": "pausedSetBy",
            "type": "publicKey"
          },
          {
            "name": "ownerAssistant",
            "docs": [
              "Program's assistant."
            ],
            "type": "publicKey"
          },
          {
            "name": "feeRecipientToken",
            "type": "publicKey"
          },
          {
            "name": "auctionConfigId",
            "type": "u32"
          },
          {
            "name": "nextProposalId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "payerSequence",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "value",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "preparedOrderResponse",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "fastVaaHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "preparedBy",
            "type": "publicKey"
          },
          {
            "name": "sourceChain",
            "type": "u16"
          },
          {
            "name": "baseFee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "proposal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "action",
            "type": {
              "defined": "ProposalAction"
            }
          },
          {
            "name": "by",
            "type": "publicKey"
          },
          {
            "name": "owner",
            "type": "publicKey"
          },
          {
            "name": "slotProposedAt",
            "type": "u64"
          },
          {
            "name": "slotEnactDelay",
            "type": "u64"
          },
          {
            "name": "slotEnactedAt",
            "type": {
              "option": "u64"
            }
          }
        ]
      }
    },
    {
      "name": "redeemedFastFill",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaaHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "sequence",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "routerEndpoint",
      "docs": [
        "Foreign emitter account data."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "chain",
            "docs": [
              "Emitter chain. Cannot equal `1` (Solana's Chain ID)."
            ],
            "type": "u16"
          },
          {
            "name": "address",
            "docs": [
              "Emitter address. Cannot be zero address."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "mintRecipient",
            "docs": [
              "Future-proof field in case another network has token accounts to send assets to instead of",
              "sending to the address directly."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "protocol",
            "docs": [
              "Specific message protocol used to move assets."
            ],
            "type": {
              "defined": "MessageProtocol"
            }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "CctpMessageArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "encodedCctpMessage",
            "type": "bytes"
          },
          {
            "name": "cctpAttestation",
            "type": "bytes"
          }
        ]
      }
    },
    {
      "name": "AuctionParameters",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "userPenaltyRewardBps",
            "type": "u32"
          },
          {
            "name": "initialPenaltyBps",
            "type": "u32"
          },
          {
            "name": "duration",
            "type": "u16"
          },
          {
            "name": "gracePeriod",
            "docs": [
              "* The grace period of the auction in slots. This is the number of slots the highest bidder\n     * has to execute the fast order before incurring a penalty. About 15 seconds on Avalanche.\n     * This value INCLUDES the `_auctionDuration`."
            ],
            "type": "u16"
          },
          {
            "name": "penaltyPeriod",
            "type": "u16"
          },
          {
            "name": "minOfferDeltaBps",
            "type": "u32"
          },
          {
            "name": "securityDepositBase",
            "docs": [
              "The base security deposit, which will the the additional amount an auction participant must",
              "deposit to participate in an auction."
            ],
            "type": "u64"
          },
          {
            "name": "securityDepositBps",
            "docs": [
              "Additional security deposit based on the notional of the order amount."
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "AuctionEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaaHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "vaaTimestamp",
            "type": "u32"
          },
          {
            "name": "info",
            "type": {
              "defined": "AuctionInfo"
            }
          }
        ]
      }
    },
    {
      "name": "AuctionHistoryHeader",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "minTimestamp",
            "type": {
              "option": "u32"
            }
          },
          {
            "name": "maxTimestamp",
            "type": {
              "option": "u32"
            }
          }
        ]
      }
    },
    {
      "name": "AuctionHistoryInternal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "header",
            "type": {
              "defined": "AuctionHistoryHeader"
            }
          },
          {
            "name": "numEntries",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "AuctionDestinationAssetInfo",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "custodyTokenBump",
            "type": "u8"
          },
          {
            "name": "amountOut",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "AuctionInfo",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "configId",
            "type": "u32"
          },
          {
            "name": "custodyTokenBump",
            "type": "u8"
          },
          {
            "name": "vaaSequence",
            "docs": [
              "Sequence of the fast market order VAA."
            ],
            "type": "u64"
          },
          {
            "name": "sourceChain",
            "docs": [
              "The chain where the transfer is initiated."
            ],
            "type": "u16"
          },
          {
            "name": "bestOfferToken",
            "docs": [
              "The highest bidder of the auction."
            ],
            "type": "publicKey"
          },
          {
            "name": "initialOfferToken",
            "docs": [
              "The initial bidder of the auction."
            ],
            "type": "publicKey"
          },
          {
            "name": "startSlot",
            "docs": [
              "The slot when the auction started."
            ],
            "type": "u64"
          },
          {
            "name": "amountIn",
            "docs": [
              "The amount reflecting the amount of assets transferred into the matching engine. This plus",
              "and the security deposit are used to participate in the auction."
            ],
            "type": "u64"
          },
          {
            "name": "securityDeposit",
            "docs": [
              "The additional deposit made by the highest bidder.",
              "",
              "NOTE: This may not be the same denomination as the `amount_in`."
            ],
            "type": "u64"
          },
          {
            "name": "offerPrice",
            "docs": [
              "The offer price of the auction."
            ],
            "type": "u64"
          },
          {
            "name": "destinationAssetInfo",
            "docs": [
              "If the destination asset is not equal to the asset used for auctions, this will be some",
              "value specifying its custody token bump and amount out.",
              "",
              "NOTE: Because this is an option, the `AuctionDestinationAssetInfo` having some definition while this",
              "field is None will not impact future serialization because the option's serialized value is",
              "zero. Only when there will be other assets will this struct's members have to be carefully",
              "considered."
            ],
            "type": {
              "option": {
                "defined": "AuctionDestinationAssetInfo"
              }
            }
          }
        ]
      }
    },
    {
      "name": "AddCctpRouterEndpointArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "chain",
            "type": "u16"
          },
          {
            "name": "cctpDomain",
            "type": "u32"
          },
          {
            "name": "address",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "mintRecipient",
            "type": {
              "option": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "AuctionStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "NotStarted"
          },
          {
            "name": "Active"
          },
          {
            "name": "Completed",
            "fields": [
              {
                "name": "slot",
                "type": "u64"
              },
              {
                "name": "executePenalty",
                "type": {
                  "option": "u64"
                }
              }
            ]
          },
          {
            "name": "Settled",
            "fields": [
              {
                "name": "baseFee",
                "type": "u64"
              },
              {
                "name": "totalPenalty",
                "type": {
                  "option": "u64"
                }
              }
            ]
          }
        ]
      }
    },
    {
      "name": "ProposalAction",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "None"
          },
          {
            "name": "UpdateAuctionParameters",
            "fields": [
              {
                "name": "id",
                "type": "u32"
              },
              {
                "name": "parameters",
                "type": {
                  "defined": "AuctionParameters"
                }
              }
            ]
          }
        ]
      }
    },
    {
      "name": "MessageProtocol",
      "docs": [
        "Protocol used to transfer assets."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "None"
          },
          {
            "name": "Local",
            "fields": [
              {
                "name": "programId",
                "type": "publicKey"
              }
            ]
          },
          {
            "name": "Cctp",
            "fields": [
              {
                "name": "domain",
                "docs": [
                  "CCTP domain, which is how CCTP registers identifies foreign networks."
                ],
                "type": "u32"
              }
            ]
          }
        ]
      }
    }
  ],
  "events": [
    {
      "name": "AuctionSettled",
      "fields": [
        {
          "name": "auction",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "bestOfferToken",
          "type": {
            "option": "publicKey"
          },
          "index": false
        },
        {
          "name": "tokenBalanceAfter",
          "type": "u64",
          "index": false
        }
      ]
    },
    {
      "name": "AuctionUpdated",
      "fields": [
        {
          "name": "configId",
          "type": "u32",
          "index": false
        },
        {
          "name": "auction",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "vaa",
          "type": {
            "option": "publicKey"
          },
          "index": false
        },
        {
          "name": "sourceChain",
          "type": "u16",
          "index": false
        },
        {
          "name": "targetProtocol",
          "type": {
            "defined": "MessageProtocol"
          },
          "index": false
        },
        {
          "name": "endSlot",
          "type": "u64",
          "index": false
        },
        {
          "name": "bestOfferToken",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "tokenBalanceBefore",
          "type": "u64",
          "index": false
        },
        {
          "name": "amountIn",
          "type": "u64",
          "index": false
        },
        {
          "name": "totalDeposit",
          "type": "u64",
          "index": false
        },
        {
          "name": "maxOfferPriceAllowed",
          "type": "u64",
          "index": false
        }
      ]
    },
    {
      "name": "Enacted",
      "fields": [
        {
          "name": "action",
          "type": {
            "defined": "ProposalAction"
          },
          "index": false
        }
      ]
    },
    {
      "name": "OrderExecuted",
      "fields": [
        {
          "name": "auction",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "vaa",
          "type": "publicKey",
          "index": false
        },
        {
          "name": "targetProtocol",
          "type": {
            "defined": "MessageProtocol"
          },
          "index": false
        }
      ]
    },
    {
      "name": "Proposed",
      "fields": [
        {
          "name": "action",
          "type": {
            "defined": "ProposalAction"
          },
          "index": false
        }
      ]
    }
  ],
  "errors": [
    {
      "code": 6002,
      "name": "OwnerOnly"
    },
    {
      "code": 6004,
      "name": "OwnerOrAssistantOnly"
    },
    {
      "code": 6016,
      "name": "U64Overflow"
    },
    {
      "code": 6018,
      "name": "U32Overflow"
    },
    {
      "code": 6032,
      "name": "SameEndpoint"
    },
    {
      "code": 6034,
      "name": "InvalidEndpoint"
    },
    {
      "code": 6048,
      "name": "InvalidVaa"
    },
    {
      "code": 6066,
      "name": "InvalidDeposit"
    },
    {
      "code": 6068,
      "name": "InvalidDepositMessage"
    },
    {
      "code": 6070,
      "name": "InvalidPayloadId"
    },
    {
      "code": 6072,
      "name": "InvalidDepositPayloadId"
    },
    {
      "code": 6074,
      "name": "NotFastMarketOrder"
    },
    {
      "code": 6076,
      "name": "VaaMismatch"
    },
    {
      "code": 6096,
      "name": "InvalidSourceRouter"
    },
    {
      "code": 6098,
      "name": "InvalidTargetRouter"
    },
    {
      "code": 6100,
      "name": "EndpointDisabled"
    },
    {
      "code": 6102,
      "name": "InvalidCctpEndpoint"
    },
    {
      "code": 6128,
      "name": "Paused"
    },
    {
      "code": 6256,
      "name": "AssistantZeroPubkey"
    },
    {
      "code": 6257,
      "name": "FeeRecipientZeroPubkey"
    },
    {
      "code": 6258,
      "name": "ImmutableProgram"
    },
    {
      "code": 6260,
      "name": "ZeroDuration"
    },
    {
      "code": 6262,
      "name": "ZeroGracePeriod"
    },
    {
      "code": 6263,
      "name": "ZeroPenaltyPeriod"
    },
    {
      "code": 6264,
      "name": "UserPenaltyRewardBpsTooLarge",
      "msg": "Value exceeds 1000000"
    },
    {
      "code": 6266,
      "name": "InitialPenaltyBpsTooLarge",
      "msg": "Value exceeds 1000000"
    },
    {
      "code": 6268,
      "name": "MinOfferDeltaBpsTooLarge",
      "msg": "Value exceeds 1000000"
    },
    {
      "code": 6270,
      "name": "ZeroSecurityDepositBase"
    },
    {
      "code": 6271,
      "name": "SecurityDepositBpsTooLarge",
      "msg": "Value exceeds 1000000"
    },
    {
      "code": 6514,
      "name": "InvalidNewOwner"
    },
    {
      "code": 6516,
      "name": "AlreadyOwner"
    },
    {
      "code": 6518,
      "name": "NoTransferOwnershipRequest"
    },
    {
      "code": 6520,
      "name": "NotPendingOwner"
    },
    {
      "code": 6524,
      "name": "InvalidChain"
    },
    {
      "code": 6576,
      "name": "ChainNotAllowed"
    },
    {
      "code": 6578,
      "name": "InvalidMintRecipient"
    },
    {
      "code": 6768,
      "name": "ProposalAlreadyEnacted"
    },
    {
      "code": 6770,
      "name": "ProposalDelayNotExpired"
    },
    {
      "code": 6772,
      "name": "InvalidProposal"
    },
    {
      "code": 6832,
      "name": "AuctionConfigMismatch"
    },
    {
      "code": 7024,
      "name": "FastMarketOrderExpired"
    },
    {
      "code": 7026,
      "name": "OfferPriceTooHigh"
    },
    {
      "code": 7030,
      "name": "InvalidEmitterForFastFill"
    },
    {
      "code": 7032,
      "name": "AuctionNotActive"
    },
    {
      "code": 7034,
      "name": "AuctionPeriodExpired"
    },
    {
      "code": 7036,
      "name": "AuctionPeriodNotExpired"
    },
    {
      "code": 7044,
      "name": "ExecutorTokenMismatch"
    },
    {
      "code": 7050,
      "name": "AuctionNotCompleted"
    },
    {
      "code": 7054,
      "name": "CarpingNotAllowed"
    },
    {
      "code": 7056,
      "name": "AuctionNotSettled"
    },
    {
      "code": 7058,
      "name": "ExecutorNotPreparedBy"
    },
    {
      "code": 7280,
      "name": "CannotCloseAuctionYet"
    },
    {
      "code": 7282,
      "name": "AuctionHistoryNotFull"
    },
    {
      "code": 7284,
      "name": "AuctionHistoryFull"
    }
  ]
};
