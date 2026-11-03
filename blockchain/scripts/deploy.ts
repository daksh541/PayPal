import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("----------------------------------------------------");
  console.log("🚀 Deploying PayProof Smart Contract to Local Network");
  console.log("----------------------------------------------------");

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
  const [deployerWallet] = await viemInstance.getWalletClients();

  console.log(`Deployer Address (Arbitrator): ${deployerWallet.account.address}`);

  const payProof = await viemInstance.deployContract("PayProof", [], {
    client: { wallet: deployerWallet },
  });

  console.log(`✅ PayProof Deployed to: ${payProof.address}`);

  // Read ABI from Hardhat artifact
  const artifactPath = path.resolve(
    __dirname,
    "../artifacts/contracts/PayProof.sol/PayProof.json"
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found at ${artifactPath}. Please run hardhat build first.`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

  // Config object to save for frontend
  const config = {
    address: payProof.address,
    arbitrator: deployerWallet.account.address,
    chainId: 31337,
    networkName: "Hardhat Local",
    rpcUrl: "http://127.0.0.1:8545",
    currency: "ETH",
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };

  // Target directories
  const frontendContractsDir = path.resolve(__dirname, "../../frontend/src/contracts");
  if (!fs.existsSync(frontendContractsDir)) {
    fs.mkdirSync(frontendContractsDir, { recursive: true });
  }

  const configFilePath = path.join(frontendContractsDir, "PayProofConfig.json");
  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));

  // Also write a helper JS export for direct ESM importing
  const jsExportPath = path.join(frontendContractsDir, "PayProofConfig.js");
  const jsContent = `// Auto-generated deployment configuration
export const PAYPROOF_ADDRESS = "${payProof.address}";
export const ARBITRATOR_ADDRESS = "${deployerWallet.account.address}";
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
  fs.writeFileSync(jsExportPath, jsContent);

  console.log(`📁 Saved frontend configuration to:`);
  console.log(`   - ${configFilePath}`);
  console.log(`   - ${jsExportPath}`);
  console.log("----------------------------------------------------");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exit(1);
});

