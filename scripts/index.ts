import * as anchor from '@project-serum/anchor';
import { readFileSync } from 'fs';

/*
A simple sanity test
 */
const runSanity = async () => {
  // Configure the local cluster.
  const provider = anchor.Provider.local();
  anchor.setProvider(provider);

  // Read the generated IDL.
  const idl = JSON.parse(
    readFileSync('../target/idl/one_profile.json', 'utf8')
  );

  // Address of the deployed program.
  const programId = new anchor.web3.PublicKey(
    '7a8sHgh2yshLfCLswwJ3wz9aLfjo5UuN1zkkscMmy9gc'
  );

  // Generate the program client from IDL.
  const program = new anchor.Program(idl, programId);

  const userOne = anchor.web3.Keypair.generate();

  await provider.connection.confirmTransaction(
    await provider.connection.requestAirdrop(userOne.publicKey, 10000000000),
    'confirmed'
  );
};

console.log('Running sanity script.');
runSanity().then(() => console.log('Success'));
