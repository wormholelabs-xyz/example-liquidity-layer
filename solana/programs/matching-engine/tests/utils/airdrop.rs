use solana_program_test::ProgramTestContext;
use std::rc::Rc;
use std::cell::RefCell;
use solana_sdk::{
    pubkey::Pubkey,
    instruction::AccountMeta,
    system_instruction,
    signature::{Keypair, Signer},
};
use solana_sdk::transaction::Transaction;

pub async fn airdrop(
    test_context: &Rc<RefCell<ProgramTestContext>>,
    recipient: &Pubkey,
    amount: u64,
) {
    let mut ctx = test_context.borrow_mut();
    
    // Create the transfer instruction with values from the context
    let transfer_ix = system_instruction::transfer(
        &ctx.payer.pubkey(),
        recipient,
        amount,
    );

    // Create and send transaction
    let mut tx = Transaction::new_signed_with_payer(
        &[transfer_ix.clone()],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        ctx.last_blockhash,
    );

    // Process with retries
    for _ in 0..5 {
        match ctx.banks_client.process_transaction(tx.clone()).await {
            Ok(_) => break,
            Err(e) => {
                println!("Airdrop failed: {:?}, retrying...", e);
                ctx.last_blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
                tx = Transaction::new_signed_with_payer(
                    &[transfer_ix.clone()],
                    Some(&ctx.payer.pubkey()),
                    &[&ctx.payer],
                    ctx.last_blockhash,
                );
            }
        }
    }
}