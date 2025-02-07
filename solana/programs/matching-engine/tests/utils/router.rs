// Add methods for adding endpoints to the program test

use anchor_lang::prelude::*;
use anchor_lang::{InstructionData, ToAccountMetas};
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

fn generate_admin(owner_or_assistant: Pubkey, custodian: Pubkey) -> Admin {
    let checked_custodian = CheckedCustodian { custodian };
    Admin {
        owner_or_assistant,
        custodian: checked_custodian,
    }
}

pub async fn add_cctp_router_endpoint_ix(
    test_context: &Rc<RefCell<ProgramTestContext>>,
    admin_owner_or_assistant: Pubkey,
    admin_custodian: Pubkey,
    admin_keypair: &Keypair,
    program_id: Pubkey,
    router_endpoint: Pubkey,
    remote_token_messenger: Pubkey,
    local_custody_token: Pubkey,
    usdc: Usdc,
    chain: Chain,
) -> RouterEndpoint {
    let admin = generate_admin(admin_owner_or_assistant, admin_custodian);
    let router_endpoint_bytes = router_endpoint.clone().to_bytes();
    let accounts = AddCctpRouterEndpointAccounts {
        payer: test_context.borrow().payer.pubkey(),
        admin,
        router_endpoint: router_endpoint.clone(),
        local_custody_token,
        usdc,
        remote_token_messenger,
        token_program: anchor_lang::system_program::ID,
        system_program: anchor_lang::system_program::ID,
    };

    let ix_data = AddCctpRouterEndpoint {
        args: AddCctpRouterEndpointArgs {
            chain: chain.to_chain_id(),
            cctp_domain: CHAIN_TO_DOMAIN[chain as usize].1,
            address: router_endpoint_bytes,
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
        .get_account(router_endpoint)
        .await
        .unwrap()
        .unwrap();

    let endpoint_data = RouterEndpoint::try_deserialize(&mut endpoint_account.data.as_slice()).unwrap();

    endpoint_data
}

pub async fn add_local_router_endpoint_ix(
    test_context: &Rc<RefCell<ProgramTestContext>>,
    admin: Admin,
    admin_keypair: &Keypair,
    program_id: Pubkey,
    router_endpoint: Pubkey,
    token_router_program: Pubkey,
    token_router_emitter: Pubkey,
    token_router_mint_recipient: Pubkey,
) -> RouterEndpoint {
    let local_token_router = LocalTokenRouter {
        token_router_program,
        token_router_emitter,
        token_router_mint_recipient,
    };
    let router_endpoint_bytes = router_endpoint.clone().to_bytes();
    let accounts = AddLocalRouterEndpointAccounts {
        payer: test_context.borrow().payer.pubkey(),
        admin,
        router_endpoint: router_endpoint.clone(),
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
        .get_account(router_endpoint)
        .await
        .unwrap()
        .unwrap();

    let endpoint_data = RouterEndpoint::try_deserialize(&mut endpoint_account.data.as_slice()).unwrap();

    endpoint_data
}
