import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard Hardhat Demo Accounts
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

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`   ✓ ${message}`);
}

async function main() {
  console.log("============================================================");
  console.log("🧪 PayProof — Automated End-to-End Workflow Verification");
  console.log("============================================================");

  // 1. Load Contract Config
  const configPath = path.resolve(
    __dirname,
    "../../frontend/src/contracts/PayProofConfig.json"
  );
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at ${configPath}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const contractAddress = config.address;
  const abi = config.abi;

  console.log(`Target Contract Address: ${contractAddress}`);
  console.log(`Arbitrator Account (#0): ${ACCOUNTS.arbitrator.address}`);
  console.log(`Customer Account   (#1): ${ACCOUNTS.customer.address}`);
  console.log(`Merchant Account   (#2): ${ACCOUNTS.merchant.address}`);
  console.log("------------------------------------------------------------");

  // Read initial count
  const initialCount = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: "getPaymentCount",
  });
  console.log(`Initial on-chain payment count: ${initialCount}`);

  // ============================================================
  // WORKFLOW A: Payment -> Dispute -> Evidence -> Response -> APPROVE REFUND
  // ============================================================
  console.log("\n▶ [STEP 1] Customer creates Payment A (₹3,500 to Merchant)...");
  const pAHash = await customerWallet.writeContract({
    address: contractAddress,
    abi,
    functionName: "createPayment",
    args: [ACCOUNTS.merchant.address, 3500n],
  });
  const pAReceipt = await publicClient.waitForTransactionReceipt({ hash: pAHash });
  assert(pAReceipt.status === "success", "Payment A transaction confirmed on block");

  const countAfterA = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: "getPaymentCount",
  });
  const paymentAId = countAfterA;
  console.log(`   Generated Payment ID: #${paymentAId}`);

  let paymentA = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: "getPayment",
    args: [paymentAId],
  });
  assert(paymentA.status === 0, "Payment A initial status is PaymentRecorded (0)");
  assert(paymentA.amount === 3500n, "Payment A amount is 3500");
  assert(paymentA.customer.toLowerCase() === ACCOUNTS.customer.address.toLowerCase(), "Customer address matches");
  assert(paymentA.merchant.toLowerCase() === ACCOUNTS.merchant.address.toLowerCase(), "Merchant address matches");

  console.log("\n▶ [STEP 2] Customer raises dispute on Payment A...");
  const dAReason = "Defective OLED display panel with horizontal lines.";
  const dAIpfs = "ipfs://QmProofOledDefectPhoto001";
  const dAHash = await customerWallet.writeContract({
    address: contractAddress,
    abi,
    functionName: "raiseDispute",
    args: [paymentAId, dAReason, dAIpfs],
  });
  await publicClient.waitForTransactionReceipt({ hash: dAHash });

  paymentA = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: "getPayment",
    args: [paymentAId],
  });
  assert(paymentA.status === 1, "Payment A status transitioned to Disputed (1)");
  assert(paymentA.disputeReason === dAReason, "Dispute reason matches on-chain");
  assert(paymentA.evidenceHash === dAIpfs, "Initial evidence hash matches on-chain");
  assert(paymentA.disputedAt > 0n, "disputedAt timestamp recorded");

  console.log("\n▶ [STEP 3] Customer submits updated evidence hash...");
  const updatedEvidence = "ipfs://QmProofOledDefectVideoTesting002";
  const sEHash = await customerWallet.writeContract({
    address: contractAddress,
    abi,
    functionName: "submitEvidence",
    args: [paymentAId, updatedEvidence],
  });
  await publicClient.waitForTransactionReceipt({ hash: sEHash });

  paymentA = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: "getPayment",
    args: [paymentAId],
  });
  assert(paymentA.evidenceHash === updatedEvidence, "Updated evidence hash saved on-chain");

  console.log("\n▶ [STEP 4] Merchant submits counter-statement...");
  const mResponse = "Serial number in video does not match invoice #INV-9921 dispatch logs.";
  const mRHash = await merchantWallet.writeContract({
    address: contractAddress,
    abi,
    functionName: "merchantRespond",
    args: [paymentAId, mResponse],
  });
  await publicClient.waitForTransactionReceipt({ hash: mRHash });

  paymentA = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: "getPayment",
    args: [paymentAId],
  });
  assert(paymentA.merchantResponse === mResponse, "Merchant statement saved on-chain");

  console.log("\n▶ [STEP 5] Arbitrator approves refund (Customer favored)...");
  const aAHash = await arbitratorWallet.writeContract({
    address: contractAddress,
    abi,
    functionName: "approveRefund",
    args: [paymentAId],
  });
  await publicClient.waitForTransactionReceipt({ hash: aAHash });

  paymentA = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: "getPayment",
    args: [paymentAId],
  });
  assert(paymentA.status === 2, "Payment A status successfully transitioned to Refunded (2)");
  assert(paymentA.resolvedAt > 0n, "resolvedAt timestamp recorded on-chain");

  // ============================================================
  // WORKFLOW B: Payment -> Dispute -> Response -> REJECT REFUND
  // ============================================================
  console.log("\n▶ [STEP 6] Customer creates Payment B (₹6,200 to Merchant)...");
  const pBHash = await customerWallet.writeContract({
    address: contractAddress,
    abi,
    functionName: "createPayment",
    args: [ACCOUNTS.merchant.address, 6200n],
  });
  await publicClient.waitForTransactionReceipt({ hash: pBHash });

  const countAfterB = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: "getPaymentCount",
  });
  const paymentBId = countAfterB;
  console.log(`   Generated Payment ID: #${paymentBId}`);

  console.log("\n▶ [STEP 7] Customer raises dispute on Payment B...");
  const dBReason = "Buyer claimed package was never delivered.";
  const dBIpfs = "ipfs://QmBuyerClaimLostPackage4412";
  const dBHash = await customerWallet.writeContract({
    address: contractAddress,
    abi,
    functionName: "raiseDispute",
    args: [paymentBId, dBReason, dBIpfs],
  });
  await publicClient.waitForTransactionReceipt({ hash: dBHash });

  console.log("\n▶ [STEP 8] Merchant submits counter-statement with carrier proof...");
  const mBResponse = "BlueDart Tracking #BD-991823 shows signed receipt by buyer on Nov 2.";
  const mBHash = await merchantWallet.writeContract({
    address: contractAddress,
    abi,
    functionName: "merchantRespond",
    args: [paymentBId, mBResponse],
  });
  await publicClient.waitForTransactionReceipt({ hash: mBHash });

  console.log("\n▶ [STEP 9] Arbitrator rejects refund (Merchant favored)...");
  const rBHash = await arbitratorWallet.writeContract({
    address: contractAddress,
    abi,
    functionName: "rejectRefund",
    args: [paymentBId],
  });
  await publicClient.waitForTransactionReceipt({ hash: rBHash });

  let paymentB = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: "getPayment",
    args: [paymentBId],
  });
  assert(paymentB.status === 3, "Payment B status successfully transitioned to RefundRejected (3)");
  assert(paymentB.resolvedAt > 0n, "Payment B resolvedAt timestamp recorded");

  // ============================================================
  // ACCESS CONTROL TESTS
  // ============================================================
  console.log("\n▶ [STEP 10] Testing Smart Contract Security & Role Access Controls...");

  // Customer cannot approve refund
  try {
    await customerWallet.writeContract({
      address: contractAddress,
      abi,
      functionName: "approveRefund",
      args: [paymentBId],
    });
    assert(false, "Unauthorized customer approval should have reverted");
  } catch {
    assert(true, "Unauthorized customer approval correctly reverted with onlyArbitrator check");
  }

  // Merchant cannot dispute payment
  try {
    await merchantWallet.writeContract({
      address: contractAddress,
      abi,
      functionName: "raiseDispute",
      args: [paymentBId, "Fraud attempt", "ipfs://Qm..."],
    });
    assert(false, "Merchant dispute should have reverted");
  } catch {
    assert(true, "Non-customer dispute correctly reverted");
  }

  // Customer cannot respond as merchant
  try {
    await customerWallet.writeContract({
      address: contractAddress,
      abi,
      functionName: "merchantRespond",
      args: [paymentBId, "Fake statement"],
    });
    assert(false, "Customer responding as merchant should have reverted");
  } catch {
    assert(true, "Non-merchant response correctly reverted");
  }

  // ============================================================
  // LEDGER & AUDIT TRAIL VERIFICATION
  // ============================================================
  console.log("\n▶ [STEP 11] Verifying full ledger transaction history batch retrieval...");
  const allPayments = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: "getAllPayments",
  });
  assert(allPayments.length === Number(countAfterB), `getAllPayments() returned all ${allPayments.length} payments`);

  console.log("\n============================================================");
  console.log("🎉 ALL END-TO-END TESTS PASSED WITH 100% SUCCESS!");
  console.log("============================================================");
  console.log(`Total Verified Payments on Chain: ${allPayments.length}`);
  console.log(`Payment #${paymentAId}: Refund Approved (Status 2)`);
  console.log(`Payment #${paymentBId}: Refund Rejected (Status 3)`);
  console.log("Access Controls: Customer, Merchant, and Arbitrator roles strictly enforced.");
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("❌ E2E Test execution failed:", err);
  process.exit(1);
});

