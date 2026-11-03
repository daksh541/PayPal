
import { buildModule } from
  "@nomicfoundation/hardhat-ignition/modules";

const PayProofModule = buildModule("PayProofModule", (m) => {
  const payProof = m.contract("PayProof");

  return { payProof };
});

export default PayProofModule;
