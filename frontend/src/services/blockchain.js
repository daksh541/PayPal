import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
} from "viem";
import { hardhat } from "viem/chains";
import {
  PAYPROOF_ADDRESS,
  PAYPROOF_ABI,
  CHAIN_ID,
  RPC_URL,
} from "../contracts/PayProofConfig.js";

// Custom hardhat chain definition matching local node
export const hardhatLocalChain = {
  ...hardhat,
  id: CHAIN_ID,
  name: "Hardhat Local",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
};

/**
 * Creates public client for reading from contract
 */
export function getPublicClient() {
  if (typeof window !== "undefined" && window.ethereum) {
    try {
      return createPublicClient({
        chain: hardhatLocalChain,
        transport: custom(window.ethereum),
      });
    } catch {
      // Fallback to http transport
    }
  }
  return createPublicClient({
    chain: hardhatLocalChain,
    transport: http(RPC_URL),
  });
}

/**
 * Creates wallet client for signing transactions via MetaMask
 */
export function getWalletClient() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is not installed. Please install MetaMask to interact with the blockchain.");
  }

  return createWalletClient({
    chain: hardhatLocalChain,
    transport: custom(window.ethereum),
  });
}

/**
 * Switch or add Hardhat Local network to MetaMask
 */
export async function switchOrAddHardhatNetwork() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is not available");
  }

  const hexChainId = "0x" + CHAIN_ID.toString(16);

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (switchError) {
    const errorMsg = switchError?.message || "";
    // Error 4902: chain has not been added yet, or message indicates unrecognized chain
    if (
      switchError.code === 4902 ||
      switchError.data?.originalError?.code === 4902 ||
      errorMsg.includes("Unrecognized chain ID") ||
      errorMsg.includes("chain has not been added") ||
      switchError.code === -32603
    ) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexChainId,
            chainName: "Hardhat Local",
            rpcUrls: [RPC_URL],
            nativeCurrency: {
              name: "Ethereum",
              symbol: "ETH",
              decimals: 18,
            },
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Ensures MetaMask is on the correct target chain before attempting transactions
 */
export async function ensureCorrectNetwork() {
  if (typeof window === "undefined" || !window.ethereum) return;
  try {
    const currentChainHex = await window.ethereum.request({ method: "eth_chainId" });
    const currentChainId = parseInt(currentChainHex, 16);
    if (currentChainId !== CHAIN_ID) {
      await switchOrAddHardhatNetwork();
    }
  } catch (err) {
    console.warn("Could not auto-switch network:", err);
    throw new Error(
      `MetaMask is connected to the wrong network. Please switch to Hardhat Local (Chain ID: ${CHAIN_ID}) to continue.`,
      { cause: err }
    );
  }
}

/**
 * Status mapping
 */
export const STATUS_MAP = {
  0: { label: "Payment Recorded", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)", border: "#1d4ed8" },
  1: { label: "Disputed", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", border: "#b45309" },
  2: { label: "Refund Approved", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)", border: "#047857" },
  3: { label: "Refund Rejected", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)", border: "#b91c1c" },
};

/**
 * Formats a raw contract payment record into frontend friendly format
 */
export function formatPayment(payment) {
  return {
    id: Number(payment.id),
    customer: payment.customer,
    merchant: payment.merchant,
    amount: payment.amount.toString(),
    timestamp: Number(payment.timestamp),
    status: Number(payment.status),
    statusMeta: STATUS_MAP[Number(payment.status)] || STATUS_MAP[0],
    disputeReason: payment.disputeReason || "",
    evidenceHash: payment.evidenceHash || "",
    merchantResponse: payment.merchantResponse || "",
    disputedAt: Number(payment.disputedAt || 0),
    resolvedAt: Number(payment.resolvedAt || 0),
  };
}

/**
 * Fetch all payments and arbitrator address from contract
 */
export async function fetchContractData() {
  const publicClient = getPublicClient();

  const [arbitrator, count] = await Promise.all([
    publicClient.readContract({
      address: PAYPROOF_ADDRESS,
      abi: PAYPROOF_ABI,
      functionName: "arbitrator",
    }),
    publicClient.readContract({
      address: PAYPROOF_ADDRESS,
      abi: PAYPROOF_ABI,
      functionName: "getPaymentCount",
    }),
  ]);

  let payments = [];
  if (count > 0n) {
    const rawPayments = await publicClient.readContract({
      address: PAYPROOF_ADDRESS,
      abi: PAYPROOF_ABI,
      functionName: "getAllPayments",
    });
    payments = rawPayments.map(formatPayment);
  }

  return {
    arbitrator,
    count: Number(count),
    payments,
  };
}

/**
 * Clean extract of revert reason from viem or RPC error
 */
export function parseErrorMessage(error) {
  if (!error) return "An unexpected error occurred.";
  if (typeof error === "string") {
    if (error.includes("target chain") || error.includes("current chain")) {
      return "Wrong network: Please switch MetaMask to Hardhat Local (Chain 31337).";
    }
    return error;
  }

  const rawMessage = (error.shortMessage || error.message || "").toString();

  // Chain mismatch detection
  if (
    rawMessage.includes("does not match the target chain") ||
    rawMessage.includes("target chain") ||
    rawMessage.includes("current chain of the wallet")
  ) {
    return "MetaMask is on the wrong chain. Please click 'Switch to Hardhat Local' at the top banner.";
  }

  // User rejection
  if (
    rawMessage.includes("User rejected the request") ||
    rawMessage.includes("User denied") ||
    rawMessage.includes("user rejected action")
  ) {
    return "Transaction was cancelled in MetaMask.";
  }

  // Contract revert reasons
  const revertMatch = rawMessage.match(/reverted with reason string '([^']+)'/);
  if (revertMatch) return revertMatch[1];

  if (error.shortMessage) {
    return error.shortMessage;
  }

  if (error.message) {
    return error.message.slice(0, 160);
  }

  return "Transaction failed. Please check inputs and network.";
}

/**
 * Create Payment on blockchain
 */
export async function createPaymentTx(account, merchantAddress, amount) {
  await ensureCorrectNetwork();
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  const hash = await walletClient.writeContract({
    address: PAYPROOF_ADDRESS,
    abi: PAYPROOF_ABI,
    functionName: "createPayment",
    args: [merchantAddress, BigInt(amount)],
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

/**
 * Raise Dispute on blockchain
 */
export async function raiseDisputeTx(account, paymentId, reason, evidenceHash) {
  await ensureCorrectNetwork();
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  const hash = await walletClient.writeContract({
    address: PAYPROOF_ADDRESS,
    abi: PAYPROOF_ABI,
    functionName: "raiseDispute",
    args: [BigInt(paymentId), reason, evidenceHash || ""],
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

/**
 * Submit or update evidence on blockchain
 */
export async function submitEvidenceTx(account, paymentId, evidenceHash) {
  await ensureCorrectNetwork();
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  const hash = await walletClient.writeContract({
    address: PAYPROOF_ADDRESS,
    abi: PAYPROOF_ABI,
    functionName: "submitEvidence",
    args: [BigInt(paymentId), evidenceHash],
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

/**
 * Merchant response on blockchain
 */
export async function merchantRespondTx(account, paymentId, responseText) {
  await ensureCorrectNetwork();
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  const hash = await walletClient.writeContract({
    address: PAYPROOF_ADDRESS,
    abi: PAYPROOF_ABI,
    functionName: "merchantRespond",
    args: [BigInt(paymentId), responseText],
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

/**
 * Arbitrator resolve dispute (approve / reject)
 */
export async function resolveDisputeTx(account, paymentId, approve) {
  await ensureCorrectNetwork();
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  const hash = await walletClient.writeContract({
    address: PAYPROOF_ADDRESS,
    abi: PAYPROOF_ABI,
    functionName: "resolveDispute",
    args: [BigInt(paymentId), Boolean(approve)],
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}
