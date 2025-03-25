use matching_engine::state::FastMarketOrder;
use solana_sdk::transaction::VersionedTransaction;

use super::{config::*, state::*};
use crate::shimful;
use crate::shimful::shims::{
    create_fast_market_order_state_from_vaa_data, create_guardian_signatures,
    initialise_fast_market_order_fallback_instruction,
};
use crate::utils::auction::AuctionState;
use crate::utils::{
    auction::AuctionAccounts, router::create_all_router_endpoints_test, setup::TestingContext,
};
use crate::{shimless, utils::vaa::TestVaaPairs};
use anchor_lang::prelude::*;

#[allow(dead_code)]
pub enum InstructionTrigger {
    InitializeProgram(InitializeInstructionConfig),
    CreateCctpRouterEndpoints(CreateCctpRouterEndpointsInstructionConfig),
    InitializeFastMarketOrderShim(InitializeFastMarketOrderShimInstructionConfig),
    PlaceInitialOfferShimless(PlaceInitialOfferInstructionConfig),
    PlaceInitialOfferShim(PlaceInitialOfferInstructionConfig),
    ImproveOfferShimless(ImproveOfferInstructionConfig),
    ExecuteOrderShimless(ExecuteOrderInstructionConfig),
    ExecuteOrderShim(ExecuteOrderInstructionConfig),
    PrepareOrderShimless(PrepareOrderInstructionConfig),
    PrepareOrderShim(PrepareOrderInstructionConfig),
    SettleAuction(SettleAuctionInstructionConfig),
    CloseFastMarketOrderShim(CloseFastMarketOrderShimInstructionConfig),
}

pub struct TestingEngine {
    pub testing_context: TestingContext,
}

impl TestingEngine {
    pub async fn new(testing_context: TestingContext) -> Self {
        Self {
            testing_context: testing_context,
        }
    }

    pub async fn execute(&self, instruction_chain: Vec<InstructionTrigger>) {
        let mut current_state = self.create_initial_state();

        for trigger in instruction_chain {
            current_state = self.execute_trigger(&current_state, &trigger).await;
        }
    }

    async fn execute_trigger(
        &self,
        current_state: &TestingEngineState,
        trigger: &InstructionTrigger,
    ) -> TestingEngineState {
        match trigger {
            InstructionTrigger::InitializeProgram(config) => {
                self.initialize_program(current_state, config).await
            }
            InstructionTrigger::CreateCctpRouterEndpoints(config) => {
                self.create_cctp_router_endpoints(current_state, config)
                    .await
            }
            InstructionTrigger::PlaceInitialOfferShimless(config) => {
                self.place_initial_offer_shimless(current_state, config)
                    .await
            }
            InstructionTrigger::PlaceInitialOfferShim(config) => {
                self.place_initial_offer_shim(current_state, config).await
            }
            InstructionTrigger::InitializeFastMarketOrderShim(config) => {
                self.create_fast_market_order_account(current_state, config)
                    .await
            }
            InstructionTrigger::ImproveOfferShimless(config) => {
                self.improve_offer_shimless(current_state, config).await
            }
            InstructionTrigger::ExecuteOrderShim(config) => {
                self.execute_order_shim(current_state, config).await
            }
            InstructionTrigger::ExecuteOrderShimless(config) => {
                self.execute_order_shimless(current_state, config).await
            }
            InstructionTrigger::PrepareOrderShimless(config) => {
                self.prepare_order_shimless(current_state, config).await
            }
            InstructionTrigger::PrepareOrderShim(config) => {
                self.prepare_order_shim(current_state, config).await
            }
            InstructionTrigger::SettleAuction(config) => {
                self.settle_auction(current_state, config).await
            }
            InstructionTrigger::CloseFastMarketOrderShim(config) => {
                self.close_fast_market_order_account(current_state, config)
                    .await
            }
        }
    }

    pub fn create_initial_state(&self) -> TestingEngineState {
        let fixture_accounts = self
            .testing_context
            .fixture_accounts
            .clone()
            .expect("Failed to get fixture accounts");
        let vaas: TestVaaPairs = self.testing_context.testing_state.vaas.clone();
        let transfer_direction = self.testing_context.testing_state.transfer_direction;
        TestingEngineState::Uninitialized(BaseState {
            fixture_accounts,
            vaas,
            transfer_direction,
        })
    }

    async fn initialize_program(
        &self,
        initial_state: &TestingEngineState,
        config: &InitializeInstructionConfig,
    ) -> TestingEngineState {
        let auction_parameters_config = config.auction_parameters_config.clone();
        let expected_error = config.expected_error.as_ref();

        let (result, owner_pubkey, owner_assistant_pubkey, fee_recipient_token_account) = {
            let result = shimless::initialize::initialize_program(
                &self.testing_context,
                auction_parameters_config,
                expected_error,
            )
            .await;

            let testing_actors = &self.testing_context.testing_actors;
            (
                result,
                testing_actors.owner.pubkey(),
                testing_actors.owner_assistant.pubkey(),
                testing_actors
                    .fee_recipient
                    .token_account_address()
                    .unwrap(),
            )
        };

        if expected_error.is_none() {
            let initialize_fixture = result.expect("Failed to initialize program");
            initialize_fixture.verify_custodian(
                owner_pubkey,
                owner_assistant_pubkey,
                fee_recipient_token_account,
            );

            let auction_config_address = initialize_fixture.get_auction_config_address();
            return TestingEngineState::Initialized {
                base: initial_state.base().clone(),
                initialized: InitializedState {
                    auction_config_address,
                    custodian_address: initialize_fixture.get_custodian_address(),
                },
            };
        }
        initial_state.clone()
    }

    async fn create_cctp_router_endpoints(
        &self,
        current_state: &TestingEngineState,
        config: &CreateCctpRouterEndpointsInstructionConfig,
    ) -> TestingEngineState {
        // Make sure testing state is at least initialized
        let initialized_state = current_state
            .initialized()
            .expect("Testing state is not initialized");
        let custodian_address = initialized_state.custodian_address;
        let testing_actors = &self.testing_context.testing_actors;
        let result = create_all_router_endpoints_test(
            &self.testing_context,
            testing_actors.owner.pubkey(),
            custodian_address,
            testing_actors.owner.keypair(),
            config.chains.clone(),
        )
        .await;
        TestingEngineState::RouterEndpointsCreated {
            base: current_state.base().clone(),
            initialized: initialized_state.clone(),
            router_endpoints: RouterEndpointsState { endpoints: result },
        }
    }

    async fn create_fast_market_order_account(
        &self,
        current_state: &TestingEngineState,
        config: &InitializeFastMarketOrderShimInstructionConfig,
    ) -> TestingEngineState {
        let first_test_vaa_pair = current_state.get_first_test_vaa_pair();
        let fast_transfer_vaa = first_test_vaa_pair.fast_transfer_vaa.clone();
        let (fast_market_order, vaa_data) = create_fast_market_order_state_from_vaa_data(
            &fast_transfer_vaa.vaa_data,
            config
                .close_account_refund_recipient
                .unwrap_or(self.testing_context.testing_actors.solvers[0].pubkey()),
        );
        let payer_signer = config
            .payer_signer
            .clone()
            .unwrap_or(self.testing_context.testing_actors.owner.keypair());
        let (guardian_set_pubkey, guardian_signatures_pubkey, guardian_set_bump) =
            create_guardian_signatures(
                &self.testing_context.test_context,
                &payer_signer,
                &vaa_data,
                &self.testing_context.get_wormhole_program_id(),
                None,
            )
            .await;

        let (fast_market_order_account, fast_market_order_bump) = Pubkey::find_program_address(
            &[
                FastMarketOrder::SEED_PREFIX,
                &fast_market_order.digest(),
                &fast_market_order.close_account_refund_recipient,
            ],
            &self.testing_context.get_matching_engine_program_id(),
        );

        let initialise_fast_market_order_ix = initialise_fast_market_order_fallback_instruction(
            &payer_signer,
            &self.testing_context.get_matching_engine_program_id(),
            fast_market_order,
            guardian_set_pubkey,
            guardian_signatures_pubkey,
            guardian_set_bump,
        );

        let recent_blockhash = self.testing_context.test_context.borrow().last_blockhash;
        let transaction = solana_sdk::transaction::Transaction::new_signed_with_payer(
            &[initialise_fast_market_order_ix],
            Some(&self.testing_context.testing_actors.owner.pubkey()),
            &[&self.testing_context.testing_actors.owner.keypair()],
            recent_blockhash,
        );
        let versioned_transaction = VersionedTransaction::try_from(transaction)
            .expect("Failed to convert transaction to versioned transaction");
        self.testing_context
            .execute_and_verify_transaction(versioned_transaction, config.expected_error.as_ref())
            .await;
        if config.expected_error.is_none() {
            TestingEngineState::FastMarketOrderAccountCreated {
                base: current_state.base().clone(),
                initialized: current_state.initialized().unwrap().clone(),
                router_endpoints: current_state.router_endpoints().cloned(),
                fast_market_order: FastMarketOrderAccountCreatedState {
                    fast_market_order_address: fast_market_order_account,
                    fast_market_order_bump: fast_market_order_bump,
                    fast_market_order: fast_market_order,
                },
                guardian_set_state: GuardianSetState {
                    guardian_set_address: guardian_set_pubkey,
                    guardian_signatures_address: guardian_signatures_pubkey,
                },
            }
        } else {
            current_state.clone()
        }
    }

    async fn close_fast_market_order_account(
        &self,
        current_state: &TestingEngineState,
        config: &CloseFastMarketOrderShimInstructionConfig,
    ) -> TestingEngineState {
        // Get the fast market order account from the current state. If it is not present, panic
        let fast_market_order_account = config.fast_market_order_address.unwrap_or(
            current_state
                .fast_market_order()
                .expect("Fast market order account not found")
                .fast_market_order_address,
        );
        let close_account_refund_recipient = config
            .close_account_refund_recipient_keypair
            .clone()
            .unwrap_or(self.testing_context.testing_actors.solvers[0].keypair());

        shimful::shims::close_fast_market_order_fallback(
            &self.testing_context,
            &close_account_refund_recipient,
            &self.testing_context.get_matching_engine_program_id(),
            &fast_market_order_account,
            config.expected_error.as_ref(),
        )
        .await;

        TestingEngineState::FastMarketOrderClosed {
            base: current_state.base().clone(),
            initialized: current_state.initialized().unwrap().clone(),
            router_endpoints: current_state.router_endpoints().cloned(),
            auction_state: current_state.auction_state().clone(),
            fast_market_order: current_state.fast_market_order().cloned(),
            order_prepared: current_state.order_prepared().cloned(),
            auction_accounts: current_state.auction_accounts().cloned(),
        }
    }
    async fn place_initial_offer_shimless(
        &self,
        current_state: &TestingEngineState,
        config: &PlaceInitialOfferInstructionConfig,
    ) -> TestingEngineState {
        assert!(
            current_state.router_endpoints().is_some(),
            "Router endpoints are not created"
        );
        let payer_signer = config
            .payer_signer
            .clone()
            .unwrap_or(self.testing_context.testing_actors.owner.keypair());
        let solver = self
            .testing_context
            .testing_actors
            .solvers
            .get(config.solver_index)
            .expect("Solver not found at index");
        let expected_error = config.expected_error.as_ref();
        let fast_vaa = &current_state
            .base()
            .vaas
            .get(0)
            .expect("Failed to get vaa pair")
            .fast_transfer_vaa;
        let fast_vaa_pubkey = fast_vaa.get_vaa_pubkey();
        let auction_config_address = current_state
            .initialized()
            .expect("Testing state is not initialized")
            .auction_config_address;
        let custodian_address = current_state
            .initialized()
            .expect("Testing state is not initialized")
            .custodian_address;
        let auction_accounts = AuctionAccounts::new(
            Some(fast_vaa_pubkey),
            solver.clone(),
            auction_config_address,
            &current_state
                .router_endpoints()
                .expect("Router endpoints are not created")
                .endpoints,
            custodian_address,
            self.testing_context.get_usdc_mint_address(),
            self.testing_context.testing_state.transfer_direction,
        );
        let auction_state = shimless::make_offer::place_initial_offer_shimless(
            &self.testing_context,
            &auction_accounts,
            fast_vaa,
            config.offer_price,
            &payer_signer,
            self.testing_context.get_matching_engine_program_id(),
            expected_error,
        )
        .await;
        if expected_error.is_none() {
            auction_state
                .get_active_auction()
                .unwrap()
                .verify_initial_offer(&self.testing_context.test_context)
                .await;
            return TestingEngineState::InitialOfferPlaced {
                base: current_state.base().clone(),
                initialized: current_state.initialized().unwrap().clone(),
                router_endpoints: current_state.router_endpoints().unwrap().clone(),
                fast_market_order: current_state.fast_market_order().cloned(),
                auction_state,
                auction_accounts,
            };
        }
        current_state.clone()
    }

    async fn improve_offer_shimless(
        &self,
        current_state: &TestingEngineState,
        config: &ImproveOfferInstructionConfig,
    ) -> TestingEngineState {
        let expected_error = config.expected_error.as_ref();
        let solver = self
            .testing_context
            .testing_actors
            .solvers
            .get(config.solver_index)
            .expect("Solver not found at index");
        let offer_price = config.offer_price;
        let auction_config_address = current_state
            .auction_config_address()
            .expect("Auction config address not found");
        let payer_signer = config
            .payer_signer
            .clone()
            .unwrap_or(self.testing_context.testing_actors.owner.keypair());
        let new_auction_state = shimless::make_offer::improve_offer(
            &self.testing_context,
            self.testing_context.get_matching_engine_program_id(),
            solver.clone(),
            auction_config_address,
            offer_price,
            &payer_signer,
            current_state.auction_state(),
            expected_error,
        )
        .await;
        if expected_error.is_none() {
            let auction_state = new_auction_state.unwrap();
            return TestingEngineState::OfferImproved {
                base: current_state.base().clone(),
                initialized: current_state.initialized().unwrap().clone(),
                router_endpoints: current_state.router_endpoints().unwrap().clone(),
                fast_market_order: current_state.fast_market_order().cloned(),
                auction_state,
                auction_accounts: current_state.auction_accounts().cloned(),
            };
        }
        current_state.clone()
    }

    async fn place_initial_offer_shim(
        &self,
        current_state: &TestingEngineState,
        config: &PlaceInitialOfferInstructionConfig,
    ) -> TestingEngineState {
        let fast_market_order_address = config.fast_market_order_address.unwrap_or(
            current_state
                .fast_market_order()
                .expect("Fast market order is not created")
                .fast_market_order_address,
        );
        let router_endpoints = current_state
            .router_endpoints()
            .expect("Router endpoints are not created");
        let solver = self.testing_context.testing_actors.solvers[config.solver_index].clone();
        let payer_signer = config
            .payer_signer
            .clone()
            .unwrap_or(self.testing_context.testing_actors.owner.keypair());
        let auction_config_address = current_state
            .auction_config_address()
            .expect("Auction config address not found");
        let custodian_address = current_state
            .custodian_address()
            .expect("Custodian address not found");
        let auction_accounts = AuctionAccounts::new(
            None,
            solver.clone(),
            auction_config_address,
            &router_endpoints.endpoints,
            custodian_address,
            self.testing_context.get_usdc_mint_address(),
            self.testing_context.testing_state.transfer_direction,
        );
        let fast_vaa_data = current_state
            .get_first_test_vaa_pair()
            .fast_transfer_vaa
            .get_vaa_data();
        let place_initial_offer_shim_fixture = shimful::shims::place_initial_offer_fallback(
            &self.testing_context,
            &payer_signer,
            &fast_vaa_data,
            solver,
            &fast_market_order_address,
            &auction_accounts,
            config.offer_price,
            config.expected_error.as_ref(),
        )
        .await;
        if config.expected_error.is_none() {
            let initial_offer_placed_state = place_initial_offer_shim_fixture.unwrap();
            return TestingEngineState::InitialOfferPlaced {
                base: current_state.base().clone(),
                initialized: current_state.initialized().unwrap().clone(),
                router_endpoints: current_state.router_endpoints().unwrap().clone(),
                fast_market_order: current_state.fast_market_order().cloned(),
                auction_state: initial_offer_placed_state.auction_state,
                auction_accounts,
            };
        }
        current_state.clone()
    }

    async fn execute_order_shim(
        &self,
        current_state: &TestingEngineState,
        config: &ExecuteOrderInstructionConfig,
    ) -> TestingEngineState {
        let solver = self.testing_context.testing_actors.solvers[config.solver_index].clone();

        // TODO: Change to get auction accounts from current state
        let auction_accounts = current_state
            .auction_accounts()
            .expect("Auction accounts not found");
        let fast_market_order_address = config.fast_market_order_address.unwrap_or(
            current_state
                .fast_market_order()
                .expect("Fast market order is not created")
                .fast_market_order_address,
        );
        let active_auction_state = current_state
            .auction_state()
            .get_active_auction()
            .expect("Active auction not found");
        let result = shimful::shims_execute_order::execute_order_fallback_test(
            &self.testing_context,
            &auction_accounts,
            &fast_market_order_address,
            &active_auction_state,
            solver,
            config.expected_error.as_ref(),
        )
        .await;
        if config.expected_error.is_none() {
            let order_executed_fallback_fixture = result.unwrap();
            let order_executed_state = OrderExecutedState {
                cctp_message: order_executed_fallback_fixture.cctp_message,
                post_message_sequence: Some(order_executed_fallback_fixture.post_message_sequence),
                post_message_message: Some(order_executed_fallback_fixture.post_message_message),
            };
            TestingEngineState::OrderExecuted {
                base: current_state.base().clone(),
                initialized: current_state.initialized().unwrap().clone(),
                router_endpoints: current_state.router_endpoints().unwrap().clone(),
                fast_market_order: current_state.fast_market_order().cloned(),
                auction_state: current_state.auction_state().clone(),
                order_executed: order_executed_state,
                auction_accounts: auction_accounts.clone(),
            }
        } else {
            current_state.clone()
        }
    }

    async fn execute_order_shimless(
        &self,
        current_state: &TestingEngineState,
        config: &ExecuteOrderInstructionConfig,
    ) -> TestingEngineState {
        let payer_signer = config
            .payer_signer
            .clone()
            .unwrap_or(self.testing_context.testing_actors.owner.keypair());
        let auction_config_address = current_state
            .auction_config_address()
            .expect("Auction config address not found");
        let router_endpoints = current_state
            .router_endpoints()
            .expect("Router endpoints are not created");
        let solver = self.testing_context.testing_actors.solvers[config.solver_index].clone();
        let custodian_address = current_state
            .custodian_address()
            .expect("Custodian address not found");
        let auction_accounts = AuctionAccounts::new(
            Some(
                current_state
                    .get_first_test_vaa_pair()
                    .fast_transfer_vaa
                    .get_vaa_pubkey(),
            ),
            solver.clone(),
            auction_config_address,
            &router_endpoints.endpoints,
            custodian_address,
            self.testing_context.get_usdc_mint_address(),
            self.testing_context.testing_state.transfer_direction,
        );
        let result = shimless::execute_order::execute_order_shimless_test(
            &self.testing_context,
            &auction_accounts,
            current_state.auction_state(),
            &payer_signer,
            config.expected_error.as_ref(),
        )
        .await;
        if config.expected_error.is_none() {
            let execute_order_fixture = result.unwrap();
            let order_executed_state = OrderExecutedState {
                cctp_message: execute_order_fixture.cctp_message,
                post_message_sequence: None,
                post_message_message: None,
            };
            TestingEngineState::OrderExecuted {
                base: current_state.base().clone(),
                initialized: current_state.initialized().unwrap().clone(),
                router_endpoints: current_state.router_endpoints().unwrap().clone(),
                fast_market_order: current_state.fast_market_order().cloned(),
                auction_state: current_state.auction_state().clone(),
                order_executed: order_executed_state,
                auction_accounts: auction_accounts.clone(),
            }
        } else {
            current_state.clone()
        }
    }

    async fn prepare_order_shim(
        &self,
        current_state: &TestingEngineState,
        config: &PrepareOrderInstructionConfig,
    ) -> TestingEngineState {
        let auction_accounts = current_state
            .auction_accounts()
            .expect("Auction accounts not found");

        let deposit_vaa = current_state.get_first_test_vaa_pair().deposit_vaa.clone();
        let deposit_vaa_data = deposit_vaa.get_vaa_data();
        let deposit = deposit_vaa
            .payload_deserialized
            .clone()
            .unwrap()
            .get_deposit()
            .unwrap();

        let payer_signer = config
            .payer_signer
            .clone()
            .unwrap_or(self.testing_context.testing_actors.owner.keypair());

        let result = shimful::shims_prepare_order_response::prepare_order_response_test(
            &self.testing_context,
            &payer_signer,
            &deposit_vaa_data,
            current_state,
            &auction_accounts.to_router_endpoint,
            &auction_accounts.from_router_endpoint,
            &deposit,
            config.expected_error.as_ref(),
        )
        .await;
        if config.expected_error.is_none() {
            let prepare_order_response_fixture = result.unwrap();
            let order_prepared_state = OrderPreparedState {
                prepared_order_address: prepare_order_response_fixture.prepared_order_response,
                prepared_custody_token: prepare_order_response_fixture.prepared_custody_token,
            };
            TestingEngineState::OrderPrepared {
                base: current_state.base().clone(),
                initialized: current_state.initialized().unwrap().clone(),
                router_endpoints: current_state.router_endpoints().unwrap().clone(),
                fast_market_order: current_state.fast_market_order().cloned(),
                auction_state: current_state.auction_state().clone(),
                order_prepared: order_prepared_state,
                auction_accounts: auction_accounts.clone(),
            }
        } else {
            current_state.clone()
        }
    }

    async fn prepare_order_shimless(
        &self,
        _current_state: &TestingEngineState,
        _config: &PrepareOrderInstructionConfig,
    ) -> TestingEngineState {
        panic!("Not implemented yet");
    }

    async fn settle_auction(
        &self,
        current_state: &TestingEngineState,
        config: &SettleAuctionInstructionConfig,
    ) -> TestingEngineState {
        let payer_signer = config
            .payer_signer
            .clone()
            .unwrap_or(self.testing_context.testing_actors.owner.keypair());
        let order_prepared_state = current_state
            .order_prepared()
            .expect("Order prepared not found");
        let prepared_custody_token = order_prepared_state.prepared_custody_token;
        let prepared_order_response = order_prepared_state.prepared_order_address;
        let auction_state = shimless::settle_auction::settle_auction_complete(
            &self.testing_context,
            &payer_signer,
            current_state.auction_state(),
            &prepared_order_response,
            &prepared_custody_token,
            &self.testing_context.get_matching_engine_program_id(),
            config.expected_error.as_ref(),
        )
        .await;
        match auction_state {
            AuctionState::Settled => TestingEngineState::AuctionSettled {
                base: current_state.base().clone(),
                initialized: current_state.initialized().unwrap().clone(),
                router_endpoints: current_state.router_endpoints().unwrap().clone(),
                auction_state: current_state.auction_state().clone(),
                fast_market_order: current_state.fast_market_order().cloned(),
                order_prepared: order_prepared_state.clone(),
                auction_accounts: current_state.auction_accounts().cloned(),
            },
            _ => current_state.clone(),
        }
    }
}
