import * as anchor from '@project-serum/anchor';
import { utils, web3 } from '@project-serum/anchor';
import * as assert from 'assert';

type KeyAndBump = [web3.PublicKey, number];

describe('one_profile', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  const providerWallet = provider.wallet;
  anchor.setProvider(provider);

  // Global program
  const program = anchor.workspace.OneProfile;

  // Users
  const userOne = anchor.web3.Keypair.generate();
  const userTwo = anchor.web3.Keypair.generate();

  // Authorities
  const authorityOne = anchor.web3.Keypair.generate();
  const authorityTwo = anchor.web3.Keypair.generate();

  // Namespaces
  const namespaceOne = 'n1';
  const namespaceTwo = 'n2';
  const namespaceThree = 'n3';

  // Utils
  const getDataProgramAddress = async (
    userKey: web3.PublicKey,
    namespace: string
  ): Promise<KeyAndBump> => {
    return web3.PublicKey.findProgramAddress(
      [
        userKey.toBuffer(),
        Buffer.from(utils.bytes.utf8.encode('data')),
        Buffer.from(utils.bytes.utf8.encode(namespace)),
      ],
      program.programId
    );
  };
  const getAuthorityProgramAddress = async (
    userKey: web3.PublicKey,
    authorityKey: web3.PublicKey,
    scope: string
  ): Promise<KeyAndBump> => {
    return web3.PublicKey.findProgramAddress(
      [
        userKey.toBuffer(),
        Buffer.from(anchor.utils.bytes.utf8.encode('authorities')),
        authorityKey.toBuffer(),
        Buffer.from(anchor.utils.bytes.utf8.encode(scope)),
      ],
      program.programId
    );
  };

  /*
  Init balances
   */
  it('airdrops required balances', async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(userOne.publicKey, 10000000000),
      'confirmed'
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(userTwo.publicKey, 10000000000),
      'confirmed'
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        authorityOne.publicKey,
        10000000000
      ),
      'confirmed'
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        authorityTwo.publicKey,
        10000000000
      ),
      'confirmed'
    );
  });

  /*
  Basic record creation
   */
  it('allows user to create & update a data record and create an authority record', async () => {
    // Create an authority for the user
    const [authorityPda, authorityBump] = await getAuthorityProgramAddress(
      userOne.publicKey,
      userOne.publicKey,
      'all'
    );

    await program.rpc.createAuthorityRecord('all', authorityBump, {
      accounts: {
        authorityRecord: authorityPda,
        user: userOne.publicKey,
        authority: userOne.publicKey,
        systemProgram: web3.SystemProgram.programId,
      },
      signers: [userOne],
    });

    const fetchedAuthorityRecord =
      await program.account.userAuthorityRecord.fetch(authorityPda);

    // Authority data should be populated
    assert.ok(fetchedAuthorityRecord != null);

    // Create data for the user
    const [dataPda, dataBump] = await getDataProgramAddress(
      userOne.publicKey,
      namespaceOne
    );

    await program.rpc.createDataRecord(
      'test_metadata',
      namespaceOne,
      dataBump,
      {
        accounts: {
          dataRecord: dataPda,
          user: userOne.publicKey,
          authority: userOne.publicKey,
          authorityRecord: authorityPda,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [userOne],
      }
    );

    const fetchedDataRecord = await program.account.userDataRecord.fetch(
      dataPda
    );

    assert.ok(fetchedDataRecord.metadataUri === 'test_metadata');
    assert.ok(fetchedDataRecord.authority.equals(userOne.publicKey));

    // Now try updating the data record
    await program.rpc.updateDataRecord(
      'test_metadata_updated',
      namespaceOne,
      dataBump,
      {
        accounts: {
          dataRecord: dataPda,
          user: userOne.publicKey,
          authority: userOne.publicKey,
          authorityRecord: authorityPda,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [userOne],
      }
    );

    const fetchedDataRecordUpdated = await program.account.userDataRecord.fetch(
      dataPda
    );

    assert.ok(fetchedDataRecordUpdated.metadataUri === 'test_metadata_updated');
  });

  /*
  Basic authority namespace scoping
   */
  it('allows scoped authority permissions', async () => {
    // Make an authority record that limits to a specific namespace
    const [authorityPda, authorityBump] = await getAuthorityProgramAddress(
      userOne.publicKey,
      authorityOne.publicKey,
      namespaceTwo
    );

    await program.rpc.createAuthorityRecord(namespaceTwo, authorityBump, {
      accounts: {
        authorityRecord: authorityPda,
        user: userOne.publicKey,
        authority: authorityOne.publicKey,
        systemProgram: web3.SystemProgram.programId,
      },
      signers: [userOne],
    });

    // Now try adding data within the scope - should work
    const [dataPda, dataBump] = await getDataProgramAddress(
      userOne.publicKey,
      namespaceTwo
    );

    await program.rpc.createDataRecord(
      'test_metadata',
      namespaceTwo,
      dataBump,
      {
        accounts: {
          dataRecord: dataPda,
          user: userOne.publicKey,
          authority: authorityOne.publicKey,
          authorityRecord: authorityPda,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [authorityOne],
      }
    );

    // Try adding data outside of scope - should not work
    const [unauthorizedDataPda, unauthorizedDataBump] =
      await getDataProgramAddress(userOne.publicKey, namespaceThree);

    try {
      await program.rpc.createDataRecord(
        'test_metadata',
        namespaceThree,
        unauthorizedDataBump,
        {
          accounts: {
            dataRecord: unauthorizedDataPda,
            user: userOne.publicKey,
            authority: authorityOne.publicKey,
            authorityRecord: unauthorizedDataPda,
            systemProgram: web3.SystemProgram.programId,
          },
          signers: [authorityOne],
        }
      );
      assert.fail('Authority should not be able to create records');
    } catch (err) {
      console.error(err);
      assert.equal(err.msg, 'The caller is unauthorized.');
    }
  });

  it('allows "all" scope on authorities', async () => {
    // Make another authority that has the "all" permission, this time for user 2
    const [authorityPda, authorityBump] = await getAuthorityProgramAddress(
      userTwo.publicKey,
      authorityTwo.publicKey,
      'all'
    );

    await program.rpc.createAuthorityRecord('all', authorityBump, {
      accounts: {
        authorityRecord: authorityPda,
        user: userTwo.publicKey,
        authority: authorityTwo.publicKey,
        systemProgram: web3.SystemProgram.programId,
      },
      signers: [userTwo],
    });

    // Now try to write to any namespace
    const [dataPda, dataBump] = await getDataProgramAddress(
      userTwo.publicKey,
      namespaceOne
    );
    await program.rpc.createDataRecord(
      'test_metadata',
      namespaceOne,
      dataBump,
      {
        accounts: {
          dataRecord: dataPda,
          user: userTwo.publicKey,
          authority: authorityTwo.publicKey,
          authorityRecord: authorityPda,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [authorityTwo],
      }
    );
  });

  /*
  Basic record deletion
   */
  it('allows user to delete records', async () => {
    // Previously created authority
    const [authorityPda, authorityBump] = await getAuthorityProgramAddress(
      userOne.publicKey,
      userOne.publicKey,
      'all'
    );

    // Previously created data
    const [dataPda, dataBump] = await getDataProgramAddress(
      userOne.publicKey,
      namespaceOne
    );

    await program.rpc.deleteDataRecord(namespaceOne, dataBump, {
      accounts: {
        dataRecord: dataPda,
        user: userOne.publicKey,
        authority: userOne.publicKey,
        authorityRecord: authorityPda,
      },
      signers: [userOne],
    });

    await program.rpc.deleteAuthorityRecord('all', authorityBump, {
      accounts: {
        user: userOne.publicKey,
        authority: userOne.publicKey,
        authorityRecord: authorityPda,
      },
      signers: [userOne],
    });

    try {
      await program.account.userDataRecord.fetch(dataPda);
      assert.fail('Record should not exist');
    } catch (err) {
      assert.ok(err.toString().includes('Account does not exist'));
    }

    try {
      await program.account.userAuthorityRecord.fetch(authorityPda);
      assert.fail('Record should not exist');
    } catch (err) {
      assert.ok(err.toString().includes('Account does not exist'));
    }
  });
});
