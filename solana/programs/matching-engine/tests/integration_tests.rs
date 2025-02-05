use solana_program_test::{ProgramTest, tokio};
use solana_sdk::{
    instruction::Instruction, program_pack::Pack, pubkey::Pubkey, signature::{Keypair, Signer}, transaction::Transaction
};
use std::rc::Rc;
use std::cell::RefCell;

use solana_program::{bpf_loader_upgradeable, system_program};
use anchor_spl::associated_token::spl_associated_token_account;
use anchor_lang::AccountDeserialize;

use anchor_lang::{InstructionData, ToAccountMetas};
use matching_engine::{
    accounts::Initialize,
    InitializeArgs,
    state::{
        // AuctionParameters, 
        Custodian, 
        AuctionConfig
    },
};

mod utils;

use utils::token_account::{add_account_from_file, create_token_account, read_keypair_from_file};

// Configures the program ID and CCTP mint recipient based on the environment
cfg_if::cfg_if! {
    if #[cfg(feature = "mainnet")] {
        const PROGRAM_ID : Pubkey = solana_sdk::pubkey!("5BsCKkzuZXLygduw6RorCqEB61AdzNkxp5VzQrFGzYWr");
        const CCTP_MINT_RECIPIENT: Pubkey = solana_sdk::pubkey!("HUXc7MBf55vWrrkevVbmJN8HAyfFtjLcPLBt9yWngKzm");
    } else if #[cfg(feature = "testnet")] {
        const PROGRAM_ID : Pubkey = solana_sdk::pubkey!("mPydpGUWxzERTNpyvTKdvS7v8kvw5sgwfiP8WQFrXVS");
        const CCTP_MINT_RECIPIENT: Pubkey = solana_sdk::pubkey!("6yKmqWarCry3c8ntYKzM4WiS2fVypxLbENE2fP8onJje");
    } else if #[cfg(feature = "localnet")] {
        const PROGRAM_ID : Pubkey = solana_sdk::pubkey!("MatchingEngine11111111111111111111111111111");
        const CCTP_MINT_RECIPIENT: Pubkey = solana_sdk::pubkey!("35iwWKi7ebFyXNaqpswd1g9e9jrjvqWPV39nCQPaBbX1");
    }
}
const USDC_MINT_ADDRESS: Pubkey = solana_sdk::pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const OWNER_KEYPAIR_PATH: &str = "tests/keys/pFCBP4bhqdSsrWUVTgqhPsLrfEdChBK17vgFM7TxjxQ.json";
const USDC_MINT_FIXTURE_PATH: &str = "tests/fixtures/usdc_mint.json";

// TODO: When modularising, impl function for the struct to add new solvers

#[tokio::test]
pub async fn test_initialize_program() {
    // Create program test context
    let mut program_test = ProgramTest::new(
        "matching_engine",  // Replace with your program name
        PROGRAM_ID,
        None,
    );

    // Create necessary keypairs
    let owner = read_keypair_from_file(OWNER_KEYPAIR_PATH);
    let owner_assistant = Keypair::new();
    let fee_recipient = Keypair::new();

    // Start and get test context
    let test_context = Rc::new(RefCell::new(program_test.start_with_context().await));

    let fee_recipient_token_account = create_token_account(test_context.clone(), &fee_recipient, &owner, &USDC_MINT_ADDRESS).await;
    
    // TODO: Modularise this into common or somewhere else
    // Derive PDAs
    let (custodian, _custodian_bump) = Pubkey::find_program_address(
        &[Custodian::SEED_PREFIX],
        &PROGRAM_ID,
    );

    // TODO: Modularise this into common or somewhere else
    let (auction_config, _auction_config_bump) = Pubkey::find_program_address(
        &[
            AuctionConfig::SEED_PREFIX,
            &0u32.to_be_bytes(),
        ],
        &PROGRAM_ID,
    );

    // Create AuctionParameters
    let auction_params = matching_engine::state::AuctionParameters {
        user_penalty_reward_bps: 250_000, // 25%
        initial_penalty_bps: 250_000, // 25%
        duration: 2,
        grace_period: 5,
        penalty_period: 10,
        min_offer_delta_bps: 20_000, // 2%
        security_deposit_base: 4_200_000,
        security_deposit_bps: 5_000, // 0.5%
    };
    
    // Create the instruction data
    let ix_data = matching_engine::instruction::Initialize {
        args: InitializeArgs {
            auction_params,
        },
    };

    // FIXME: This probably does not work
    let program_data = Pubkey::find_program_address(
        &[PROGRAM_ID.as_ref()],
        &bpf_loader_upgradeable::id(),
    ).0;

    // Get account metas
    let accounts = Initialize {
        owner: owner.pubkey(),
        custodian,
        auction_config,
        owner_assistant: owner_assistant.pubkey(),
        fee_recipient: fee_recipient.pubkey(),
        fee_recipient_token: fee_recipient_token_account.address,
        cctp_mint_recipient: CCTP_MINT_RECIPIENT,
        usdc: matching_engine::accounts::Usdc{mint: USDC_MINT_ADDRESS},
        program_data: program_data,
        upgrade_manager_authority: common::UPGRADE_MANAGER_AUTHORITY,
        upgrade_manager_program: common::UPGRADE_MANAGER_PROGRAM_ID,
        bpf_loader_upgradeable_program: bpf_loader_upgradeable::id(),
        system_program: system_program::id(),
        token_program: anchor_spl::token::spl_token::id(),
        associated_token_program: spl_associated_token_account::id(),
    };

    // Create the instruction
    let instruction = Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: ix_data.data(),
    };

    // Create and sign transaction
    let mut transaction = Transaction::new_with_payer(
        &[instruction],
        Some(&owner.pubkey()),
    );
    transaction.sign(&[&owner], test_context.borrow().last_blockhash);

    // Process transaction
    test_context.borrow_mut().banks_client.process_transaction(transaction).await.unwrap();

    // Verify the results
    let custodian_account = test_context.borrow_mut().banks_client
        .get_account(custodian)
        .await
        .unwrap()
        .unwrap();
    
    let custodian_data = Custodian::try_deserialize(&mut custodian_account.data.as_slice()).unwrap();
    
    assert_eq!(custodian_data.owner, owner.pubkey());
    assert_eq!(custodian_data.owner_assistant, owner_assistant.pubkey());
    // TODO: Add more assertions
}

fn get_program_data() -> Vec<u8> {
    let state = solana_sdk::bpf_loader_upgradeable::UpgradeableLoaderState::ProgramData {
        slot: 0,
        upgrade_authority_address: Some(common::UPGRADE_MANAGER_AUTHORITY),
    };
    bincode::serialize(&state).unwrap()
}