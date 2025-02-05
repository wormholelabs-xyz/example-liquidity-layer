use solana_sdk::{pubkey::Pubkey, signature::Keypair};
use anchor_spl::token::spl_token as spl_token;
use spl_token::state::Account as TokenAccount;
use solana_program_test::ProgramTest;
use serde_json::Value;
use std::fs;

/// Creates a token account for the given owner and mint
///
/// # Arguments
///
/// * `program_test` - The program test instance
/// * `payer` - The payer of the account
/// * `owner` - The owner of the account
/// * `mint` - The mint of the account
pub fn create_token_account(
    program_test: &mut ProgramTest,
    payer: &Keypair,
    owner: Option<&Keypair>,
    mint: &Pubkey,
) {
    let owner = owner.unwrap_or(&Keypair::new());

    let token_account = spl_associated_token_account::get_associated_token_address(
        owner.pubkey(),
        mint,
    );
    
}

// TODO: Seperate the function to another file, it is more general than just token account

/// Adds an account from a JSON fixture file to the program test
///
/// Loads the JSON file and parses it into a Value object that is used to extract the lamports, address, and owner values.
///
/// # Arguments
///
/// * `program_test` - The program test instance
/// * `filename` - The path to the JSON fixture file
pub fn add_account_from_file(
    program_test: &mut ProgramTest,
    filename: &str,
) {
    let token_account_address = anchor_spl::token::spl_token::ID;

    // Read the JSON file
    let data = fs::read_to_string(filename)
    .expect("Unable to read file");

    // Parse the JSON
    let json: Value = serde_json::from_str(&data)
    .expect("Unable to parse JSON");

    // Extract the lamports value
    let lamports = json["lamports"]
    .as_u64()
    .expect("lamports field not found or invalid");

    // Extract the address value
    let address: Pubkey = solana_sdk::pubkey!(json["pubkey"].as_str().unwrap());

    // Extract the owner address value
    let owner: Pubkey = solana_sdk::pubkey!(json["owner"].as_str().unwrap());

    program_test.add_account_with_file_data(address, lamports, owner, filename)
}
