use matching_engine::{ID as PROGRAM_ID, CCTP_MINT_RECIPIENT};
use solana_program_test::tokio;
use solana_sdk::pubkey::Pubkey;
mod utils;
use solana_sdk::signer::Signer;
use utils::shims_execute_order::{execute_order_fallback, ExecuteOrderFallbackAccounts};
use utils::{Chain, REGISTERED_TOKEN_ROUTERS};
use utils::router::{create_cctp_router_endpoints_test, add_local_router_endpoint_ix, create_all_router_endpoints_test};
use utils::initialize::initialize_program;
use utils::auction::{improve_offer, place_initial_offer, AuctionAccounts, AuctionOfferFixture};
use utils::setup::{PreTestingContext, TestingContext};
use utils::vaa::create_vaas_test_with_chain_and_address;
use utils::shims::{
    // place_initial_offer_shim, 
    place_initial_offer_fallback, set_up_post_message_transaction_test};
use wormhole_svm_definitions::solana::CORE_BRIDGE_PROGRAM_ID;
// Configures the program ID and CCTP mint recipient based on the environment
cfg_if::cfg_if! {
    if #[cfg(feature = "mainnet")] {
        //const PROGRAM_ID : Pubkey = solana_sdk::pubkey!("5BsCKkzuZXLygduw6RorCqEB61AdzNkxp5VzQrFGzYWr");
        //const CCTP_MINT_RECIPIENT: Pubkey = solana_sdk::pubkey!("HUXc7MBf55vWrrkevVbmJN8HAyfFtjLcPLBt9yWngKzm");
        const USDC_MINT_ADDRESS: Pubkey = solana_sdk::pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
        const USDC_MINT_FIXTURE_PATH: &str = "tests/fixtures/usdc_mint.json";
    } else if #[cfg(feature = "testnet")] {
        //const PROGRAM_ID : Pubkey = solana_sdk::pubkey!("mPydpGUWxzERTNpyvTKdvS7v8kvw5sgwfiP8WQFrXVS");
        //const CCTP_MINT_RECIPIENT: Pubkey = solana_sdk::pubkey!("6yKmqWarCry3c8ntYKzM4WiS2fVypxLbENE2fP8onJje");
        const USDC_MINT_ADDRESS: Pubkey = solana_sdk::pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
        const USDC_MINT_FIXTURE_PATH: &str = "tests/fixtures/usdc_mint_devnet.json";
    } else if #[cfg(feature = "localnet")] {
        //const PROGRAM_ID : Pubkey = solana_sdk::pubkey!("MatchingEngine11111111111111111111111111111");
        // const CCTP_MINT_RECIPIENT: Pubkey = solana_sdk::pubkey!("35iwWKi7ebFyXNaqpswd1g9e9jrjvqWPV39nCQPaBbX1");
    }
}
const OWNER_KEYPAIR_PATH: &str = "tests/keys/pFCBP4bhqdSsrWUVTgqhPsLrfEdChBK17vgFM7TxjxQ.json";

/// Test that the program is initialised correctly
#[tokio::test]
pub async fn test_initialize_program() {
    let pre_testing_context = PreTestingContext::new(PROGRAM_ID, OWNER_KEYPAIR_PATH);
    let testing_context = TestingContext::new(pre_testing_context, USDC_MINT_FIXTURE_PATH, USDC_MINT_ADDRESS).await;

    let initialize_fixture = initialize_program(&testing_context, PROGRAM_ID, USDC_MINT_ADDRESS, CCTP_MINT_RECIPIENT).await;

    // Check that custodian data corresponds to the expected values
    initialize_fixture.verify_custodian(testing_context.testing_actors.owner.pubkey(), testing_context.testing_actors.owner_assistant.pubkey(), testing_context.testing_actors.fee_recipient.token_account.unwrap().address);
}

/// Test that a CCTP token router endpoint is created for the arbitrum and ethereum chains
#[tokio::test]
pub async fn test_cctp_token_router_endpoint_creation() {
    let pre_testing_context = PreTestingContext::new(PROGRAM_ID, OWNER_KEYPAIR_PATH);
    let testing_context = TestingContext::new(pre_testing_context, USDC_MINT_FIXTURE_PATH, USDC_MINT_ADDRESS).await;

    let initialize_fixture = initialize_program(&testing_context, PROGRAM_ID, USDC_MINT_ADDRESS, CCTP_MINT_RECIPIENT).await;
    
    let fixture_accounts = testing_context.fixture_accounts.expect("Pre-made fixture accounts not found");
    let arb_remote_token_messenger = fixture_accounts.arbitrum_remote_token_messenger;
    let eth_remote_token_messenger = fixture_accounts.ethereum_remote_token_messenger;

    let usdc_mint_address = USDC_MINT_ADDRESS;
    
    let token_router_endpoints = create_cctp_router_endpoints_test(
        &testing_context.test_context,
        testing_context.testing_actors.owner.pubkey(),
        initialize_fixture.get_custodian_address(),
        arb_remote_token_messenger,
        eth_remote_token_messenger,
        usdc_mint_address,
        testing_context.testing_actors.owner.keypair(),
        PROGRAM_ID,
    ).await;

    assert_eq!(token_router_endpoints.len(), 2);
}

#[tokio::test]
pub async fn test_local_token_router_endpoint_creation() {
    let pre_testing_context = PreTestingContext::new(PROGRAM_ID, OWNER_KEYPAIR_PATH);
    let testing_context = TestingContext::new(pre_testing_context, USDC_MINT_FIXTURE_PATH, USDC_MINT_ADDRESS).await;

    let initialize_fixture: utils::initialize::InitializeFixture = initialize_program(&testing_context, PROGRAM_ID, USDC_MINT_ADDRESS, CCTP_MINT_RECIPIENT).await;

    let usdc_mint_address = USDC_MINT_ADDRESS;

    let _local_token_router_endpoint = add_local_router_endpoint_ix(
        &testing_context.test_context,
        testing_context.testing_actors.owner.pubkey(),
        initialize_fixture.get_custodian_address(),
        testing_context.testing_actors.owner.keypair().as_ref(),
        PROGRAM_ID,
        &usdc_mint_address,
    ).await;
}

// Test setting up vaas
// Vaa is from arbitrum to ethereum
// - The payload of the vaa should be the .to_vec() of the FastMarketOrder under universal/rs/messages/src/fast_market_order.rs
#[tokio::test]
pub async fn test_setup_vaas() {
    let mut pre_testing_context = PreTestingContext::new(PROGRAM_ID, OWNER_KEYPAIR_PATH);
    let arbitrum_emitter_address: [u8; 32] = REGISTERED_TOKEN_ROUTERS[&Chain::Arbitrum].clone().try_into().expect("Failed to convert registered token router address to bytes [u8; 32]");
    let ethereum_emitter_address: [u8; 32] = REGISTERED_TOKEN_ROUTERS[&Chain::Ethereum].clone().try_into().expect("Failed to convert registered token router address to bytes [u8; 32]");
    let vaas_test = create_vaas_test_with_chain_and_address(&mut pre_testing_context.program_test, USDC_MINT_ADDRESS, None, CCTP_MINT_RECIPIENT, Chain::Arbitrum, Chain::Ethereum, arbitrum_emitter_address, ethereum_emitter_address, None, None, true);
    let testing_context = TestingContext::new(pre_testing_context, USDC_MINT_FIXTURE_PATH, USDC_MINT_ADDRESS).await;
    let initialize_fixture = initialize_program(&testing_context, PROGRAM_ID, USDC_MINT_ADDRESS, CCTP_MINT_RECIPIENT).await;
    let first_test_ft = vaas_test.0.first().unwrap();
    first_test_ft.verify_vaas(&testing_context.test_context).await;

    // Get the fixture accounts
    let fixture_accounts = testing_context.fixture_accounts.expect("Pre-made fixture accounts not found");
    // Try making initial offer
    let fast_vaa = first_test_ft.fast_transfer_vaa.get_vaa_pubkey();
    let usdc_mint_address = USDC_MINT_ADDRESS;
    let auction_config_address = initialize_fixture.get_auction_config_address();
    let router_endpoints = create_all_router_endpoints_test(
        &testing_context.test_context,
        testing_context.testing_actors.owner.pubkey(),
        initialize_fixture.get_custodian_address(),
        fixture_accounts.arbitrum_remote_token_messenger,
        fixture_accounts.ethereum_remote_token_messenger,
        usdc_mint_address,
        testing_context.testing_actors.owner.keypair(),
        PROGRAM_ID,
    ).await;
    let arb_endpoint_address = router_endpoints.arbitrum.endpoint_address;
    let eth_endpoint_address = router_endpoints.ethereum.endpoint_address;

    let solver = testing_context.testing_actors.solvers[0].clone();
    let auction_accounts = AuctionAccounts::new(
        Some(fast_vaa), // Fast VAA pubkey
        solver.clone(), // Solver
        auction_config_address.clone(), // Auction config pubkey
        arb_endpoint_address, // From router endpoint pubkey
        eth_endpoint_address, // To router endpoint pubkey
        initialize_fixture.get_custodian_address(), // Custodian pubkey
        usdc_mint_address, // USDC mint pubkey
    );

    let fast_market_order = first_test_ft.fast_transfer_vaa.clone();

    let initial_offer_fixture = place_initial_offer(&testing_context.test_context, &auction_accounts, fast_market_order, testing_context.testing_actors.owner.keypair(), PROGRAM_ID).await;
    initial_offer_fixture.verify_initial_offer(&testing_context.test_context).await;

    let _improved_offer_fixture = improve_offer(&testing_context.test_context, initial_offer_fixture, testing_context.testing_actors.owner.keypair(), PROGRAM_ID, solver, auction_config_address).await;
    // improved_offer_fixture.verify_improved_offer(&testing_context.test_context).await;
}


#[tokio::test]
pub async fn test_post_message_shims() {
    let mut pre_testing_context = PreTestingContext::new(PROGRAM_ID, OWNER_KEYPAIR_PATH);
    // Add shim programs
    pre_testing_context.add_post_message_shims();
    let testing_context = TestingContext::new(pre_testing_context, USDC_MINT_FIXTURE_PATH, USDC_MINT_ADDRESS).await;
    let actors = testing_context.testing_actors;
    let emitter_signer = actors.owner.keypair();
    let payer_signer = actors.solvers[0].keypair();
    let recent_blockhash = testing_context.test_context.borrow().last_blockhash;
    set_up_post_message_transaction_test(&testing_context.test_context, &payer_signer, &emitter_signer, recent_blockhash).await;
}


#[tokio::test]
// Testing a initial offer from arbitrum to ethereum
// TODO: Make a test that checks that the auction account and maybe some other accounts are exactly the same as when using the fallback instruction
pub async fn test_verify_shims_fallback() {
    let mut pre_testing_context = PreTestingContext::new(PROGRAM_ID, OWNER_KEYPAIR_PATH);
    pre_testing_context.add_verify_shims();
    // This will create vaas for the arbitrum and ethereum chains and post them to the test context accounts. These vaas will not be needed for the shim test, and shouldn't interact with the program during the test.
    let arbitrum_emitter_address: [u8; 32] = REGISTERED_TOKEN_ROUTERS[&Chain::Arbitrum].clone().try_into().expect("Failed to convert registered token router address to bytes [u8; 32]");
    let ethereum_emitter_address: [u8; 32] = REGISTERED_TOKEN_ROUTERS[&Chain::Ethereum].clone().try_into().expect("Failed to convert registered token router address to bytes [u8; 32]");
    
    // This will create the fast transfer and deposit vaas but will not post them. Both will have nonce == 0. Deposit vaa will have sequence == 0, fast transfer vaa will have sequence == 1.
    let vaas_test = create_vaas_test_with_chain_and_address(&mut pre_testing_context.program_test, USDC_MINT_ADDRESS, None, CCTP_MINT_RECIPIENT, Chain::Arbitrum, Chain::Ethereum, arbitrum_emitter_address, ethereum_emitter_address, None, Some(0),false);
    let testing_context = TestingContext::new(pre_testing_context, USDC_MINT_FIXTURE_PATH, USDC_MINT_ADDRESS).await;
    let initialize_fixture = initialize_program(&testing_context, PROGRAM_ID, USDC_MINT_ADDRESS, CCTP_MINT_RECIPIENT).await;
    let first_test_ft = vaas_test.0.first().unwrap();
    
    let fixture_accounts = testing_context.fixture_accounts.expect("Pre-made fixture accounts not found");
    // Try making initial offer using the shim instruction
    let usdc_mint_address = USDC_MINT_ADDRESS;
    let auction_config_address = initialize_fixture.get_auction_config_address();
    let router_endpoints = create_all_router_endpoints_test(
        &testing_context.test_context,
        testing_context.testing_actors.owner.pubkey(),
        initialize_fixture.get_custodian_address(),
        fixture_accounts.arbitrum_remote_token_messenger,
        fixture_accounts.ethereum_remote_token_messenger,
        usdc_mint_address,
        testing_context.testing_actors.owner.keypair(),
        PROGRAM_ID,
    ).await;
    let arb_endpoint_address = router_endpoints.arbitrum.endpoint_address;
    let eth_endpoint_address = router_endpoints.ethereum.endpoint_address;

    let solver = testing_context.testing_actors.solvers[0].clone();
    let auction_accounts = AuctionAccounts::new(
        None, // Fast VAA pubkey
        solver.clone(), // Solver
        auction_config_address.clone(), // Auction config pubkey
        arb_endpoint_address, // From router endpoint pubkey
        eth_endpoint_address, // To router endpoint pubkey
        initialize_fixture.get_custodian_address(), // Custodian pubkey
        usdc_mint_address, // USDC mint pubkey
    );
    
    let vaa_data = first_test_ft.fast_transfer_vaa.clone().vaa_data;

    // Place initial offer using the fallback program
    let initial_offer_fixture = place_initial_offer_fallback(
        &testing_context.test_context,
        &testing_context.testing_actors.owner.keypair(),
        &PROGRAM_ID,
        &CORE_BRIDGE_PROGRAM_ID,
        &vaa_data,
        solver.clone(),
        &auction_accounts,
        1__000_000, // 1 USDC (double underscore for decimal separator)
    ).await.expect("Failed to place initial offer");

    let auction_offer_fixture = AuctionOfferFixture {
        auction_address: initial_offer_fixture.auction_address,
        auction_custody_token_address: initial_offer_fixture.auction_custody_token_address,
        offer_price: 1__000_000,
        offer_token: auction_accounts.offer_token,
    };
    // Attempt to improve the offer using the non-fallback method
    let _improved_offer_fixture = improve_offer(&testing_context.test_context, auction_offer_fixture, testing_context.testing_actors.owner.keypair(), PROGRAM_ID, solver, auction_config_address).await;
    // improved_offer_fixture.verify_improved_offer(&testing_context.test_context).await;
}


#[tokio::test]
// Testing an execute order from arbitrum to ethereum
// TODO: Flesh out this test to see if the message was posted correctly
pub async fn test_execute_order_fallback() {
    let mut pre_testing_context = PreTestingContext::new(PROGRAM_ID, OWNER_KEYPAIR_PATH);
    pre_testing_context.add_verify_shims();
    pre_testing_context.add_post_message_shims();
    let arbitrum_emitter_address: [u8; 32] = REGISTERED_TOKEN_ROUTERS[&Chain::Arbitrum].clone().try_into().expect("Failed to convert registered token router address to bytes [u8; 32]");
    let ethereum_emitter_address: [u8; 32] = REGISTERED_TOKEN_ROUTERS[&Chain::Ethereum].clone().try_into().expect("Failed to convert registered token router address to bytes [u8; 32]");
    let vaas_test = create_vaas_test_with_chain_and_address(&mut pre_testing_context.program_test, USDC_MINT_ADDRESS, None, CCTP_MINT_RECIPIENT, Chain::Arbitrum, Chain::Ethereum, arbitrum_emitter_address, ethereum_emitter_address, None, Some(0), false);
    let testing_context = TestingContext::new(pre_testing_context, USDC_MINT_FIXTURE_PATH, USDC_MINT_ADDRESS).await;
    let initialize_fixture = initialize_program(&testing_context, PROGRAM_ID, USDC_MINT_ADDRESS, CCTP_MINT_RECIPIENT).await;
    let actors = testing_context.testing_actors;
    let payer_signer = actors.owner.keypair();
    let first_test_ft = vaas_test.0.first().unwrap();
    let fixture_accounts = testing_context.fixture_accounts.expect("Pre-made fixture accounts not found");
    
    // Try making initial offer using the shim instruction
    let usdc_mint_address = USDC_MINT_ADDRESS;
    let auction_config_address = initialize_fixture.get_auction_config_address();
    let router_endpoints = create_all_router_endpoints_test(
        &testing_context.test_context,
        actors.owner.pubkey(),
        initialize_fixture.get_custodian_address(),
        fixture_accounts.arbitrum_remote_token_messenger,
        fixture_accounts.ethereum_remote_token_messenger,
        usdc_mint_address,
        actors.owner.keypair(),
        PROGRAM_ID,
    ).await;
    let arb_endpoint_address = router_endpoints.arbitrum.endpoint_address;
    let eth_endpoint_address = router_endpoints.ethereum.endpoint_address;
    let solver: utils::setup::Solver = actors.solvers[0].clone();

    let auction_accounts = AuctionAccounts::new(
        None, // Fast VAA pubkey
        solver.clone(), // Solver
        auction_config_address.clone(), // Auction config pubkey
        arb_endpoint_address, // From router endpoint pubkey
        eth_endpoint_address, // To router endpoint pubkey
        initialize_fixture.get_custodian_address(), // Custodian pubkey
        usdc_mint_address, // USDC mint pubkey
    );

    let vaa_data = first_test_ft.fast_transfer_vaa.clone().vaa_data;

    println!("Solver balance before placing initial offer: {:?}", solver.get_balance(&testing_context.test_context).await);
    
    // Place initial offer using the fallback program
    let initial_offer_fixture = place_initial_offer_fallback(
        &testing_context.test_context,
        &payer_signer,
        &PROGRAM_ID,
        &CORE_BRIDGE_PROGRAM_ID,
        &vaa_data,
        solver.clone(),
        &auction_accounts,
        1__000_000, // 1 USDC (double underscore for decimal separator)
    ).await.expect("Failed to place initial offer");

    println!("Solver balance after placing initial offer: {:?}", solver.get_balance(&testing_context.test_context).await);
    
    let execute_order_fallback_accounts = ExecuteOrderFallbackAccounts::new(&auction_accounts, &initial_offer_fixture, &payer_signer.pubkey(), &fixture_accounts);
    // Try executing the order using the fallback program
    let _execute_order_fixture = execute_order_fallback(
        &testing_context.test_context,
        &payer_signer,
        &PROGRAM_ID,
        solver.clone(),
        &execute_order_fallback_accounts,
    ).await.expect("Failed to execute order");

    println!("Solver balance after executing order: {:?}", solver.get_balance(&testing_context.test_context).await);
}