// Add methods for adding endpoints to the program test

use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use anchor_lang::{InstructionData, ToAccountMetas};
use anchor_spl::associated_token::spl_associated_token_account;
use common::wormhole_cctp_solana::cctp::token_messenger_minter_program::RemoteTokenMessenger;
use matching_engine::state::Custodian;
use matching_engine::LOCAL_CUSTODY_TOKEN_SEED_PREFIX;
use solana_program_test::ProgramTestContext;
use std::rc::Rc;
use std::cell::RefCell;
use matching_engine::instruction::{AddCctpRouterEndpoint, AddLocalRouterEndpoint};
use matching_engine::accounts::{AddCctpRouterEndpoint as AddCctpRouterEndpointAccounts, AddLocalRouterEndpoint as AddLocalRouterEndpointAccounts, Admin, CheckedCustodian, LocalTokenRouter, Usdc};
use matching_engine::AddCctpRouterEndpointArgs;
use solana_sdk::instruction::Instruction;
use solana_sdk::signature::{Signer, Keypair};
use solana_sdk::transaction::Transaction;
use matching_engine::state::RouterEndpoint;
use super::constants::*;
use super::token_account::create_token_account_for_pda;

fn generate_admin(owner_or_assistant: Pubkey, custodian: Pubkey) -> Admin {
    let checked_custodian = CheckedCustodian { custodian };
    Admin {
        owner_or_assistant,
        custodian: checked_custodian,
    }
}

async fn print_account_discriminator(
    test_context: &Rc<RefCell<ProgramTestContext>>,
    address: &Pubkey,
) {
    println!("Printing account discriminator for address: {:?}", address);
    let account = test_context.borrow_mut()
        .banks_client
        .get_account(*address)
        .await
        .unwrap()
        .expect("Account not found");

    println!("Account data: {:?}", account.data);
    
    let account_owner = account.owner;
    println!("Account owner: {:?}", account_owner);

    // Get first 8 bytes (discriminator)
    let discriminator = &account.data[..8];
    println!("Account discriminator: {:?}", discriminator);
    
    // Compare with expected discriminator (WARNING: ASSUMPTION)
    let expected = RemoteTokenMessenger::discriminator();
    println!("Expected discriminator: {:?}", expected);
    
}

pub async fn add_cctp_router_endpoint_ix(
    test_context: &Rc<RefCell<ProgramTestContext>>,
    admin_owner_or_assistant: Pubkey,
    admin_custodian: Pubkey,
    admin_keypair: &Keypair,
    program_id: Pubkey,
    remote_token_messenger: Pubkey,
    usdc_mint_address: Pubkey,
    chain: Chain,
) -> RouterEndpoint {
    let admin = generate_admin(admin_owner_or_assistant, admin_custodian);
    let usdc = matching_engine::accounts::Usdc{mint: usdc_mint_address};
    
    // This should be equivalent to writeUint16BigEndian
    let encoded_chain = (chain.to_chain_id() as u16).to_be_bytes();
    let (router_endpoint_address, _bump) = Pubkey::find_program_address(&[RouterEndpoint::SEED_PREFIX, &encoded_chain], &program_id);
    
    // Print the discriminator of the remote token messenger
    print_account_discriminator(&test_context, &remote_token_messenger).await;
    
    let local_custody_token_address = Pubkey::find_program_address(&[LOCAL_CUSTODY_TOKEN_SEED_PREFIX, &encoded_chain], &program_id).0;
    
    let accounts = AddCctpRouterEndpointAccounts {
        payer: test_context.borrow().payer.pubkey(),
        admin,
        router_endpoint: router_endpoint_address,
        local_custody_token: local_custody_token_address,
        usdc,
        remote_token_messenger,
        token_program: anchor_spl::token::ID,
        system_program: anchor_lang::system_program::ID,
    };

    let registered_token_router_address: [u8; 32] = REGISTERED_TOKEN_ROUTERS[&chain].clone().try_into().expect("Failed to convert registered token router address to bytes [u8; 32]");
    let ix_data = AddCctpRouterEndpoint {
        args: AddCctpRouterEndpointArgs {
            chain: chain.to_chain_id(),
            cctp_domain: CHAIN_TO_DOMAIN[chain as usize].1,
            address: registered_token_router_address,
            mint_recipient: None,
        },
    }.data();

    let instruction = Instruction {
        program_id: program_id,
        accounts: accounts.to_account_metas(None),
        data: ix_data,
    };

    let mut transaction = Transaction::new_with_payer(
        &[instruction],
        Some(&test_context.borrow().payer.pubkey()),
    );
    // TODO: Figure out who the signers are
    transaction.sign(&[&test_context.borrow().payer, &admin_keypair], test_context.borrow().last_blockhash);

    test_context.borrow_mut().banks_client.process_transaction(transaction).await.unwrap();

    let endpoint_account = test_context.borrow_mut().banks_client
        .get_account(router_endpoint_address)
        .await
        .unwrap()
        .unwrap();

    let endpoint_data = RouterEndpoint::try_deserialize(&mut endpoint_account.data.as_slice()).unwrap();

    endpoint_data
}

pub async fn add_local_router_endpoint_ix(
    test_context: &Rc<RefCell<ProgramTestContext>>,
    admin_owner_or_assistant: Pubkey,
    admin_custodian: Pubkey,
    admin_keypair: &Keypair,
    program_id: Pubkey,
    usdc_mint_address: &Pubkey,
) -> RouterEndpoint {
    let admin = generate_admin(admin_owner_or_assistant, admin_custodian);
    
    let token_router_program = TOKEN_ROUTER_PID;
    let token_router_emitter = Pubkey::find_program_address(&[Custodian::SEED_PREFIX], &token_router_program).0;
    let token_router_mint_recipient = create_token_account_for_pda(test_context, &token_router_emitter, usdc_mint_address).await;
    // Create the local token router
    let local_token_router = LocalTokenRouter {
        token_router_program,
        token_router_emitter,
        token_router_mint_recipient,
    };
    let chain = Chain::Solana;
    let encoded_chain = (chain.to_chain_id() as u16).to_be_bytes();
    let (router_endpoint_address, _bump) = Pubkey::find_program_address(&[RouterEndpoint::SEED_PREFIX, &encoded_chain], &program_id);

    // Create the router endpoint
    let accounts = AddLocalRouterEndpointAccounts {
        payer: test_context.borrow().payer.pubkey(),
        admin,
        router_endpoint: router_endpoint_address,
        local: local_token_router,
        system_program: anchor_lang::system_program::ID,
    };

    let ix_data = AddLocalRouterEndpoint {}.data();

    let instruction = Instruction {
        program_id: program_id,
        accounts: accounts.to_account_metas(None),
        data: ix_data,
    };

    let mut transaction = Transaction::new_with_payer(
        &[instruction],
        Some(&test_context.borrow().payer.pubkey()),
    );
    transaction.sign(&[&test_context.borrow().payer, &admin_keypair], test_context.borrow().last_blockhash);

    test_context.borrow_mut().banks_client.process_transaction(transaction).await.unwrap();
    
    let endpoint_account = test_context.borrow_mut().banks_client
        .get_account(router_endpoint_address)
        .await
        .unwrap()
        .unwrap();

    let endpoint_data = RouterEndpoint::try_deserialize(&mut endpoint_account.data.as_slice()).unwrap();

    endpoint_data
}