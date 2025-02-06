use solana_program_test::{ProgramTest, tokio};
use solana_sdk::{
    instruction::Instruction, pubkey::Pubkey, signature::{Keypair, Signer}, transaction::Transaction
};
use std::rc::Rc;
use std::cell::RefCell;

use solana_program::{bpf_loader_upgradeable, system_program};
use anchor_spl::{associated_token::spl_associated_token_account, token::spl_token};
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
use utils::token_account::{create_token_account, read_keypair_from_file};
use utils::mint::MintFixture;
use utils::upgrade_manager::initialise_upgrade_manager;
use utils::airdrop::airdrop;

// Configures the program ID and CCTP mint recipient based on the environment
cfg_if::cfg_if! {
    if #[cfg(feature = "mainnet")] {
        const PROGRAM_ID : Pubkey = solana_sdk::pubkey!("5BsCKkzuZXLygduw6RorCqEB61AdzNkxp5VzQrFGzYWr");
        const CCTP_MINT_RECIPIENT: Pubkey = solana_sdk::pubkey!("HUXc7MBf55vWrrkevVbmJN8HAyfFtjLcPLBt9yWngKzm");
        const USDC_MINT_ADDRESS: Pubkey = solana_sdk::pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
        const USDC_MINT_FIXTURE_PATH: &str = "tests/fixtures/usdc_mint.json";
    } else if #[cfg(feature = "testnet")] {
        const PROGRAM_ID : Pubkey = solana_sdk::pubkey!("mPydpGUWxzERTNpyvTKdvS7v8kvw5sgwfiP8WQFrXVS");
        const CCTP_MINT_RECIPIENT: Pubkey = solana_sdk::pubkey!("6yKmqWarCry3c8ntYKzM4WiS2fVypxLbENE2fP8onJje");
        const USDC_MINT_ADDRESS: Pubkey = solana_sdk::pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
        const USDC_MINT_FIXTURE_PATH: &str = "tests/fixtures/usdc_mint_devnet.json";
    } else if #[cfg(feature = "localnet")] {
        const PROGRAM_ID : Pubkey = solana_sdk::pubkey!("MatchingEngine11111111111111111111111111111");
        const CCTP_MINT_RECIPIENT: Pubkey = solana_sdk::pubkey!("35iwWKi7ebFyXNaqpswd1g9e9jrjvqWPV39nCQPaBbX1");
    }
}
const OWNER_KEYPAIR_PATH: &str = "tests/keys/pFCBP4bhqdSsrWUVTgqhPsLrfEdChBK17vgFM7TxjxQ.json";

// TODO: When modularising, impl function for the struct to add new solvers

#[tokio::test]
pub async fn test_initialize_program() {
    // Create program test context
    let mut program_test = ProgramTest::new(
        "matching_engine",  // Replace with your program name
        PROGRAM_ID,
        None,
    );
    program_test.set_compute_max_units(1000000000);
    program_test.set_transaction_account_lock_limit(1000);
    
    // Create necessary keypairs
    let owner = read_keypair_from_file(OWNER_KEYPAIR_PATH);

    let owner_assistant = Keypair::new();
    let fee_recipient = Keypair::new();

    let program_data = initialise_upgrade_manager(&mut program_test, &PROGRAM_ID, owner.pubkey());

    // Start and get test context
    let test_context = Rc::new(RefCell::new(program_test.start_with_context().await));

    // Airdrop to owner and owner assistant
    airdrop(&test_context, &owner.pubkey(), 9999999999950).await;
    airdrop(&test_context, &owner_assistant.pubkey(), 9999999999950).await;

    // Create USDC mint
    let _mint_fixture = MintFixture::new_from_file(&test_context, USDC_MINT_FIXTURE_PATH);

    // Create fee recipient token account
    let fee_recipient_token_account = create_token_account(test_context.clone(), &fee_recipient, &USDC_MINT_ADDRESS).await;
    
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
        // TODO: Initialise upgrade manager program
        upgrade_manager_program: common::UPGRADE_MANAGER_PROGRAM_ID,
        bpf_loader_upgradeable_program: bpf_loader_upgradeable::id(),
        system_program: system_program::id(),
        token_program: spl_token::id(),
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
        Some(&test_context.borrow().payer.pubkey()),
    );
    transaction.sign(&[&test_context.borrow().payer, &owner], test_context.borrow().last_blockhash);

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

