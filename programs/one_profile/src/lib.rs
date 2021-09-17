use anchor_lang::prelude::*;

declare_id!("7a8sHgh2yshLfCLswwJ3wz9aLfjo5UuN1zkkscMmy9gc");


#[program]
pub mod one_profile {
    use super::*;

    // Creates an initial data record for a user
    pub fn create_data_record(
        ctx: Context<CreateDataRecord>,
        metadata_uri: String,
        namespace: String,
        _bump: u8,
    ) -> ProgramResult {
        if metadata_uri.len() > 100 {
            return Err(ErrorCode::MetadataUriOverflow.into());
        }

        let user = &ctx.accounts.user;
        let authority = &ctx.accounts.authority;

        if !check_record_permission(
            namespace.clone(),
            ctx.program_id,
            &ctx.accounts.authority_record,
            user.key,
            authority.key,
        ) {
            return Err(ErrorCode::Unauthorized.into());
        };

        let user_data_record = &mut ctx.accounts.data_record;

        user_data_record.authority = authority.key();
        user_data_record.metadata_uri = metadata_uri;
        user_data_record.last_updated = Clock::get()?.unix_timestamp;

        Ok(())
    }

    // Updates an existing data record for a user
    pub fn update_data_record(
        ctx: Context<UpdateDataRecord>,
        metadata_uri: String,
        namespace: String,
        _bump: u8,
    ) -> ProgramResult {
        if metadata_uri.len() > 100 {
            return Err(ErrorCode::MetadataUriOverflow.into());
        }

        let user = &ctx.accounts.user;
        let authority = &ctx.accounts.authority;

        if !check_record_permission(
            namespace.clone(),
            ctx.program_id,
            &ctx.accounts.authority_record,
            user.key,
            authority.key,
        ) {
            return Err(ErrorCode::Unauthorized.into());
        };

        let user_data_record = &mut ctx.accounts.data_record;

        user_data_record.authority = authority.key();
        user_data_record.metadata_uri = metadata_uri;
        user_data_record.last_updated = Clock::get()?.unix_timestamp;

        Ok(())
    }

    // Removes a data record for a user
    pub fn delete_data_record(ctx: Context<DeleteDataRecord>, namespace: String, _bump: u8) -> ProgramResult {
        if !check_record_permission(
            namespace.clone(),
            ctx.program_id,
            &ctx.accounts.authority_record,
            &ctx.accounts.user.key,
            &ctx.accounts.authority.key,
        ) {
            return Err(ErrorCode::Unauthorized.into());
        };
        Ok(())
    }

    // Creates an authority record for the user
    pub fn create_authority_record(ctx: Context<CreateAuthorityRecord>, _scope: String, _bump: u8) -> ProgramResult {
        let authority_record = &mut ctx.accounts.authority_record;
        authority_record.last_authorized = Clock::get()?.unix_timestamp;

        Ok(())
    }

    // Removes an authority record for the user, done via macros
    pub fn delete_authority_record(_ctx: Context<DeleteAuthorityRecord>, _scope: String, _bump: u8) -> ProgramResult {
        Ok(())
    }
}


/*
Accounts for creating a record. This MUST first be done by the user before updates. We need:
- The user itself (pays + signs)
- The new PDA for the user record
- The system program, which is required to create a PDA
 */
#[derive(Accounts)]
#[instruction(metadata_uri: String, namespace: String, bump: u8)]
pub struct CreateDataRecord<'info> {
    // The Program Derived account to store the record
    #[account(
    init,
    payer = authority,
    // Space needed for the user_data acct
    space = 8 + 64 + 8 + 100,
    seeds = [user.key.as_ref(), b"data".as_ref(), namespace.as_bytes()],
    bump = bump,
    )]
    pub data_record: ProgramAccount<'info, UserDataRecord>,
    // The user for whom the record is created
    pub user: AccountInfo<'info>,
    // The authority - can be the user if no external authority
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    // The authority record associated with the required permission, users need to pass one in, but it is not checked
    pub authority_record: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
}

/*
Accounts for updating a record. Essentially the same as CreateDataRecord but with different macros
on data_record
 */
#[derive(Accounts)]
#[instruction(metadata_uri: String, namespace: String, bump: u8)]
pub struct UpdateDataRecord<'info> {
    #[account(
    seeds = [user.key.as_ref(), b"data".as_ref(), namespace.as_bytes()],
    bump = bump,
    )]
    pub data_record: ProgramAccount<'info, UserDataRecord>,
    pub user: AccountInfo<'info>,
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    pub authority_record: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
}

/*
Accounts for removing a user data record
 */
#[derive(Accounts)]
#[instruction(namespace: String, bump: u8)]
pub struct DeleteDataRecord<'info> {
    // The record to be deleted
    #[account(
    mut,
    close = authority,
    seeds = [user.key.as_ref(), b"data".as_ref(), namespace.as_bytes()],
    bump = bump,
    )]
    pub data_record: ProgramAccount<'info, UserDataRecord>,
    // The user for whom the record is deleted
    pub user: AccountInfo<'info>,
    // The authority - can be the user if no external authority
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    // The authority record associated with the required permission, users need to pass one in, but it is not checked
    pub authority_record: AccountInfo<'info>,
}

/*
Accounts for adding an authority record, which MUST be done by the user
- The user itself (pays + signs)
- The new PDA for the user record, seeded by [userKey, "authorities", authorityKey, scope]
- The system program, which is required to create a PDA
 */
#[derive(Accounts)]
#[instruction(scope: String, bump: u8)]
pub struct CreateAuthorityRecord<'info> {
    // The Program Derived account to store the record
    #[account(
    init,
    payer = user,
    space = 8 + 64,
    seeds = [user.key.as_ref(), b"authorities".as_ref(), authority.key.as_ref(), scope.as_bytes()],
    bump = bump,
    )]
    pub authority_record: ProgramAccount<'info, UserAuthorityRecord>,
    // The user creating the record
    #[account(mut, signer)]
    pub user: AccountInfo<'info>,
    // Authority that the user is granting to
    #[account(mut)]
    pub authority: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
}

/*
Accounts for removing a user authority record
 */
#[derive(Accounts)]
#[instruction(scope: String, bump: u8)]
pub struct DeleteAuthorityRecord<'info> {
    // The user removing the record
    #[account(mut, signer)]
    pub user: AccountInfo<'info>,
    // The PDA record to remove
    #[account(
    mut,
    close = user,
    seeds = [user.key.as_ref(), b"authorities".as_ref(), authority.key.as_ref(), scope.as_bytes()],
    bump = bump,
    )]
    pub authority_record: ProgramAccount<'info, UserAuthorityRecord>,
    // The authority for which the record is being removed
    pub authority: AccountInfo<'info>,
}

// Data stored per user record
#[account]
pub struct UserDataRecord {
    pub authority: Pubkey,
    pub last_updated: i64,
    pub metadata_uri: String, // Most IPFS CID's are just 32 bytes, but setting max size to 100
}

// Data stored per authority record
#[account]
pub struct UserAuthorityRecord {
    pub last_authorized: i64,
}

/*
Possible error codes
 */
#[error]
pub enum ErrorCode {
    #[msg("The caller is unauthorized.")]
    Unauthorized,
    #[msg("The given metadata URI is too long to fit into storage.")]
    MetadataUriOverflow,
}

/*
Utils
 */

// Checks if the given authority can edit the given record
fn check_record_permission(
    namespace: String,
    program_id: &Pubkey,
    authority_record: &AccountInfo,
    // Keys
    user_key: &Pubkey,
    authority_key: &Pubkey,
) -> bool {
    // User always has permission
    if user_key == authority_key {
        return true;
    }

    // Authority record not initialized
    if authority_record.data_is_empty() {
        return false;
    }

    let authority_record_key = authority_record.to_account_info().key();

    // Check the "all" scope
    let all_scopes_authority_addr = Pubkey::find_program_address(
        &[
            user_key.as_ref(),
            b"authorities".as_ref(),
            authority_key.as_ref(),
            b"all".as_ref()
        ], program_id).0;

    // Has all scope
    if all_scopes_authority_addr == authority_record_key {
        return true;
    }

    // Check requested namespace
    let namespaced_scope_authority_addr = Pubkey::find_program_address(
        &[
            user_key.as_ref(),
            b"authorities".as_ref(),
            authority_key.as_ref(),
            namespace.as_bytes()
        ], program_id).0;

    if namespaced_scope_authority_addr == authority_record_key {
        return true;
    }

    false
}