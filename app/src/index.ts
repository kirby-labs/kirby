import * as Web3 from '@solana/web3.js';
import * as fs from 'fs';
import dotenv from 'dotenv';
import * as anchor from '@coral-xyz/anchor';
import idl from "../idl/kirby.json";
import assert from "assert";
import * as borsh from "borsh";

dotenv.config();

const PROGRAM_ID = new Web3.PublicKey("7HFvaNrZNfws4u5qGZ9f7gfodsfzg29jvwCAv8PKMLEq");

async function main() {
  const connection = new Web3.Connection("http://127.0.0.1:8899", 'confirmed');

  const secret = JSON.parse(fs.readFileSync('/Users/davirain/.config/solana/id.json', 'utf8')) as number[];
  const secretKey = Uint8Array.from(secret);
  const signer = Web3.Keypair.fromSecretKey(secretKey);

  console.log("公钥:", signer.publicKey.toBase58());
  let wallet = new anchor.Wallet(signer);
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  anchor.setProvider(provider);

  console.log("programId:", PROGRAM_ID.toBase58());
  const program = new anchor.Program(idl as anchor.Idl, PROGRAM_ID, provider);

  // await InitializeLoggedInUsers(program, signer);
  //
  await login(program, signer.publicKey, provider);

  // await registerLogin(program, signer);

  // await changeSubPrice(program, signer, 1_000_000_000);

  // await updateItem(program, signer, Buffer.from("123"));
}

main()
  .then(() => {
    console.log('执行成功完成');
    process.exit(0);
  })
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });


async function login(program: anchor.Program, payer: Web3.PublicKey, provider: anchor.AnchorProvider) {
  let [rssSourceAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("rss"), payer.toBytes()],
    PROGRAM_ID
  );
  console.log("rssSourceAccount:", rssSourceAccount.toBase58());
  let [subscriptionsAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("subscriptions"), payer.toBytes()],
    PROGRAM_ID
  );
  console.log("subscriptionsAccount:", subscriptionsAccount.toBase58());
  let [accountRssSetting] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("account-setting"), payer.toBytes()],
    PROGRAM_ID
  );
  console.log("accountRssSetting:", accountRssSetting.toBase58());
  let [loggedInUsersAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("logged-in-users"), payer.toBytes()],
    PROGRAM_ID
  );
  console.log("loggedInUsersAccount:", loggedInUsersAccount.toBase58());

  const initializeAccountInstruction = await program.methods
    .initialize(new anchor.BN(100_000_000)) // set defualt price
    .accounts({
      rssSourceAccount: rssSourceAccount,
      subscriptionsAccount: subscriptionsAccount,
      accountRssSetting: accountRssSetting,
      loggedInUsersAccount: loggedInUsersAccount,
      user: payer,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction();

  let [initializeLoggedInUsersAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("logged-in-users")],
    PROGRAM_ID
  );

  const addLoggInUserInstruction = await program.methods
    .login()
    .accounts({
      loggedInUsersAccount: initializeLoggedInUsersAccount,
      user: payer,
    })
    .instruction();

  // Array of instructions
  const instructions: anchor.web3.TransactionInstruction[] = [
    initializeAccountInstruction,
    addLoggInUserInstruction,
  ];

  await createAndSendV0Tx(instructions, provider, payer);
}

async function createAndSendV0Tx(
  txInstructions: anchor.web3.TransactionInstruction[],
  provider: anchor.AnchorProvider,
  payer: Web3.PublicKey
) {
  // Step 1 - Fetch the latest blockhash
  let latestBlockhash = await provider.connection.getLatestBlockhash(
    "confirmed"
  );
  console.log(
    "   ✅ - Fetched latest blockhash. Last Valid Height:",
    latestBlockhash.lastValidBlockHeight
  );

  // Step 2 - Generate Transaction Message
  const messageV0 = new anchor.web3.TransactionMessage({
    payerKey: payer,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: txInstructions,
  }).compileToV0Message();
  console.log("   ✅ - Compiled Transaction Message");
  const transaction = new anchor.web3.VersionedTransaction(messageV0);

  // Step 3 - Sign your transaction with the required `Signers`
  provider.wallet.signTransaction(transaction);
  console.log("   ✅ - Transaction Signed");

  // Step 4 - Send our v0 transaction to the cluster
  const txid = await provider.connection.sendTransaction(transaction, {
    maxRetries: 5,
  });
  console.log("   ✅ - Transaction sent to network");

  // Step 5 - Confirm Transaction
  const confirmation = await provider.connection.confirmTransaction({
    signature: txid,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });
  if (confirmation.value.err) {
    throw new Error(
      `   ❌ - Transaction not confirmed.\nReason: ${confirmation.value.err}`
    );
  }
  console.log("🎉 Transaction Succesfully Confirmed!");
}

async function changeSubPrice(program: anchor.Program, payer: Web3.Keypair, price: number) {
  let [accountRssSetting] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("account-setting"), payer.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log("accountRssSetting:", accountRssSetting.toBase58());

  const transactionSignature = await program.methods
    .changeSubPrice(new anchor.BN(price))
    .accounts({
      accountRssSetting: accountRssSetting,
      user: payer.publicKey,
    })
    .rpc();

  console.log(
    `Transaction https://explorer.solana.com/tx/${transactionSignature}?cluster=custom`
  )
}

async function updateItem(program: anchor.Program, payer: Web3.Keypair, newDocument: Buffer) {
  let [rssSourceAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("rss"), payer.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log("rssSourceAccount:", rssSourceAccount.toBase58());

  const transactionSignature = await program.methods
    .updateItem(newDocument)
    .accounts({
      rssSourceAccount: rssSourceAccount,
      user: payer.publicKey,
    })
    .rpc();

  console.log(
    `Transaction https://explorer.solana.com/tx/${transactionSignature}?cluster=custom`
  )
}

async function subscribe(program: anchor.Program, payer: Web3.Keypair, feeAccount: Web3.PublicKey, subscriptionAccount: Web3.PublicKey, price: number) {
  let [subscriptionsAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("subscriptions"), payer.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log("subscriptionsAccount:", subscriptionsAccount.toBase58());

  const transactionSignature = await program.methods
    .subscribe(new anchor.BN(price))
    .accounts({
      feeAccount: feeAccount,
      subscriptionAccount: subscriptionAccount,
      subscriptionsAccount: subscriptionsAccount,
      user: payer.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log(
    `Transaction https://explorer.solana.com/tx/${transactionSignature}?cluster=custom`
  )
}

/// this function is used to initialize logged in users, just is all init this platform user store place
async function InitializeLoggedInUsers(program: anchor.Program, payer: Web3.Keypair) {
  let [initializeLoggedInUsersAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("logged-in-users")],
    PROGRAM_ID
  );
  console.log("initializeLoggedInUsersAccount:", initializeLoggedInUsersAccount.toBase58());

  const transactionSignature = await program.methods
    .initializeLoggedInUsers()
    .accounts({
      loggedInUsersAccount: initializeLoggedInUsersAccount,
      user: payer.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log(
    `Transaction https://explorer.solana.com/tx/${transactionSignature}?cluster=custom`
  )
}

// this need return
async function getAllLoggedInUser(program: anchor.Program, payer: Web3.Keypair) {
  let [initializeLoggedInUsersAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("logged-in-users")],
    PROGRAM_ID
  );
  console.log("initializeLoggedInUsersAccount:", initializeLoggedInUsersAccount.toBase58());

  // Fetch the state struct from the network.
  const allLoggedInUsersAccount = await program.account.LoggedInUsers.fetch(initializeLoggedInUsersAccount);
  // TODO: this need return
  // And all logged in users accunt is pubkey and need get all real account
  console.log("allLoggedInUsersAccount: ", allLoggedInUsersAccount);
  // TODO: this need return
}


async function isInit(program: anchor.Program, payer: Web3.Keypair) {
  let [accountRssSetting] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("account-setting")],
    PROGRAM_ID
  );
  console.log("accountRssSetting:", accountRssSetting.toBase58());

  // Fetch the state struct from the network.
  const allLoggedInUsersAccount = await program.account.accountRssSetting.fetch(accountRssSetting);

  const isInit = allLoggedInUsersAccount.isInit;
  console.log("isInit: ", isInit);
}


// todo need to return value
async function getAccount(connection: Web3.Connection, accountPubKey: Web3.PublicKey) {
  const accounts = await connection.getAccountInfo(accountPubKey);

  console.log(`Accounts for program ${accountPubKey}: `);
  console.log(accounts);
}

async function getActiveSubscriptions(provider: anchor.Provider, program: anchor.Program, payer: Web3.Keypair, currentTime: number) {
  let [subscriptionsAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("subscriptions")],
    PROGRAM_ID
  );
  console.log("subscriptionsAccount:", subscriptionsAccount.toBase58());

  const transactionSignature = await program.methods
    .getActiveSubscriptions(new anchor.BN(currentTime))
    .accounts({
      subscriptionsAccount: subscriptionsAccount,
      user: payer.publicKey,
    })
    .rpc();

  console.log(
    `Transaction https://explorer.solana.com/tx/${transactionSignature}?cluster=custom`
  )

  let t = await provider.connection.getTransaction(transactionSignature, {
    commitment: "confirmed",
  });

  // const [key, data, buffer] = getReturnLog(t);
  // assert.equal(key, PROGRAM_ID);

  // // Check for matching log on receive side
  // let receiveLog = t?.meta.logMessages.find(
  //   (log) => log == `Program data: ${data}`
  // );
  // assert(receiveLog !== undefined);

  // const reader = new borsh.BinaryReader(buffer);
  // const array = reader.readArray(() => reader.readU8());
  // assert.deepStrictEqual(array, [12, 13, 14, 100]);

}

// const getReturnLog = (confirmedTransaction: Web3.TransactionResponse) => {
//   const prefix = "Program return: ";
//   let log = confirmedTransaction.meta.logMessages.find((log) =>
//     log.startsWith(prefix)
//   );
//   log = log.slice(prefix.length);
//   const [key, data] = log.split(" ", 2);
//   const buffer = Buffer.from(data, "base64");
//   return [key, data, buffer];
// };
