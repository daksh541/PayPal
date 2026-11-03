import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("🌱 Starting PayProof Seed & Simulation Script...");

  let viemInstance;
  try {
    const conn = await network.connect("localhost");
    viemInstance = conn.viem;
    console.log("📡 Connected to running Hardhat JSON-RPC node at http://127.0.0.1:8545");
  } catch (err) {
    console.log("⚠️ Could not connect to localhost node, falling back to in-memory:", err?.message || err);
    const net = await network.create();
    viemInstance = net.viem;
  }

  const publicClient = await viemInstance.getPublicClient();
  const [arbitratorWallet, customerWallet, merchantWallet] = await viemInstance.getWalletClients();

  console.log(`Arbitrator: ${arbitratorWallet.account.address}`);
  console.log(`Customer:   ${customerWallet.account.address}`);
  console.log(`Merchant:   ${merchantWallet.account.address}`);

  const payProof = await viemInstance.deployContract("PayProof", [], {
    client: { wallet: arbitratorWallet },
  });

  console.log(`✅ PayProof contract deployed at: ${payProof.address}`);

  const customerContract = await viemInstance.getContractAt("PayProof", payProof.address, {
    client: { wallet: customerWallet },
  });

  const merchantContract = await viemInstance.getContractAt("PayProof", payProof.address, {
    client: { wallet: merchantWallet },
  });

  const arbitratorContract = await viemInstance.getContractAt("PayProof", payProof.address, {
    client: { wallet: arbitratorWallet },
  });

  // 1. Create Payment 1 - Remains in PaymentRecorded state
  console.log("1️⃣ Creating Payment #1 (Standard Settled Payment: ₹1,500)...");
  await customerContract.write.createPayment([merchantWallet.account.address, 1500n]);

  // 2. Create Payment 2 - Raised dispute and merchant responded (Active Dispute)
  console.log("2️⃣ Creating Payment #2 (Active Disputed Payment: ₹4,800)...");
  await customerContract.write.createPayment([merchantWallet.account.address, 4800n]);
  await customerContract.write.raiseDispute([
    2n,
    "Package arrived with missing items and damaged packaging.",
    "ipfs://QmDamagedBoxReceiptProof1029384756",
  ]);
  await merchantContract.write.merchantRespond([
    2n,
    "Courier dispatch video confirms full sealed package delivered at customer location.",
  ]);

  // 3. Create Payment 3 - Disputed and Refund Approved
  console.log("3️⃣ Creating Payment #3 (Disputed & Refund Approved: ₹8,200)...");
  await customerContract.write.createPayment([merchantWallet.account.address, 8200n]);
  await customerContract.write.raiseDispute([
    3n,
    "Merchant charged twice for single item order.",
    "ipfs://QmBankStatementDuplicateChargeProof8821",
  ]);
  await arbitratorContract.write.approveRefund([3n]);

  // 4. Create Payment 4 - Disputed and Refund Rejected
  console.log("4️⃣ Creating Payment #4 (Disputed & Refund Rejected: ₹2,100)...");
  await customerContract.write.createPayment([merchantWallet.account.address, 2100n]);
  await customerContract.write.raiseDispute([
    4n,
    "Customer claimed unauthorized card swipe.",
    "ipfs://QmCustomerClaimUnauthorized88192",
  ]);
  await merchantContract.write.merchantRespond([
    4n,
    "Customer authenticated with OTP and biometric 2FA at POS terminal.",
  ]);
  await arbitratorContract.write.rejectRefund([4n]);

  // Save frontend configuration
  const artifactPath = path.resolve(
    __dirname,
    "../artifacts/contracts/PayProof.sol/PayProof.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

  const frontendContractsDir = path.resolve(__dirname, "../../frontend/src/contracts");
  if (!fs.existsSync(frontendContractsDir)) {
    fs.mkdirSync(frontendContractsDir, { recursive: true });
  }

  const config = {
    address: payProof.address,
    arbitrator: arbitratorWallet.account.address,
    chainId: 31337,
    networkName: "Hardhat Local",
    rpcUrl: "http://127.0.0.1:8545",
    currency: "ETH",
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };

  fs.writeFileSync(
    path.join(frontendContractsDir, "PayProofConfig.json"),
    JSON.stringify(config, null, 2)
  );

  const jsContent = `// Auto-generated deployment configuration
export const PAYPROOF_ADDRESS = "${payProof.address}";
export const ARBITRATOR_ADDRESS = "${arbitratorWallet.account.address}";
export const CHAIN_ID = 31337;
export const RPC_URL = "http://127.0.0.1:8545";
export const PAYPROOF_ABI = ${JSON.stringify(artifact.abi, null, 2)};
export default {
  address: PAYPROOF_ADDRESS,
  arbitrator: ARBITRATOR_ADDRESS,
  chainId: CHAIN_ID,
  rpcUrl: RPC_URL,
  abi: PAYPROOF_ABI
};
`;
  fs.writeFileSync(path.join(frontendContractsDir, "PayProofConfig.js"), jsContent);

  const count = await payProof.read.getPaymentCount();
  console.log(`\n🎉 Seed completed! ${count} payments recorded on chain.`);
  console.log(`Frontend configuration updated with contract at ${payProof.address}`);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});

