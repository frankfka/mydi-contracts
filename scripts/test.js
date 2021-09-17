const anchor = require('@project-serum/anchor');

// Configure the local cluster.
const provider = anchor.Provider.local('https://api.devnet.solana.com');
anchor.setProvider(provider);

// Read the generated IDL.
const idl = JSON.parse(
  require('fs').readFileSync('./target/idl/one_profile.json', 'utf8')
);

// Address of the deployed program.
const programId = new anchor.web3.PublicKey(
  '7a8sHgh2yshLfCLswwJ3wz9aLfjo5UuN1zkkscMmy9gc'
);

// Generate the program client from IDL.
const program = new anchor.Program(idl, programId, provider);

console.log(program.programId.toString());

// Util fn
const getAuthorityProgramAddress = async (userKey, authorityKey, scope) => {
  return anchor.web3.PublicKey.findProgramAddress(
    [
      userKey.toBuffer(),
      Buffer.from(anchor.utils.bytes.utf8.encode('authorities')),
      authorityKey.toBuffer(),
      Buffer.from(anchor.utils.bytes.utf8.encode(scope)),
    ],
    program.programId
  );
};

async function main() {
  const userOne = anchor.web3.Keypair.generate();

  await provider.connection.confirmTransaction(
    await provider.connection.requestAirdrop(userOne.publicKey, 10000000000),
    'confirmed'
  );

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
      systemProgram: anchor.web3.SystemProgram.programId,
    },
    signers: [userOne],
  });

  const fetchedAuthorityRecord =
    await program.account.userAuthorityRecord.fetch(authorityPda);

  console.log(fetchedAuthorityRecord);
}

console.log('Running client.');
main().then(() => console.log('Success'));
