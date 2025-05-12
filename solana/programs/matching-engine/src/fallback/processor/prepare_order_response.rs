use std::io::Cursor;

use super::{
    helpers::{create_account_reliably, VaaMessageBodyHeader},
    FallbackMatchingEngineInstruction,
};
use crate::{
    fallback::helpers::{create_usdc_token_account_reliably, require_min_account_infos_len},
    state::{
        Custodian, MessageProtocol, PreparedOrderResponse, PreparedOrderResponseInfo,
        PreparedOrderResponseSeeds,
    },
    CCTP_MINT_RECIPIENT, ID,
};
use anchor_lang::prelude::*;
use anchor_spl::token::spl_token;
use common::{
    messages::SlowOrderResponse,
    wormhole_cctp_solana::{
        cctp::message_transmitter_program, cpi::ReceiveMessageArgs, messages::Deposit,
        utils::CctpMessage,
    },
    wormhole_io::TypePrefixedPayload,
    USDC_MINT,
};
use ruint::aliases::U256;
use solana_program::{instruction::Instruction, keccak, program::invoke_signed_unchecked};
use wormhole_io::WriteableBytes;
use wormhole_svm_shim::verify_vaa::{VerifyHash, VerifyHashAccounts, VerifyHashData};

use crate::error::MatchingEngineError;

#[derive(borsh::BorshDeserialize, borsh::BorshSerialize)]
pub struct PrepareOrderResponseCctpShimData {
    pub encoded_cctp_message: Vec<u8>,
    pub cctp_attestation: Vec<u8>,
    pub finalized_vaa_message_args: FinalizedVaaMessageArgs,
}

#[derive(borsh::BorshDeserialize, borsh::BorshSerialize)]
pub struct FinalizedVaaMessageArgs {
    pub base_fee: u64, // Can also get from deposit payload
    pub consistency_level: u8,
    pub guardian_set_bump: u8,
}

impl FinalizedVaaMessageArgs {
    // TODO: Change return type to keccak::Hash
    pub fn digest(
        &self,
        vaa_message_body_header: VaaMessageBodyHeader,
        deposit_vaa_payload: Deposit,
    ) -> [u8; 32] {
        let message_hash = keccak::hashv(&[
            vaa_message_body_header.timestamp.to_be_bytes().as_ref(),
            [0, 0, 0, 0].as_ref(), // 0 nonce
            vaa_message_body_header.emitter_chain.to_be_bytes().as_ref(),
            &vaa_message_body_header.emitter_address,
            &vaa_message_body_header.sequence.to_be_bytes(),
            &[vaa_message_body_header.consistency_level],
            deposit_vaa_payload.to_vec().as_ref(),
        ]);
        // Digest is the hash of the message
        keccak::hashv(&[message_hash.as_ref()]).0
    }
}

impl PrepareOrderResponseCctpShimData {
    pub fn from_bytes(data: &[u8]) -> Option<Self> {
        Self::try_from_slice(data).ok()
    }

    pub fn to_receive_message_args(&self) -> ReceiveMessageArgs {
        let mut encoded_message = Vec::with_capacity(self.encoded_cctp_message.len());
        encoded_message.extend_from_slice(&self.encoded_cctp_message);
        let mut cctp_attestation = Vec::with_capacity(self.cctp_attestation.len());
        cctp_attestation.extend_from_slice(&self.cctp_attestation);
        ReceiveMessageArgs {
            encoded_message,
            attestation: cctp_attestation,
        }
    }
}

pub struct PrepareOrderResponseCctpShimAccounts<'ix> {
    pub signer: &'ix Pubkey,                                      // 0
    pub custodian: &'ix Pubkey,                                   // 1
    pub fast_market_order: &'ix Pubkey,                           // 2
    pub from_endpoint: &'ix Pubkey,                               // 3
    pub to_endpoint: &'ix Pubkey,                                 // 4
    pub prepared_order_response: &'ix Pubkey,                     // 5
    pub prepared_custody_token: &'ix Pubkey,                      // 6
    pub base_fee_token: &'ix Pubkey,                              // 7
    pub usdc: &'ix Pubkey,                                        // 8
    pub cctp_mint_recipient: &'ix Pubkey,                         // 9
    pub cctp_message_transmitter_authority: &'ix Pubkey,          // 10
    pub cctp_message_transmitter_config: &'ix Pubkey,             // 11
    pub cctp_used_nonces: &'ix Pubkey,                            // 12
    pub cctp_message_transmitter_event_authority: &'ix Pubkey,    // 13
    pub cctp_token_messenger: &'ix Pubkey,                        // 14
    pub cctp_remote_token_messenger: &'ix Pubkey,                 // 15
    pub cctp_token_minter: &'ix Pubkey,                           // 16
    pub cctp_local_token: &'ix Pubkey,                            // 17
    pub cctp_token_pair: &'ix Pubkey,                             // 18
    pub cctp_token_messenger_minter_custody_token: &'ix Pubkey,   // 19
    pub cctp_token_messenger_minter_event_authority: &'ix Pubkey, // 20
    pub cctp_token_messenger_minter_program: &'ix Pubkey,         // 21
    pub cctp_message_transmitter_program: &'ix Pubkey,            // 22
    pub guardian_set: &'ix Pubkey,                                // 23
    pub guardian_set_signatures: &'ix Pubkey,                     // 24
    // TODO: Remove these
    pub verify_shim_program: &'ix Pubkey, // 25
    pub token_program: &'ix Pubkey,       // 26
    pub system_program: &'ix Pubkey,      // 27
}

pub struct PrepareOrderResponseCctpShim<'ix> {
    pub program_id: &'ix Pubkey,
    pub accounts: PrepareOrderResponseCctpShimAccounts<'ix>,
    pub data: PrepareOrderResponseCctpShimData,
}

impl<'ix> PrepareOrderResponseCctpShim<'ix> {
    pub fn instruction(self) -> Instruction {
        let PrepareOrderResponseCctpShimAccounts {
            signer,
            custodian,
            fast_market_order,
            from_endpoint,
            to_endpoint,
            prepared_order_response,
            prepared_custody_token,
            base_fee_token,
            usdc,
            cctp_mint_recipient,
            cctp_message_transmitter_authority,
            cctp_message_transmitter_config,
            cctp_used_nonces,
            cctp_message_transmitter_event_authority,
            cctp_token_messenger,
            cctp_remote_token_messenger,
            cctp_token_minter,
            cctp_local_token,
            cctp_token_pair,
            cctp_token_messenger_minter_custody_token,
            cctp_token_messenger_minter_event_authority,
            cctp_token_messenger_minter_program,
            cctp_message_transmitter_program,
            guardian_set,
            guardian_set_signatures,
            verify_shim_program: _,
            token_program: _,
            system_program: _,
        } = self.accounts;
        Instruction {
            program_id: *self.program_id,
            accounts: vec![
                AccountMeta::new(*signer, true),
                AccountMeta::new_readonly(*custodian, false),
                AccountMeta::new_readonly(*fast_market_order, false),
                AccountMeta::new_readonly(*from_endpoint, false),
                AccountMeta::new_readonly(*to_endpoint, false),
                AccountMeta::new(*prepared_order_response, false),
                AccountMeta::new(*prepared_custody_token, false),
                AccountMeta::new_readonly(*base_fee_token, false),
                AccountMeta::new_readonly(*usdc, false),
                AccountMeta::new(*cctp_mint_recipient, false),
                AccountMeta::new_readonly(*cctp_message_transmitter_authority, false),
                AccountMeta::new_readonly(*cctp_message_transmitter_config, false),
                AccountMeta::new(*cctp_used_nonces, false),
                AccountMeta::new_readonly(*cctp_message_transmitter_event_authority, false),
                AccountMeta::new_readonly(*cctp_token_messenger, false),
                AccountMeta::new_readonly(*cctp_remote_token_messenger, false),
                AccountMeta::new_readonly(*cctp_token_minter, false),
                AccountMeta::new(*cctp_local_token, false),
                AccountMeta::new_readonly(*cctp_token_pair, false),
                AccountMeta::new(*cctp_token_messenger_minter_custody_token, false),
                AccountMeta::new_readonly(*cctp_token_messenger_minter_event_authority, false),
                AccountMeta::new_readonly(*cctp_token_messenger_minter_program, false),
                AccountMeta::new_readonly(*cctp_message_transmitter_program, false),
                AccountMeta::new_readonly(*guardian_set, false),
                AccountMeta::new_readonly(*guardian_set_signatures, false),
                AccountMeta::new_readonly(
                    wormhole_svm_definitions::solana::VERIFY_VAA_SHIM_PROGRAM_ID,
                    false,
                ),
                AccountMeta::new_readonly(spl_token::ID, false),
                AccountMeta::new_readonly(solana_program::system_program::ID, false),
            ],
            data: FallbackMatchingEngineInstruction::PrepareOrderResponseCctpShim(self.data)
                .to_vec(),
        }
    }
}

pub fn prepare_order_response_cctp_shim(
    accounts: &[AccountInfo],
    data: PrepareOrderResponseCctpShimData,
) -> Result<()> {
    let program_id = &ID;
    require_min_account_infos_len(accounts, 27)?;

    let signer = &accounts[0];

    let cctp_account_infos = &accounts[9..23];

    // Load the fast market order account and check the owner
    let fast_market_order = &accounts[2];
    let fast_market_order_zero_copy =
        super::helpers::try_fast_market_order_account(fast_market_order)?;
    // Create pdas for addresses that need to be created
    // Check the prepared order response account is valid
    let fast_market_order_digest = fast_market_order_zero_copy.digest();

    // Check custodian owner and that it deserializes correctly
    let custodian = &accounts[1];
    let _checked_custodian = super::helpers::try_custodian_account(custodian, false)?;
    // Deserialize the to_endpoint account

    let from_endpoint = &accounts[3];
    let to_endpoint = &accounts[4];
    let (to_endpoint_router, from_endpoint_router) =
        super::helpers::try_live_endpoint_accounts_path(to_endpoint, from_endpoint)?;

    // Check usdc mint
    super::helpers::try_usdc_account(&accounts[8])?;

    // Check that the to endpoint protocol is cctp or local
    require!(
        matches!(
            to_endpoint_router.protocol,
            MessageProtocol::Cctp { .. } | MessageProtocol::Local { .. }
        ),
        MatchingEngineError::InvalidEndpoint
    );

    // Check that to endpoint chain is equal to the fast_market_order target_chain
    require_eq!(
        to_endpoint_router.chain,
        fast_market_order_zero_copy.target_chain,
        MatchingEngineError::InvalidTargetRouter
    );

    // Check the base token fee key is not equal to the prepared custody token key
    // TODO: Check that base fee token is actually a token account
    let prepared_custody_token = &accounts[6];
    let base_fee_token = &accounts[7];
    require_neq!(
        base_fee_token.key,
        prepared_custody_token.key,
        MatchingEngineError::InvalidBaseFeeToken
    );

    let finalized_vaa_message_args = &data.finalized_vaa_message_args;
    let receive_message_args = data.to_receive_message_args();

    // Construct the finalized vaa message digest data
    let finalized_vaa_message_digest = {
        let cctp_message = CctpMessage::parse(&receive_message_args.encoded_message)
            .map_err(|_| MatchingEngineError::InvalidCctpMessage)?;
        let finalized_vaa_timestamp = fast_market_order_zero_copy.vaa_timestamp;
        let finalized_vaa_sequence = fast_market_order_zero_copy.vaa_sequence.saturating_sub(1);
        let finalized_vaa_emitter_chain = fast_market_order_zero_copy.vaa_emitter_chain;
        let finalized_vaa_emitter_address = fast_market_order_zero_copy.vaa_emitter_address;
        let finalized_vaa_consistency_level = finalized_vaa_message_args.consistency_level;
        let slow_order_response = SlowOrderResponse {
            base_fee: finalized_vaa_message_args.base_fee,
        };
        let deposit_vaa_payload = Deposit {
            token_address: USDC_MINT.to_bytes(),
            amount: U256::from(fast_market_order_zero_copy.amount_in),
            source_cctp_domain: cctp_message.source_domain(),
            destination_cctp_domain: cctp_message.destination_domain(),
            cctp_nonce: cctp_message.nonce(),
            burn_source: from_endpoint_router.mint_recipient,
            mint_recipient: CCTP_MINT_RECIPIENT.to_bytes(),
            payload: WriteableBytes::new(slow_order_response.to_vec()),
        };

        finalized_vaa_message_args.digest(
            VaaMessageBodyHeader::new(
                finalized_vaa_consistency_level,
                finalized_vaa_timestamp,
                finalized_vaa_sequence,
                finalized_vaa_emitter_chain,
                finalized_vaa_emitter_address,
            ),
            deposit_vaa_payload,
        )
    };

    // Verify deposit message shim using verify shim program

    // Start verify deposit message vaa shim
    // ------------------------------------------------------------------------------------------------
    let guardian_set = &accounts[23];
    let guardian_set_signatures = &accounts[24];
    let guardian_set_bump = finalized_vaa_message_args.guardian_set_bump;

    let verify_hash_data = VerifyHashData::new(
        guardian_set_bump,
        keccak::Hash::new_from_array(finalized_vaa_message_digest),
    );

    let verify_hash_accounts = VerifyHashAccounts {
        guardian_set: guardian_set.key,
        guardian_signatures: guardian_set_signatures.key,
    };

    let verify_hash_ix = VerifyHash {
        program_id: &wormhole_svm_definitions::solana::VERIFY_VAA_SHIM_PROGRAM_ID,
        accounts: verify_hash_accounts,
        data: verify_hash_data,
    }
    .instruction();

    invoke_signed_unchecked(&verify_hash_ix, accounts, &[])?;
    // End verify deposit message vaa shim
    // ------------------------------------------------------------------------------------------------

    // Start create prepared order response account
    // ------------------------------------------------------------------------------------------------

    // Write to the prepared slow order account, which will be closed by one of the following
    // instructions:
    // * settle_auction_active_cctp
    // * settle_auction_complete
    // * settle_auction_none

    let prepared_order_response_seeds = [
        PreparedOrderResponse::SEED_PREFIX,
        &fast_market_order_digest,
    ];

    let (expected_prepared_order_response_key, prepared_order_response_bump) =
        Pubkey::find_program_address(&prepared_order_response_seeds, program_id);

    let prepared_custody_token_seeds = [
        crate::PREPARED_CUSTODY_TOKEN_SEED_PREFIX,
        expected_prepared_order_response_key.as_ref(),
    ];

    let (prepared_custody_token_pda, prepared_custody_token_bump) =
        Pubkey::find_program_address(&prepared_custody_token_seeds, program_id);

    // Check that the prepared custody token pda is equal to the prepared custody token account key
    require_keys_eq!(
        prepared_custody_token_pda,
        *prepared_custody_token.key,
        MatchingEngineError::InvalidPda
    );

    let create_prepared_order_respone_seeds = [
        PreparedOrderResponse::SEED_PREFIX,
        &fast_market_order_digest,
        &[prepared_order_response_bump],
    ];

    let prepared_order_response = &accounts[5];

    let prepared_order_response_signer_seeds = &[&create_prepared_order_respone_seeds[..]];
    let prepared_order_response_account_space = PreparedOrderResponse::compute_size(
        fast_market_order_zero_copy.redeemer_message_length.into(),
    );
    create_account_reliably(
        &signer.key,
        &expected_prepared_order_response_key,
        prepared_order_response.lamports(),
        prepared_order_response_account_space,
        accounts,
        program_id,
        prepared_order_response_signer_seeds,
    )?;
    // Write the prepared order response account data ...
    let prepared_order_response_account_to_write = PreparedOrderResponse {
        seeds: PreparedOrderResponseSeeds {
            fast_vaa_hash: fast_market_order_digest,
            bump: prepared_order_response_bump,
        },
        info: PreparedOrderResponseInfo {
            prepared_by: *signer.key,
            base_fee_token: *base_fee_token.key,
            source_chain: fast_market_order_zero_copy.vaa_emitter_chain,
            base_fee: finalized_vaa_message_args.base_fee,
            fast_vaa_timestamp: fast_market_order_zero_copy.vaa_timestamp,
            amount_in: fast_market_order_zero_copy.amount_in,
            sender: fast_market_order_zero_copy.sender,
            redeemer: fast_market_order_zero_copy.redeemer,
            init_auction_fee: fast_market_order_zero_copy.init_auction_fee,
        },
        to_endpoint: to_endpoint_router.info,
        redeemer_message: fast_market_order_zero_copy.redeemer_message
            [..usize::from(fast_market_order_zero_copy.redeemer_message_length)]
            .to_vec(),
    };
    // Use cursor in order to write the prepared order response account data
    let prepared_order_response_data: &mut [u8] = &mut prepared_order_response
        .try_borrow_mut_data()
        .map_err(|_| MatchingEngineError::AccountNotWritable)?;
    let mut cursor = Cursor::new(prepared_order_response_data);
    prepared_order_response_account_to_write
        .try_serialize(&mut cursor)
        .map_err(|_| MatchingEngineError::BorshDeserializationError)?;
    // End create prepared order response account
    // ------------------------------------------------------------------------------------------------

    // Start create prepared custody token account
    // ------------------------------------------------------------------------------------------------
    let create_prepared_custody_token_seeds = [
        crate::PREPARED_CUSTODY_TOKEN_SEED_PREFIX,
        expected_prepared_order_response_key.as_ref(),
        &[prepared_custody_token_bump],
    ];

    let prepared_custody_token_signer_seeds = &[&create_prepared_custody_token_seeds[..]];
    create_usdc_token_account_reliably(
        &signer.key,
        &prepared_custody_token_pda,
        &expected_prepared_order_response_key,
        prepared_custody_token.lamports(),
        accounts,
        prepared_custody_token_signer_seeds,
    )?;

    // End create prepared custody token account
    // ------------------------------------------------------------------------------------------------
    let cctp_mint_recipient = &cctp_account_infos[0];
    require_keys_eq!(
        *cctp_mint_recipient.key,
        CCTP_MINT_RECIPIENT,
        MatchingEngineError::InvalidMintRecipient
    );
    let cctp_message_transmitter_authority = &cctp_account_infos[1];
    let cctp_message_transmitter_config = &cctp_account_infos[2];
    let cctp_used_nonces = &cctp_account_infos[3];
    let cctp_message_transmitter_event_authority = &cctp_account_infos[4];
    let cctp_token_messenger = &cctp_account_infos[5];
    let cctp_remote_token_messenger = &cctp_account_infos[6];
    let cctp_token_minter = &cctp_account_infos[7];
    let cctp_local_token = &cctp_account_infos[8];
    let cctp_token_pair = &cctp_account_infos[9];
    let cctp_token_messenger_minter_custody_token = &cctp_account_infos[10];
    let cctp_token_messenger_minter_event_authority = &cctp_account_infos[11];
    let cctp_token_messenger_minter_program = &cctp_account_infos[12];
    let cctp_message_transmitter_program = &cctp_account_infos[13];
    let token_program = &accounts[26];
    let system_program = &accounts[27];
    // Create cpi context for verify_vaa_and_mint
    message_transmitter_program::cpi::receive_token_messenger_minter_message(
        CpiContext::new_with_signer(
            cctp_message_transmitter_program.to_account_info(),
            message_transmitter_program::cpi::ReceiveTokenMessengerMinterMessage {
                payer: signer.to_account_info(),
                caller: custodian.to_account_info(),
                message_transmitter_authority: cctp_message_transmitter_authority.to_account_info(),
                message_transmitter_config: cctp_message_transmitter_config.to_account_info(),
                used_nonces: cctp_used_nonces.to_account_info(),
                token_messenger_minter_program: cctp_token_messenger_minter_program
                    .to_account_info(),
                system_program: system_program.to_account_info(),
                message_transmitter_event_authority: cctp_message_transmitter_event_authority
                    .to_account_info(),
                message_transmitter_program: cctp_message_transmitter_program.to_account_info(),
                token_messenger: cctp_token_messenger.to_account_info(),
                remote_token_messenger: cctp_remote_token_messenger.to_account_info(),
                token_minter: cctp_token_minter.to_account_info(),
                local_token: cctp_local_token.to_account_info(),
                token_pair: cctp_token_pair.to_account_info(),
                mint_recipient: cctp_mint_recipient.to_account_info(),
                custody_token: cctp_token_messenger_minter_custody_token.to_account_info(),
                token_program: token_program.to_account_info(),
                token_messenger_minter_event_authority: cctp_token_messenger_minter_event_authority
                    .to_account_info(),
            },
            &[Custodian::SIGNER_SEEDS],
        ),
        receive_message_args,
    )?;

    // Finally transfer minted via CCTP to prepared custody token.
    let transfer_ix = spl_token::instruction::transfer(
        &spl_token::ID,
        &cctp_mint_recipient.key,
        &prepared_custody_token.key,
        &custodian.key,
        &[], // Apparently this is only for multi-sig accounts
        fast_market_order_zero_copy.amount_in,
    )
    .unwrap();

    invoke_signed_unchecked(&transfer_ix, accounts, &[Custodian::SIGNER_SEEDS])
        .map_err(|_| MatchingEngineError::TokenTransferFailed)?;

    Ok(())
}
