use solana_program_test::ProgramTestContext;
use solana_sdk::{
    instruction::Instruction, pubkey::Pubkey, signature::Signer, transaction::Transaction
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
        AuctionParameters, 
        Custodian, 
        AuctionConfig
    },
};
use super::super::TestingContext;

pub struct InitializeFixture {
    pub test_context: Rc<RefCell<ProgramTestContext>>,
    pub custodian: Custodian,
}

pub async fn initialize_program(testing_context: &TestingContext, program_id: Pubkey, usdc_mint_address: Pubkey, cctp_mint_recipient: Pubkey) -> InitializeFixture {
    let test_context = testing_context.test_context.clone();
    
    let (custodian, _custodian_bump) = Pubkey::find_program_address(
        &[Custodian::SEED_PREFIX],
        &program_id,
    );

    let (auction_config, _auction_config_bump) = Pubkey::find_program_address(
        &[
            AuctionConfig::SEED_PREFIX,
            &0u32.to_be_bytes(),
        ],
        &program_id,
    );
    
    // Create AuctionParameters
    let auction_params = AuctionParameters {
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
        owner: testing_context.testing_actors.owner.pubkey(),
        custodian,
        auction_config,
        owner_assistant: testing_context.testing_actors.owner_assistant.pubkey(),
        fee_recipient: testing_context.testing_actors.fee_recipient.pubkey(),
        fee_recipient_token: testing_context.testing_actors.fee_recipient.token_account_address().unwrap(),
        cctp_mint_recipient: cctp_mint_recipient,
        usdc: matching_engine::accounts::Usdc{mint: usdc_mint_address},
        program_data: testing_context.program_data_account,
        upgrade_manager_authority: common::UPGRADE_MANAGER_AUTHORITY,
        upgrade_manager_program: common::UPGRADE_MANAGER_PROGRAM_ID,
        bpf_loader_upgradeable_program: bpf_loader_upgradeable::id(),
        system_program: system_program::id(),
        token_program: spl_token::id(),
        associated_token_program: spl_associated_token_account::id(),
    };
    
    // Create the instruction
    let instruction = Instruction {
        program_id: program_id,
        accounts: accounts.to_account_metas(None),
        data: ix_data.data(),
    };

    // Create and sign transaction
    let mut transaction = Transaction::new_with_payer(
        &[instruction],
        Some(&test_context.borrow().payer.pubkey()),
    );
    transaction.sign(&[&test_context.borrow().payer, &testing_context.testing_actors.owner.keypair()], test_context.borrow().last_blockhash);

    // Process transaction
    test_context.borrow_mut().banks_client.process_transaction(transaction).await.unwrap();

    // Verify the results
    let custodian_account = test_context.borrow_mut().banks_client
        .get_account(custodian)
        .await
        .unwrap()
        .unwrap();
    
    let custodian_data = Custodian::try_deserialize(&mut custodian_account.data.as_slice()).unwrap();
    
    InitializeFixture { test_context, custodian: custodian_data }
}