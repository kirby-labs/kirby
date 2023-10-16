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
  // const connection = new Web3.Connection("http://127.0.0.1:8899", 'confirmed');
  const connection = new Web3.Connection("https://api.devnet.solana.com", 'confirmed');


  // const secret = JSON.parse(fs.readFileSync('/Users/davirain/.config/solana/id.json', 'utf8')) as number[];
  // const secretKey = Uint8Array.from(secret);
  // const signer = Web3.Keypair.fromSecretKey(secretKey);

  const signer = await initializeKeypair();

  console.log("公钥:", signer.publicKey.toBase58());
  // await airdropSolIfNeeded(signer, connection);

  let wallet = new anchor.Wallet(signer);
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  anchor.setProvider(provider);

  console.log("programId:", PROGRAM_ID.toBase58());
  const program = new anchor.Program(idl as anchor.Idl, PROGRAM_ID, provider);

  // await InitializeLoggedInUsers(program, signer);
  //
  // await login(program, signer.publicKey, provider);

  // await changeSubPrice(program, signer, 1_000_000_000);

  // await updateItem(program, signer, Buffer.from(`<opml version="2.0">
  //     < head >
  //     <title>Your Subscription List < /title>
  //     < /head>
  //     < body >
  //   <outline text="左耳朵耗子blog" type = "rss" xmlUrl = "https://coolshell.cn/feed" htmlUrl = "https://coolshell.cn/" />
  //   <outline text="The GitHub Blog" htmlUrl = "https://github.com/blog" type = "rss" xmlUrl = "https://github.com/blog.atom" />
  //   <outline text="马全一 blog" htmlUrl = "https://maquanyi.com/" type = "rss" xmlUrl = "https://maquanyi.com/rss/feed.xml" />
  //   </body>
  //   < /opml>
  // `));
  // await updateItem(program, signer, Buffer.from("123"));
  await readItem(program, signer);
  // await isInit(program, signer);

  // TODO: have problem
  // await getAllLoggedInUser(program);
  // await getAccountRssSource(program, signer.publicKey);
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
  console.log(
    `Transaction https://explorer.solana.com/tx/${txid}?cluster=devnet`
  )
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
    `Transaction https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`
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
    `Transaction https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`
  )
}

async function readItem(program: anchor.Program, payer: Web3.Keypair) {
  let [rssSourceAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("rss"), payer.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log("rssSourceAccount:", rssSourceAccount.toBase58());

  // Fetch the state struct from the network.
  const result = await program.account.rssSourceAccount.fetch(rssSourceAccount);
  console.log("result", result);
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
    `Transaction https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`
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
    `Transaction https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`
  )
}

// this need return
async function getAllLoggedInUser(program: anchor.Program) {
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
  // problem:
  // 公钥: ATrkCHG6PnkhVNaVz9tekg4je5cvZcLuZuF5UAxxEvyK
  // programId: 7HFvaNrZNfws4u5qGZ9f7gfodsfzg29jvwCAv8PKMLEq
  // initializeLoggedInUsersAccount: 2ESo2aNWWffukjFCdE4K92wrC4fnakmbAmnmSJSGC4Ro
  // TypeError: Cannot read properties of undefined (reading 'fetch')
  //     at /Users/davirain/solana/kirby/app/src/index.ts:252:71
  //     at Generator.next (<anonymous>)
  //     at /Users/davirain/solana/kirby/app/src/index.ts:31:71
  //     at new Promise (<anonymous>)
  //     at __awaiter (/Users/davirain/solana/kirby/app/src/index.ts:27:12)
  //     at getAllLoggedInUser (/Users/davirain/solana/kirby/app/src/index.ts:211:12)
  //     at /Users/davirain/solana/kirby/app/src/index.ts:39:9
  //     at Generator.next (<anonymous>)
  //     at /Users/davirain/solana/kirby/app/src/index.ts:31:71
  //     at new Promise (<anonymous>)
}


async function isInit(program: anchor.Program, payer: Web3.Keypair) {
  let [accountRssSetting] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("account-setting"), payer.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log("accountRssSetting:", accountRssSetting.toBase58());

  // Fetch the state struct from the network.
  const allLoggedInUsersAccount = await program.account.accountRssSetting.fetch(accountRssSetting);
  console.log("allLoggedInUsersAccount: ", allLoggedInUsersAccount);
  // print allLoggedInUsersAccount:  { isInitialized: true, priceOneMonth: <BN: 3b9aca00> }
}

async function getAccountRssSource(program: anchor.Program, payer: Web3.Keypair) {
  let [rssSourceAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("rss"), payer.publicKey.toBuffer()],
    PROGRAM_ID
  );
  const result = await program.account.RssSource.fetch(rssSourceAccount);
  console.log("rssSource: ", result);
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
    `Transaction https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`
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


async function initializeKeypair(): Promise<Web3.Keypair> {
  // 如果没有私钥，生成新密钥对
  if (!process.env.PRIVATE_KEY) {
    console.log('正在生成新密钥对... 🗝️');
    const signer = Web3.Keypair.generate();

    console.log('正在创建 .env 文件');
    fs.writeFileSync('.env', `PRIVATE_KEY=[${signer.secretKey.toString()}]`);

    return signer;
  }

  const secret = JSON.parse(process.env.PRIVATE_KEY ?? '') as number[];
  const secretKey = Uint8Array.from(secret);
  const keypairFromSecret = Web3.Keypair.fromSecretKey(secretKey);
  return keypairFromSecret;
}

async function airdropSolIfNeeded(
  signer: Web3.Keypair,
  connection: Web3.Connection
) {
  // 检查余额
  const balance = await connection.getBalance(signer.publicKey);
  console.log('当前余额为', balance / Web3.LAMPORTS_PER_SOL, 'SOL');

  // 如果余额少于 10 SOL，执行空投
  if (balance / Web3.LAMPORTS_PER_SOL < 2) {
    console.log('正在空投 2 SOL');
    const airdropSignature = await connection.requestAirdrop(
      signer.publicKey,
      2 * Web3.LAMPORTS_PER_SOL
    );

    const latestBlockhash = await connection.getLatestBlockhash();

    await connection.confirmTransaction({
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    const newBalance = await connection.getBalance(signer.publicKey);
    console.log('新余额为', newBalance / Web3.LAMPORTS_PER_SOL, 'SOL');
  }
}
