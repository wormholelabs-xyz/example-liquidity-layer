use solana_program_test::{ProgramTest, ProgramTestContext, tokio};
use solana_sdk::{
    pubkey::Pubkey, signature::{Keypair, Signer},
};
use std::rc::Rc;
use std::cell::RefCell;

mod utils;
use utils::{router::add_local_router_endpoint_ix, token_account::{create_token_account, read_keypair_from_file, TokenAccountFixture}, Chain};
use utils::mint::MintFixture;
use utils::program_fixtures::{initialise_upgrade_manager, initialise_cctp_token_messenger_minter, initialise_wormhole_core_bridge, initialise_cctp_message_transmitter, initialise_local_token_router};
use utils::airdrop::airdrop;
use utils::initialize::initialize_program;
use utils::account_fixtures::FixtureAccounts;
use utils::router::add_cctp_router_endpoint_ix;

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

pub struct Solver {
    pub actor: TestingActor,
    pub endpoint: Option<String>,
}

impl Solver {
    pub fn new(keypair: Rc<Keypair>, token_account: Option<TokenAccountFixture>, endpoint: Option<String>) -> Self {
        Self { actor: TestingActor::new(keypair, token_account), endpoint }
    }

    pub fn get_endpoint(&self) -> Option<String> {
        self.endpoint.clone()
    }   
    
    pub fn keypair(&self) -> Rc<Keypair> {
        self.actor.keypair.clone()
    }

    pub fn pubkey(&self) -> Pubkey {
        self.actor.keypair.pubkey()
    }
}

pub struct TestingActor {
    pub keypair: Rc<Keypair>,
    pub token_account: Option<TokenAccountFixture>,
}

impl std::fmt::Debug for TestingActor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "TestingActor {{ pubkey: {:?}, token_account: {:?} }}", self.keypair.pubkey(), self.token_account)
    }
}

impl TestingActor {
    pub fn new(keypair: Rc<Keypair>, token_account: Option<TokenAccountFixture>) -> Self {
        Self { keypair, token_account }
    }
    pub fn pubkey(&self) -> Pubkey {
        self.keypair.pubkey()
    }
    pub fn keypair(&self) -> Rc<Keypair> {
        self.keypair.clone()
    }

    pub fn token_account_address(&self) -> Option<Pubkey> {
        self.token_account.as_ref().map(|t| t.address)
    }
}

pub struct TestingActors {
    pub owner: TestingActor,
    pub owner_assistant: TestingActor,
    pub fee_recipient: TestingActor,
    pub relayer: TestingActor,
    pub solvers: Vec<Solver>,
    pub liquidator: TestingActor,
}

impl TestingActors {
    pub fn new() -> Self {
        let owner_kp = Rc::new(read_keypair_from_file(OWNER_KEYPAIR_PATH));
        let owner = TestingActor::new(owner_kp.clone(), None);
        let owner_assistant = TestingActor::new(owner_kp.clone(), None);
        let fee_recipient = TestingActor::new(Rc::new(Keypair::new()), None);
        let relayer = TestingActor::new(Rc::new(Keypair::new()), None);
        // TODO: Change player 1 solver to use the keyfile
        let mut solvers = vec![];
        solvers.extend(vec![
            Solver::new(Rc::new(Keypair::new()), None, None),
            Solver::new(Rc::new(Keypair::new()), None, None),
            Solver::new(Rc::new(Keypair::new()), None, None),
        ]);
        let liquidator = TestingActor::new(Rc::new(Keypair::new()), None);
        Self { owner, owner_assistant, fee_recipient, relayer, solvers, liquidator }
    }

    pub fn token_account_actors(&mut self) -> Vec<&mut TestingActor> {
        let mut actors = Vec::new();
        actors.push(&mut self.fee_recipient);
        for solver in &mut self.solvers {
            actors.push(&mut solver.actor);
        }
        actors.push(&mut self.liquidator);
        actors
    }

    /// Transfer Lamports to Executors
    async fn airdrop_all(&self, test_context: &Rc<RefCell<ProgramTestContext>>) {
        airdrop(test_context, &self.owner.pubkey(), 10000000000).await;
        airdrop(test_context, &self.owner_assistant.pubkey(), 10000000000).await;
        airdrop(test_context, &self.fee_recipient.pubkey(), 10000000000).await;
        airdrop(test_context, &self.relayer.pubkey(), 10000000000).await;
        for solver in self.solvers.iter() {
            airdrop(test_context, &solver.pubkey(), 10000000000).await;
        }
        airdrop(test_context, &self.liquidator.pubkey(), 10000000000).await;
    }
    
    /// Set up ATAs for Various Owners
    async fn create_atas(&mut self, test_context: &Rc<RefCell<ProgramTestContext>>) {
        for actor in self.token_account_actors() {
            let usdc_ata = create_token_account(test_context.clone(), &actor.keypair(), &USDC_MINT_ADDRESS).await;
            actor.token_account = Some(usdc_ata);
        }
    }
}

pub struct TestingContext {
    pub program_data_account: Pubkey, // Move this into something smarter
    pub testing_actors: TestingActors,
    pub test_context: Rc<RefCell<ProgramTestContext>>,
    pub fixture_accounts: Option<FixtureAccounts>,
}

pub async fn setup_test_context() -> TestingContext {
    let mut program_test = ProgramTest::new(
        "matching_engine",  // Replace with your program name
        PROGRAM_ID,
        None,
    );
    program_test.set_compute_max_units(1000000000);
    program_test.set_transaction_account_lock_limit(1000);

    // Setup Testing Actors
    let mut testing_actors = TestingActors::new();

    // Initialise Upgrade Manager
    let program_data = initialise_upgrade_manager(&mut program_test, &PROGRAM_ID, testing_actors.owner.pubkey());
    initialise_cctp_token_messenger_minter(&mut program_test, testing_actors.owner.pubkey());
    initialise_wormhole_core_bridge(&mut program_test, testing_actors.owner.pubkey());
    initialise_cctp_message_transmitter(&mut program_test, testing_actors.owner.pubkey());
    initialise_local_token_router(&mut program_test, testing_actors.owner.pubkey());

    // Initialise Account Fixtures
    let account_fixtures = FixtureAccounts::new(&mut program_test);

    // Add lookup table accounts
    FixtureAccounts::add_lookup_table_hack(&mut program_test);

    // Start and get test context
    let test_context = Rc::new(RefCell::new(program_test.start_with_context().await));
    
    // Airdrop to all actors
    testing_actors.airdrop_all(&test_context).await;

    // Create USDC mint
    let _mint_fixture = MintFixture::new_from_file(&test_context, USDC_MINT_FIXTURE_PATH);

    // Create USDC ATAs for all actors that need them
    testing_actors.create_atas(&test_context).await;

    TestingContext { program_data_account: program_data, testing_actors, test_context, fixture_accounts: Some(account_fixtures) }
}

    
#[tokio::test]
pub async fn test_initialize_program() {
    
    let testing_context = setup_test_context().await;
    
    let initialize_fixture = initialize_program(&testing_context, PROGRAM_ID, USDC_MINT_ADDRESS, CCTP_MINT_RECIPIENT).await;

    // Check that custodian data corresponds to the expected values
    initialize_fixture.verify_custodian(testing_context.testing_actors.owner.pubkey(), testing_context.testing_actors.owner_assistant.pubkey(), testing_context.testing_actors.fee_recipient.pubkey(), testing_context.testing_actors.fee_recipient.token_account.unwrap().address);
}


#[tokio::test]
pub async fn test_cctp_token_router_endpoint_creation() {
    let testing_context = setup_test_context().await;

    let initialize_fixture = initialize_program(&testing_context, PROGRAM_ID, USDC_MINT_ADDRESS, CCTP_MINT_RECIPIENT).await;

    // Create a token router endpoint for the arbitrum chain
    let arb_chain = Chain::Arbitrum;
    
    let fixture_accounts = testing_context.fixture_accounts.expect("Pre-made fixture accounts not found");
    let arb_remote_token_messenger = fixture_accounts.arbitrum_remote_token_messenger;

    let usdc_mint_address = USDC_MINT_ADDRESS;
    
    let arbitrum_token_router_endpoint = add_cctp_router_endpoint_ix(
        &testing_context.test_context,
        testing_context.testing_actors.owner.pubkey(),
        initialize_fixture.custodian_address,
        testing_context.testing_actors.owner.keypair().as_ref(),
        PROGRAM_ID,
        arb_remote_token_messenger,
        usdc_mint_address,
        arb_chain,
    ).await;
    assert_eq!(arbitrum_token_router_endpoint.info.chain, arb_chain.to_chain_id());

    // Create a token router endpoint for the ethereum chain
    let eth_chain = Chain::Ethereum;
    let eth_remote_token_messenger = fixture_accounts.ethereum_remote_token_messenger;

    let eth_token_router_endpoint = add_cctp_router_endpoint_ix(
        &testing_context.test_context,
        testing_context.testing_actors.owner.pubkey(),
        initialize_fixture.custodian_address,
        testing_context.testing_actors.owner.keypair().as_ref(),
        PROGRAM_ID,
        eth_remote_token_messenger,
        usdc_mint_address,
        eth_chain,
    ).await;
    assert_eq!(eth_token_router_endpoint.info.chain, eth_chain.to_chain_id());
}

#[tokio::test]
pub async fn test_local_token_router_endpoint_creation() {
    let testing_context = setup_test_context().await;

    let initialize_fixture = initialize_program(&testing_context, PROGRAM_ID, USDC_MINT_ADDRESS, CCTP_MINT_RECIPIENT).await;
    let fixture_accounts = testing_context.fixture_accounts.expect("Pre-made fixture accounts not found");
    let local_custody_token = fixture_accounts.usdc_local_token;

    let usdc_mint_address = USDC_MINT_ADDRESS;

    let local_token_router_endpoint = add_local_router_endpoint_ix(
        &testing_context.test_context,
        testing_context.testing_actors.owner.pubkey(),
        initialize_fixture.custodian_address,
        testing_context.testing_actors.owner.keypair().as_ref(),
        PROGRAM_ID,
        &usdc_mint_address,
    ).await;

    assert_eq!(local_token_router_endpoint.info.chain, Chain::Solana.to_chain_id());
}
