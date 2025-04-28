use crate::testing_engine::config::{ExecuteOrderInstructionConfig, InstructionConfig};
use crate::testing_engine::setup::{TestingContext, TransferDirection};
use crate::testing_engine::state::{OrderExecutedState, TestingEngineState};

use super::super::utils;
use anchor_spl::token::spl_token;
use common::wormhole_cctp_solana::cctp::{
    MESSAGE_TRANSMITTER_PROGRAM_ID, TOKEN_MESSENGER_MINTER_PROGRAM_ID,
};
use matching_engine::fallback::execute_order::{ExecuteOrderCctpShim, ExecuteOrderShimAccounts};
use solana_program_test::ProgramTestContext;
use solana_sdk::{pubkey::Pubkey, signer::Signer, sysvar::SysvarId, transaction::Transaction};
use utils::constants::*;
use wormhole_svm_definitions::solana::CORE_BRIDGE_PROGRAM_ID;
use wormhole_svm_definitions::{
    solana::{
        CORE_BRIDGE_CONFIG, CORE_BRIDGE_FEE_COLLECTOR, POST_MESSAGE_SHIM_EVENT_AUTHORITY,
        POST_MESSAGE_SHIM_PROGRAM_ID,
    },
    EVENT_AUTHORITY_SEED,
};

pub async fn execute_order_shimful(
    testing_context: &TestingContext,
    test_context: &mut ProgramTestContext,
    current_state: &TestingEngineState,
    config: &ExecuteOrderInstructionConfig,
) -> Option<OrderExecutedState> {
    let program_id = &testing_context.get_matching_engine_program_id();
    let payer_signer = config
        .payer_signer
        .clone()
        .unwrap_or_else(|| testing_context.testing_actors.payer_signer.clone());

    let execute_order_ix_accounts =
        ExecuteOrderShimAccountsOwned::new(testing_context, current_state, config);
    let execute_order_ix = ExecuteOrderCctpShim {
        program_id,
        accounts: execute_order_ix_accounts.as_ref(),
    }
    .instruction();

    // Considering fast forwarding blocks here for deadline to be reached
    let recent_blockhash = testing_context
        .get_new_latest_blockhash(test_context)
        .await
        .unwrap();
    let slots_to_fast_forward = config.fast_forward_slots;
    if slots_to_fast_forward > 0 {
        crate::testing_engine::engine::fast_forward_slots(test_context, slots_to_fast_forward)
            .await;
    }
    let transaction = Transaction::new_signed_with_payer(
        &[execute_order_ix],
        Some(&payer_signer.pubkey()),
        &[&payer_signer],
        recent_blockhash,
    );
    let expected_error = config.expected_error();
    testing_context
        .execute_and_verify_transaction(test_context, transaction, expected_error)
        .await;
    if expected_error.is_none() {
        let order_executed_state = OrderExecutedState {
            cctp_message: execute_order_ix_accounts.cctp_message,
            post_message_sequence: Some(execute_order_ix_accounts.post_message_sequence),
            post_message_message: Some(execute_order_ix_accounts.post_message_message),
            cctp_message_bump: Some(execute_order_ix_accounts.cctp_message_bump),
            actor_enum: config.actor_enum,
        };
        Some(order_executed_state)
    } else {
        None
    }
}

struct ExecuteOrderShimAccountsOwned {
    pub signer: Pubkey,
    pub cctp_message: Pubkey,
    pub custodian: Pubkey,
    pub fast_market_order: Pubkey,
    pub active_auction: Pubkey,
    pub active_auction_custody_token: Pubkey,
    pub active_auction_config: Pubkey,
    pub active_auction_best_offer_token: Pubkey,
    pub initial_offer_token: Pubkey,
    pub initial_participant: Pubkey,
    pub to_router_endpoint: Pubkey,
    pub executor_token: Pubkey,
    pub post_message_shim_program: Pubkey,
    pub post_message_sequence: Pubkey,
    pub post_message_message: Pubkey,
    pub cctp_deposit_for_burn_mint: Pubkey,
    pub cctp_deposit_for_burn_token_messenger_minter_sender_authority: Pubkey,
    pub cctp_deposit_for_burn_message_transmitter_config: Pubkey,
    pub cctp_deposit_for_burn_token_messenger: Pubkey,
    pub cctp_deposit_for_burn_remote_token_messenger: Pubkey,
    pub cctp_deposit_for_burn_token_minter: Pubkey,
    pub cctp_deposit_for_burn_local_token: Pubkey,
    pub cctp_deposit_for_burn_token_messenger_minter_event_authority: Pubkey,
    pub cctp_deposit_for_burn_token_messenger_minter_program: Pubkey,
    pub cctp_deposit_for_burn_message_transmitter_program: Pubkey,
    pub core_bridge_program: Pubkey,
    pub core_bridge_config: Pubkey,
    pub core_bridge_fee_collector: Pubkey,
    pub post_message_shim_event_authority: Pubkey,
    pub system_program: Pubkey,
    pub token_program: Pubkey,
    pub clock: Pubkey,
    // Bump is passed to state for later use
    pub cctp_message_bump: u8,
}

impl ExecuteOrderShimAccountsOwned {
    pub fn new(
        testing_context: &TestingContext,
        current_state: &TestingEngineState,
        config: &ExecuteOrderInstructionConfig,
    ) -> ExecuteOrderShimAccountsOwned {
        let auction_accounts = current_state.auction_accounts().unwrap();
        let active_auction_state = current_state.auction_state().get_active_auction().unwrap();
        let custodian = current_state.custodian_address().unwrap();
        let fast_market_order_address =
            config
                .override_fast_market_order_address
                .unwrap_or_else(|| {
                    current_state
                        .fast_market_order()
                        .unwrap()
                        .fast_market_order_address
                });
        let payer_signer = config
            .payer_signer
            .clone()
            .unwrap_or_else(|| testing_context.testing_actors.payer_signer.clone());

        let program_id = &testing_context.get_matching_engine_program_id();
        let (cctp_message, cctp_message_bump) = Pubkey::find_program_address(
            &[
                common::CCTP_MESSAGE_SEED_PREFIX,
                &active_auction_state.auction_address.to_bytes(),
            ],
            program_id,
        );

        let cctp_deposit_for_burn_accounts = create_cctp_accounts(current_state, testing_context);
        let post_message_sequence = wormhole_svm_definitions::find_emitter_sequence_address(
            &custodian,
            &CORE_BRIDGE_PROGRAM_ID,
        )
        .0;
        let post_message_message = wormhole_svm_definitions::find_shim_message_address(
            &custodian,
            &POST_MESSAGE_SHIM_PROGRAM_ID,
        )
        .0;
        let solver = config.actor_enum.get_actor(&testing_context.testing_actors);
        let executor_token = solver.token_account_address(&config.token_enum).unwrap();
        let active_auction = current_state.auction_state().get_active_auction().unwrap();
        ExecuteOrderShimAccountsOwned {
            signer: payer_signer.pubkey(),                        // 0
            cctp_message,                                         // 1
            custodian,                                            // 2
            fast_market_order: fast_market_order_address,         // 3
            active_auction: active_auction_state.auction_address, // 4
            active_auction_custody_token: active_auction_state.auction_custody_token_address, // 5
            active_auction_config: auction_accounts.auction_config, // 6
            active_auction_best_offer_token: active_auction.best_offer.offer_token, // 7
            executor_token,                                       // 8
            initial_offer_token: active_auction.initial_offer.offer_token, // 9
            initial_participant: active_auction.initial_offer.participant, // 10
            to_router_endpoint: auction_accounts.to_router_endpoint, // 11
            post_message_shim_program: POST_MESSAGE_SHIM_PROGRAM_ID, // 12
            post_message_sequence,                                // 13
            post_message_message,                                 // 14
            cctp_deposit_for_burn_mint: cctp_deposit_for_burn_accounts.mint, // 15
            cctp_deposit_for_burn_token_messenger_minter_sender_authority:
                cctp_deposit_for_burn_accounts.token_messenger_minter_sender_authority, // 16
            cctp_deposit_for_burn_message_transmitter_config: cctp_deposit_for_burn_accounts
                .message_transmitter_config, // 17
            cctp_deposit_for_burn_token_messenger: cctp_deposit_for_burn_accounts.token_messenger, // 18
            cctp_deposit_for_burn_remote_token_messenger: cctp_deposit_for_burn_accounts
                .remote_token_messenger, // 19
            cctp_deposit_for_burn_token_minter: cctp_deposit_for_burn_accounts.token_minter, // 20
            cctp_deposit_for_burn_local_token: cctp_deposit_for_burn_accounts.local_token,   // 21
            cctp_deposit_for_burn_token_messenger_minter_event_authority:
                cctp_deposit_for_burn_accounts.token_messenger_minter_event_authority, // 22
            cctp_deposit_for_burn_token_messenger_minter_program: cctp_deposit_for_burn_accounts
                .token_messenger_minter_program, // 23
            cctp_deposit_for_burn_message_transmitter_program: cctp_deposit_for_burn_accounts
                .message_transmitter_program, // 24
            core_bridge_program: CORE_BRIDGE_PROGRAM_ID,                                     // 25
            core_bridge_config: CORE_BRIDGE_CONFIG,                                          // 26
            core_bridge_fee_collector: CORE_BRIDGE_FEE_COLLECTOR,                            // 27
            post_message_shim_event_authority: POST_MESSAGE_SHIM_EVENT_AUTHORITY,            // 28
            system_program: solana_program::system_program::ID,                              // 29
            token_program: spl_token::ID,                                                    // 30
            clock: solana_program::clock::Clock::id(),                                       // 31
            cctp_message_bump,
        }
    }

    pub fn as_ref(&self) -> ExecuteOrderShimAccounts {
        ExecuteOrderShimAccounts {
            cctp_message: &self.cctp_message,
            core_bridge_emitter_sequence: &self.post_message_sequence,
            post_shim_message: &self.post_message_message,
            signer: &self.signer,
            custodian: &self.custodian,
            fast_market_order: &self.fast_market_order,
            active_auction: &self.active_auction,
            active_auction_custody_token: &self.active_auction_custody_token,
            active_auction_config: &self.active_auction_config,
            active_auction_best_offer_token: &self.active_auction_best_offer_token,
            executor_token: &self.executor_token,
            initial_offer_token: &self.initial_offer_token,
            initial_participant: &self.initial_participant,
            to_router_endpoint: &self.to_router_endpoint,
            post_message_shim_program: &self.post_message_shim_program,
            cctp_deposit_for_burn_mint: &self.cctp_deposit_for_burn_mint,
            cctp_deposit_for_burn_token_messenger_minter_sender_authority: &self
                .cctp_deposit_for_burn_token_messenger_minter_sender_authority,
            cctp_deposit_for_burn_message_transmitter_config: &self
                .cctp_deposit_for_burn_message_transmitter_config,
            cctp_deposit_for_burn_token_messenger: &self.cctp_deposit_for_burn_token_messenger,
            cctp_deposit_for_burn_remote_token_messenger: &self
                .cctp_deposit_for_burn_remote_token_messenger,
            cctp_deposit_for_burn_token_minter: &self.cctp_deposit_for_burn_token_minter,
            cctp_deposit_for_burn_local_token: &self.cctp_deposit_for_burn_local_token,
            cctp_deposit_for_burn_token_messenger_minter_event_authority: &self
                .cctp_deposit_for_burn_token_messenger_minter_event_authority,
            cctp_deposit_for_burn_token_messenger_minter_program: &self
                .cctp_deposit_for_burn_token_messenger_minter_program,
            cctp_deposit_for_burn_message_transmitter_program: &self
                .cctp_deposit_for_burn_message_transmitter_program,
            core_bridge_program: &self.core_bridge_program,
            core_bridge_config: &self.core_bridge_config,
            core_bridge_fee_collector: &self.core_bridge_fee_collector,
            post_message_shim_event_authority: &self.post_message_shim_event_authority,
            system_program: &self.system_program,
            token_program: &self.token_program,
            clock: &self.clock,
        }
    }
}

pub struct CctpAccounts {
    pub mint: Pubkey,
    pub token_messenger: Pubkey,
    pub token_messenger_minter_sender_authority: Pubkey,
    pub token_messenger_minter_event_authority: Pubkey,
    pub message_transmitter_config: Pubkey,
    pub token_minter: Pubkey,
    pub local_token: Pubkey,
    pub remote_token_messenger: Pubkey,
    pub token_messenger_minter_program: Pubkey,
    pub message_transmitter_program: Pubkey,
}

pub fn create_cctp_accounts(
    current_state: &TestingEngineState,
    testing_context: &TestingContext,
) -> CctpAccounts {
    let transfer_direction = current_state.base().transfer_direction;
    let fixture_accounts = testing_context.get_fixture_accounts().unwrap();
    let remote_token_messenger = match transfer_direction {
        TransferDirection::FromEthereumToArbitrum => {
            fixture_accounts.arbitrum_remote_token_messenger
        }
        TransferDirection::FromArbitrumToEthereum => {
            fixture_accounts.ethereum_remote_token_messenger
        }
        _ => panic!("Unsupported transfer direction"),
    };
    let token_messenger_minter_sender_authority =
        Pubkey::find_program_address(&[b"sender_authority"], &TOKEN_MESSENGER_MINTER_PROGRAM_ID).0;
    let message_transmitter_config =
        Pubkey::find_program_address(&[b"message_transmitter"], &MESSAGE_TRANSMITTER_PROGRAM_ID).0;
    let token_messenger =
        Pubkey::find_program_address(&[b"token_messenger"], &TOKEN_MESSENGER_MINTER_PROGRAM_ID).0;
    let token_minter =
        Pubkey::find_program_address(&[b"token_minter"], &TOKEN_MESSENGER_MINTER_PROGRAM_ID).0;
    let local_token = Pubkey::find_program_address(
        &[b"local_token", &USDC_MINT.to_bytes()],
        &TOKEN_MESSENGER_MINTER_PROGRAM_ID,
    )
    .0;
    let token_messenger_minter_event_authority =
        Pubkey::find_program_address(&[EVENT_AUTHORITY_SEED], &TOKEN_MESSENGER_MINTER_PROGRAM_ID).0;
    CctpAccounts {
        mint: utils::constants::USDC_MINT,
        token_messenger,
        token_messenger_minter_sender_authority,
        token_messenger_minter_event_authority,
        message_transmitter_config,
        token_minter,
        local_token,
        remote_token_messenger,
        token_messenger_minter_program: TOKEN_MESSENGER_MINTER_PROGRAM_ID,
        message_transmitter_program: MESSAGE_TRANSMITTER_PROGRAM_ID,
    }
}
