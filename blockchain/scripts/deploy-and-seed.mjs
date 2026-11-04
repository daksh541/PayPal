import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard Hardhat Accounts
const ACCOUNTS = {
  arbitrator: privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" // Account #0
  ),
  customer: privateKeyToAccount(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" // Account #1
  ),
  merchant: privateKeyToAccount(
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" // Account #2
  ),
};

const transport = http("http://127.0.0.1:8545");

const publicClient = createPublicClient({
  chain: hardhat,
  transport,
});

const arbitratorWallet = createWalletClient({
  account: ACCOUNTS.arbitrator,
  chain: hardhat,
  transport,
});

const customerWallet = createWalletClient({
  account: ACCOUNTS.customer,
  chain: hardhat,
  transport,
});

const merchantWallet = createWalletClient({
  account: ACCOUNTS.merchant,
  chain: hardhat,
  transport,
});

async function main() {
  console.log("------------------------------------------------------------");
  console.log("🚀 Deploying & Seeding PayProof on Running Hardhat Node");
  console.log("------------------------------------------------------------");

  const artifactPath = path.resolve(
    __dirname,
    "../artifacts/contracts/PayProof.sol/PayProof.json"
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found at ${artifactPath}`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

  // 1. Deploy Contract
  console.log(`Arbitrator (Deployer): ${ACCOUNTS.arbitrator.address}`);
  console.log(`Customer:              ${ACCOUNTS.customer.address}`);
  console.log(`Merchant:              ${ACCOUNTS.merchant.address}`);

  const deployHash = await arbitratorWallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const contractAddress = receipt.contractAddress;
  console.log(`✅ PayProof Contract Deployed at: ${contractAddress}`);

  // 2. Seed Payments matching Project Specification
  console.log("\n📦 Seeding Demo Payments & Disputes...");

  // Payment 1: Standard Payment (Status = PaymentRecorded)
  console.log("1️⃣ Creating Payment #1 (Recorded: ₹1,500)...");
  const p1Hash = await customerWallet.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "createPayment",
    args: [ACCOUNTS.merchant.address, 1500n],
  });
  await publicClient.waitForTransactionReceipt({ hash: p1Hash });

  // Payment 2: Active Dispute with Merchant Rebuttal (Status = Disputed)
  console.log("2️⃣ Creating Payment #2 (Disputed with Evidence & Response: ₹4,800)...");
  const p2Hash = await customerWallet.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "createPayment",
    args: [ACCOUNTS.merchant.address, 4800n],
  });
  await publicClient.waitForTransactionReceipt({ hash: p2Hash });

  const d2Hash = await customerWallet.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "raiseDispute",
    args: [
      2n,
      "Package arrived with missing items and damaged packaging.",
      "ipfs://QmDamagedBoxReceiptProof1029384756",
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: d2Hash });

  const r2Hash = await merchantWallet.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "merchantRespond",
    args: [
      2n,
      "Courier dispatch video confirms full sealed package delivered at customer location.",
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: r2Hash });

  // Payment 3: Disputed and Refund Approved by Arbitrator (Status = Refunded)
  console.log("3️⃣ Creating Payment #3 (Disputed & Refund Approved: ₹8,200)...");
  const p3Hash = await customerWallet.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "createPayment",
    args: [ACCOUNTS.merchant.address, 8200n],
  });
  await publicClient.waitForTransactionReceipt({ hash: p3Hash });

  const d3Hash = await customerWallet.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "raiseDispute",
    args: [
      3n,
      "Merchant charged twice for single item order.",
      "ipfs://QmBankStatementDuplicateChargeProof8821",
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: d3Hash });

  const a3Hash = await arbitratorWallet.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "approveRefund",
    args: [3n],
  });
  await publicClient.waitForTransactionReceipt({ hash: a3Hash });

  // Payment 4: Disputed and Refund Rejected by Arbitrator (Status = RefundRejected)
  console.log("4️⃣ Creating Payment #4 (Disputed & Refund Rejected: ₹2,100)...");
  const p4Hash = await customerWallet.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "createPayment",
    args: [ACCOUNTS.merchant.address, 2100n],
  });
  await publicClient.waitForTransactionReceipt({ hash: p4Hash });

  const d4Hash = await customerWallet.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "raiseDispute",
    args: [
      4n,
      "Customer claimed unauthorized card swipe.",
      "ipfs://QmCustomerClaimUnauthorized88192",
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: d4Hash });

  const r4Hash = await merchantWallet.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "merchantRespond",
    args: [
      4n,
      "Customer authenticated with OTP and biometric 2FA at POS terminal.",
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: r4Hash });

  const rej4Hash = await arbitratorWallet.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "rejectRefund",
    args: [4n],
  });
  await publicClient.waitForTransactionReceipt({ hash: rej4Hash });

  // 3. Update frontend configuration files
  const frontendContractsDir = path.resolve(__dirname, "../../frontend/src/contracts");
  if (!fs.existsSync(frontendContractsDir)) {
    fs.mkdirSync(frontendContractsDir, { recursive: true });
  }

  const configJson = {
    address: contractAddress,
    arbitrator: ACCOUNTS.arbitrator.address,
    chainId: 31337,
    networkName: "Hardhat Local",
    rpcUrl: "http://127.0.0.1:8545",
    currency: "ETH",
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };

  fs.writeFileSync(
    path.join(frontendContractsDir, "PayProofConfig.json"),
    JSON.stringify(configJson, null, 2)
  );

  const jsContent = `// Auto-generated deployment configuration
export const PAYPROOF_ADDRESS = "${contractAddress}";
export const ARBITRATOR_ADDRESS = "${ACCOUNTS.arbitrator.address}";
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

  console.log("\n📁 Updated frontend configuration:");
  console.log(`   - PAYPROOF_ADDRESS: ${contractAddress}`);
  console.log(`   - ARBITRATOR_ADDRESS: ${ACCOUNTS.arbitrator.address}`);
  console.log("------------------------------------------------------------");
  console.log("🎉 All 4 stages successfully deployed & seeded on-chain!");
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});

