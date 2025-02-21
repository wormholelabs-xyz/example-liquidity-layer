use crate::{
    composite::*,
    error::MatchingEngineError,
    state::{Auction, AuctionConfig, AuctionInfo, AuctionStatus, MessageProtocol},
    utils,
};
use anchor_lang::prelude::*;
use anchor_spl::token;
use common::{messages::{raw::LiquidityLayerMessage, FastMarketOrder}, TRANSFER_AUTHORITY_SEED_PREFIX};
use solana_sdk::program::invoke_signed_unchecked;
use wormhole_svm_shim::verify_vaa::{VerifyHash, VerifyHashData};
use common::wormhole_io::TypePrefixedPayload;
use solana_program::{keccak, instruction::Instruction, program::invoke_signed};


#[derive(Accounts)]
#[instruction(offer_price: u64)]
#[event_cpi]
pub struct PlaceInitialOfferCctpShim<'info> {
    #[account(mut)]
    payer: Signer<'info>,

    /// The auction participant needs to set approval to this PDA.
    ///
    /// CHECK: Seeds must be \["transfer-authority", auction.key(), offer_price.to_be_bytes()\].
    #[account(
        seeds = [
            TRANSFER_AUTHORITY_SEED_PREFIX,
            auction.key().as_ref(),
            &offer_price.to_be_bytes()
        ],
        bump
    )]
    transfer_authority: UncheckedAccount<'info>,

    /// NOTE: This account is only used to pause inbound auctions.
    #[account(constraint = !custodian.paused @ MatchingEngineError::Paused)]
    custodian: CheckedCustodian<'info>,

    #[account(
        constraint = {
            require_eq!(
                auction_config.id,
                custodian.auction_config_id,
                MatchingEngineError::AuctionConfigMismatch,
            );

            true
        }
    )]
    auction_config: Account<'info, AuctionConfig>,

    /// The cpi instruction will verify the hash of the fast order path so no account constraints are needed.
    fast_order_path_shim: FastOrderPathShim<'info>,

    /// This account should only be created once, and should never be changed to
    /// init_if_needed. Otherwise someone can game an existing auction.
    #[account(
        init,
        payer = payer,
        space = 8 + Auction::INIT_SPACE,
        seeds = [
            Auction::SEED_PREFIX,
            fast_order_path.fast_vaa.load_unchecked().digest().as_ref(),
        ],
        bump
    )]
    auction: Box<Account<'info, Auction>>,

    #[account(mut)]
    offer_token: Box<Account<'info, token::TokenAccount>>,

    #[account(
        init,
        payer = payer,
        token::mint = usdc,
        token::authority = auction,
        seeds = [
            crate::AUCTION_CUSTODY_TOKEN_SEED_PREFIX,
            auction.key().as_ref(),
        ],
        bump,
    )]
    auction_custody_token: Box<Account<'info, token::TokenAccount>>,

    usdc: Usdc<'info>,
    
    #[account(constraint = {
        require_eq!(
            verify_vaa_shim_program.key(),
            wormhole_svm_definitions::solana::VERIFY_VAA_SHIM_PROGRAM_ID,
            MatchingEngineError::InvalidVerifyVaaShimProgram
        );

        true
    })]
    verify_vaa_shim_program: UncheckedAccount<'info>,
    system_program: Program<'info, System>,
    token_program: Program<'info, token::Token>,
}

/// A vaa message is the serialised message body of a posted vaa. Only the fields that are required to create the digest are included.
pub struct VaaMessage(Vec<u8>);

impl VaaMessage {
    pub fn new(consistency_level: u8, vaa_time: u32, sequence: u64, emitter_chain: u16, emitter_address: [u8; 32], payload: Vec<u8>) -> Self {
        Self(VaaMessageBody::new(consistency_level, vaa_time, sequence, emitter_chain, emitter_address, payload).to_vec())
    }

    fn message_hash(&self) -> keccak::Hash {
        keccak::hashv(&[self.0.as_ref()])
    }

    pub fn digest(&self) -> [u8; 32] {
        self.message_hash().as_ref().try_into().unwrap()
    }

    fn payload(&self) -> Vec<u8> {
        // Calculate offset:
        // vaa_time (u32) = 4 bytes
        // nonce (u32) = 4 bytes
        // emitter_chain (u16) = 2 bytes
        // emitter_address = 32 bytes
        // sequence (u64) = 8 bytes
        // consistency_level (u8) = 1 byte
        // Total offset = 51 bytes
        
        // Everything after the offset is the payload
        self.0[51..].to_vec()
    }

    fn vaa_time(&self) -> u32 {
        // vaa_time is the first 4 bytes of the message
        u32::from_be_bytes(self.0[0..4].try_into().unwrap())
    }

    fn nonce(&self) -> u32 {
        // nonce is the next 4 bytes of the message
        u32::from_be_bytes(self.0[4..8].try_into().unwrap())
    }

    fn emitter_chain(&self) -> u16 {
        // emitter_chain is the next 2 bytes of the message
        u16::from_be_bytes(self.0[8..10].try_into().unwrap())
    }

    fn emitter_address(&self) -> [u8; 32] {
        // emitter_address is the next 32 bytes of the message
        self.0[10..42].try_into().unwrap()
    }

    fn sequence(&self) -> u64 {
        // sequence is the next 8 bytes of the message
        u64::from_be_bytes(self.0[42..50].try_into().unwrap())
    }
        

}

pub struct Payload(Vec<u8>);

impl Payload {
    pub fn new(amount_in: u64, min_amount_out: u64, target_chain: u16, redeemer: [u8; 32], sender: [u8; 32], refund_address: [u8; 32], max_fee: u64, init_auction_fee: u64, deadline: u32, redeemer_message: Vec<u8>) -> Self {
        let fast_market_order = FastMarketOrder {
            amount_in,
            min_amount_out,
            target_chain,
            redeemer,
            sender,
            refund_address,
            max_fee,
            init_auction_fee,
            deadline,
            redeemer_message,
        };
        Self(fast_market_order.to_vec())
    }
}

/// Just a helper struct to make the code more readable.
struct VaaMessageBody {

    /// Level of consistency requested by the emitter
    pub consistency_level: u8,

    /// Time the vaa was submitted
    pub vaa_time: u32,

    /// Account where signatures are stored
    pub vaa_signature_account: Pubkey,

    /// Time the posted message was created
    pub submission_time: u32,

    /// Unique nonce for this message
    pub nonce: u32,

    /// Sequence number of this message
    pub sequence: u64,

    /// Emitter of the message
    pub emitter_chain: u16,

    /// Emitter of the message
    pub emitter_address: [u8; 32],

    /// Message payload
    pub payload: Vec<u8>,
}

impl VaaMessageBody {
    pub fn new(consistency_level: u8, vaa_time: u32, sequence: u64, emitter_chain: u16, emitter_address: [u8; 32], payload: Vec<u8>) -> Self {
        Self {
            consistency_level,
            vaa_time,
            vaa_signature_account: Pubkey::new_unique(), // Doesn't matter for the hash
            submission_time: 0, // Doesn't matter for the hash
            nonce: 0, // Always 0
            sequence,
            emitter_chain, // Can be taken from the live router path
            emitter_address, // Can be taken from the live router path
            payload,
        }
    }

    fn to_vec(&self) -> Vec<u8> {
        vec![
            self.vaa_time.to_be_bytes().as_ref(),
            self.nonce.to_be_bytes().as_ref(),
            self.emitter_chain.to_be_bytes().as_ref(),
            &self.emitter_address,
            &self.sequence.to_be_bytes(),
            &[self.consistency_level],
            self.payload.as_ref(),
        ].concat()
    }
}

pub fn place_initial_offer_cctp_shim(
    ctx: Context<PlaceInitialOfferCctpShim>,
    offer_price: u64,
    guardian_set_bump: u8,
    vaa_message: VaaMessage,
) -> Result<()> {
    // Extract the guardian set and guardian set signatures accounts from the FastOrderPathShim.
    let FastOrderPathShim{guardian_set, guardian_set_signatures, live_router_path} = ctx.accounts.fast_order_path_shim;
    
    // Check that the VAA message corresponds to the accounts in the FastOrderPathShim.
    let from_endpoint = live_router_path.from_endpoint;
    assert_eq!(from_endpoint.chain, vaa_message.emitter_chain());
    assert_eq!(from_endpoint.address, vaa_message.emitter_address());

    let verify_hash_data = VerifyHashData::new(guardian_set_bump, vaa_message.digest());

    // Call the verify shim program using cpi to verify the hash of the shim.
    let verify_shim_ix = Instruction {
        program_id: &wormhole_svm_definitions::solana::VERIFY_VAA_SHIM_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(guardian_set.key(), false),
            AccountMeta::new(guardian_set_signatures.key(), false),
        ],
        data: verify_hash_data.to_vec(),
    };

    // Make the cpi call to verify the shim.
    invoke_signed_unchecked(&verify_shim_ix, &[
        guardian_set.to_account_info(),
        guardian_set_signatures.to_account_info(),
    ], &[&[]])?;
    
    let order = LiquidityLayerMessage::try_from(vaa_message.payload())
        .unwrap()
        .to_fast_market_order_unchecked();

    // Parse the transfer amount from the VAA.
    let amount_in = order.amount_in();

    // Saturating to u64::MAX is safe here. If the amount really ends up being this large, the
    // checked addition below will catch it.
    let security_deposit =
        order
            .max_fee()
            .saturating_add(utils::auction::compute_notional_security_deposit(
                &ctx.accounts.auction_config,
                amount_in,
            ));

    // Set up the Auction account for this auction.
    let config = &ctx.accounts.auction_config;
    let initial_offer_token = ctx.accounts.offer_token.key();
    ctx.accounts.auction.set_inner(Auction {
        bump: ctx.bumps.auction,
        vaa_hash: vaa_message.digest(),
        vaa_timestamp: vaa_message.vaa_time(),
        target_protocol: live_router_path.to_endpoint.protocol,
        status: AuctionStatus::Active,
        prepared_by: ctx.accounts.payer.key(),
        info: AuctionInfo {
            config_id: config.id,
            custody_token_bump: ctx.bumps.auction_custody_token,
            vaa_sequence: vaa_message.sequence(),
            source_chain: vaa_message.emitter_chain(),
            best_offer_token: initial_offer_token,
            initial_offer_token,
            start_slot: Clock::get().unwrap().slot,
            amount_in,
            security_deposit,
            offer_price,
            redeemer_message_len: order.redeemer_message_len(),
            destination_asset_info: Default::default(),
        }
        .into(),
    });

    let info = ctx.accounts.auction.info.as_ref().unwrap();

    // Emit event for auction participants to listen to.
    emit_cpi!(crate::utils::log_emit(crate::events::AuctionUpdated {
        config_id: info.config_id,
        fast_vaa_hash: ctx.accounts.auction.vaa_hash,
        vaa: None,
        source_chain: info.source_chain,
        target_protocol: ctx.accounts.auction.target_protocol,
        redeemer_message_len: info.redeemer_message_len,
        end_slot: info.auction_end_slot(config),
        best_offer_token: initial_offer_token,
        token_balance_before: ctx.accounts.offer_token.amount,
        amount_in,
        total_deposit: info.total_deposit(),
        max_offer_price_allowed: utils::auction::compute_min_allowed_offer(config, info)
            .checked_sub(1),
    }));

    // Finally transfer tokens from the offer authority's token account to the
    // auction's custody account.
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.offer_token.to_account_info(),
                to: ctx.accounts.auction_custody_token.to_account_info(),
                authority: ctx.accounts.transfer_authority.to_account_info(),
            },
            &[&[
                TRANSFER_AUTHORITY_SEED_PREFIX,
                ctx.accounts.auction.key().as_ref(),
                &offer_price.to_be_bytes(),
                &[ctx.bumps.transfer_authority],
            ]],
        ),
        amount_in
            .checked_add(security_deposit)
            .ok_or_else(|| MatchingEngineError::U64Overflow)?,
    )
}