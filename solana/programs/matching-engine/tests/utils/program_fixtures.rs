use solana_program_test::ProgramTest;
use solana_sdk::pubkey::Pubkey;
use solana_program::bpf_loader_upgradeable;

use super::TOKEN_ROUTER_PID;

fn get_program_data(owner: Pubkey) -> Vec<u8> {
    let state = solana_sdk::bpf_loader_upgradeable::UpgradeableLoaderState::ProgramData {
        slot: 0,
        upgrade_authority_address: Some(owner),
    };
    bincode::serialize(&state).unwrap()
}

/// Initialise the upgrade manager program
/// 
/// Returns the program data pubkey
pub fn initialise_upgrade_manager(program_test: &mut ProgramTest, program_id: &Pubkey, owner_pubkey: Pubkey) -> Pubkey {
    let program_data_pubkey = Pubkey::find_program_address(
        &[program_id.as_ref()],
        &bpf_loader_upgradeable::id(),
    ).0;

    // Add the program data to the program test
    // Compute lamports from length of program data
    let program_data_data = get_program_data(owner_pubkey.clone());

    let lamports = solana_sdk::rent::Rent::default().minimum_balance(program_data_data.len());
    let account = solana_sdk::account::Account {
        lamports,
        data: program_data_data,
        owner: bpf_loader_upgradeable::id(),
        executable: false,
        rent_epoch: u64::MAX,
    };

    program_test.add_account(program_data_pubkey, account);
    program_test.add_program("upgrade_manager", common::UPGRADE_MANAGER_PROGRAM_ID, None);

    program_data_pubkey
}

pub fn initialise_cctp_token_messenger_minter(program_test: &mut ProgramTest, owner_pubkey: Pubkey) {
    let program_id = solana_program::pubkey!("CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3");
    program_test.add_program("mainnet_cctp_token_messenger_minter", program_id, None);
}

pub fn initialise_wormhole_core_bridge(program_test: &mut ProgramTest, owner_pubkey: Pubkey) {
    let program_id = solana_program::pubkey!("worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth");
    program_test.add_program("mainnet_core_bridge", program_id, None);
}

pub fn initialise_cctp_message_transmitter(program_test: &mut ProgramTest, owner_pubkey: Pubkey) {
    let program_id = solana_program::pubkey!("CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd");
    program_test.add_program("mainnet_cctp_message_transmitter", program_id, None);
}

pub fn initialise_local_token_router(program_test: &mut ProgramTest, owner_pubkey: Pubkey) {
    let program_id = TOKEN_ROUTER_PID;
    program_test.add_program("token_router", program_id, None);
}