use solana_program_test::{ProgramTest, tokio};
use solana_sdk::{
    instruction::Instruction, program_pack::Pack, pubkey::Pubkey, signature::{Keypair, Signer}, transaction::Transaction
};

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

mod common;

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
    // TODO: Load the key from the fixture file
    let owner = Keypair::new();
    // TODO: Understand wtf is owner_assistant
    let owner_assistant = Keypair::new();
    let fee_recipient = Keypair::new();

    // Derive the ATA for fee_recipient
    let fee_recipient_token_account = spl_associated_token_account::get_associated_token_address(
        &fee_recipient.pubkey(),
        &USDC_MINT_ADDRESS,
    );

    // Create the token account state
    // TODO: Use the system instruction to initialize account instead
    let fee_recipient_token_account_state = anchor_spl::token::spl_token::state::Account {
        mint: USDC_MINT_ADDRESS,
        owner: fee_recipient.pubkey(),
        amount: 0,
        delegate: None.into(),
        state: anchor_spl::token::spl_token::state::AccountState::Initialized,
        is_native: None.into(),
        delegated_amount: 0,
        close_authority: None.into(),
    };

    // TODO: This is going to be changed when using the system instruction to initialize account
    // Pack the state into bytes
    let mut fee_recipient_account_data: Vec<u8> = vec![0; anchor_spl::token::TokenAccount::LEN];
    anchor_spl::token::spl_token::state::Account::pack(fee_recipient_token_account_state, &mut fee_recipient_account_data).unwrap();
    
    // TODO: Modularise this into common or somewhere else
    // Add the ATA account to the test environment
    program_test.add_account(
        fee_recipient_token_account,
        solana_sdk::account::Account {
            lamports: anchor_lang::solana_program::rent::Rent::default().minimum_balance(anchor_spl::token::TokenAccount::LEN),
            data: fee_recipient_account_data,
            owner: anchor_spl::token::spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );

    // TODO: Change to use the start_and_get_context function (cleaner)
    // Start and get test context
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;
    
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

    // TODO: Figure out what initial values make sense
    // Create AuctionParameters
    let auction_params = matching_engine::state::AuctionParameters {
        user_penalty_reward_bps: 0,
        initial_penalty_bps: 0,
        duration: 0,
        grace_period: 0,
        penalty_period: 0,
        min_offer_delta_bps: 0,
        security_deposit_base: 0,
        security_deposit_bps: 0,
    };
    
    // Create the instruction data
    let ix_data = matching_engine::instruction::Initialize {
        args: InitializeArgs {
            auction_params,
        },
    };

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
        fee_recipient: fee_recipient_token_account,
        fee_recipient_token: fee_recipient_token_account,
        cctp_mint_recipient: CCTP_MINT_RECIPIENT,
        usdc: matching_engine::accounts::Usdc{mint: USDC_MINT_ADDRESS,},
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
        Some(&payer.pubkey()),
    );
    transaction.sign(&[&payer, &owner], recent_blockhash);

    // Process transaction
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify the results
    let custodian_account = banks_client
        .get_account(custodian)
        .await
        .unwrap()
        .unwrap();
    
    let custodian_data = Custodian::try_deserialize(&mut custodian_account.data.as_slice()).unwrap();
    
    assert_eq!(custodian_data.owner, owner.pubkey());
    assert_eq!(custodian_data.owner_assistant, owner_assistant.pubkey());
    // TODO: Add more assertions
}