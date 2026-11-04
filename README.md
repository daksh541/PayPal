# PayProof — Blockchain-Based Payment Dispute and Refund Resolution

> **Academic Prototype:** A decentralized, tamper-resistant payment dispute escalation and refund arbitration platform implemented on Ethereum smart contracts.

---

## 1. Project Overview

**PayProof** addresses trust and transparency challenges in modern digital payment dispute management. Traditional payment gateways often operate as opaque "black boxes" where customers and merchants have limited visibility into dispute reasons, submitted evidence, and arbitrator decisions.

PayProof leverages Ethereum smart contracts to implement a transparent, verifiable audit trail:
- Simulated payments are timestamped and logged on-chain.
- Customers can raise disputes and submit cryptographic hashes (e.g. IPFS CIDs) of proof.
- Designated merchants can submit counter-evidence or fulfillment statements.
- An authorized third-party arbitrator reviews the immutable record and approves or rejects the refund on-chain.
- All actions emit verifiable blockchain events, preventing unauthorized tampering, duplicate disputes, and invalid state transitions.

> **Notice:** This application is an academic prototype. All payments and monetary transfers are simulated on a local blockchain testnet. No real fiat, UPI, credit card, or mainnet cryptocurrency funds are charged.

---

## 2. Key Features

### 🛡️ Smart Contract Capabilities (`PayProof.sol`)
1. **Simulated Payment Logging:** Stores `paymentId`, `customer`, `merchant`, `amount`, `timestamp`, and `status`.
2. **Dispute Escalation:** Customer can open a dispute with a documented reason and IPFS evidence hash.
3. **Evidence Management:** Customers can submit or update evidence during an active dispute.
4. **Merchant Counter-Response:** Only the designated merchant can respond with fulfillment statements or tracking proof.
5. **Arbitration Engine:** Strict access control ensuring only the authorized arbitrator can execute `approveRefund` or `rejectRefund`.
6. **State Transition Guardrails:** Four distinct states (`PaymentRecorded`, `Disputed`, `Refunded`, `RefundRejected`) with protections against duplicate disputes and unauthorized mutations.
7. **Comprehensive View Functions:** Single-query batch retrieval (`getAllPayments()`) for gas-efficient, fast frontend indexing.

### 💻 High-End Fintech Web Interface
- **Dark Void Theme:** Pitch-black background (`#000000`) with an ambient radial blue bottom glow and razor-sharp borders.
- **Top-to-Bottom Structured Layout:** Single cohesive scroll flow (Protocol Overview → Operations & Active Disputes → Transaction Ledger → Contract & Network Specs → Demo Role Cards).
- **MetaMask Integration via Viem:** 
  - Dynamic wallet connection & account change listener.
  - Automatic detection of wrong networks with a 1-click button to switch to Hardhat Local (Chain `31337`).
  - Frontend-level disconnection option.
  - Role detection (`Arbitrator`, `Customer`, `Merchant`, `User`) based on active connected address.
- **Interactive Dispute Center:** Live dispute cards displaying customer/merchant addresses, reasons, evidence hashes, and role-specific action buttons.
- **On-Chain Audit Trail:** Searchable and filterable transaction log (`All`, `Recorded`, `Disputed`, `Refunded`, `Rejected`).
- **Live Feedback & Toasts:** Transaction pending indicators, toast alerts, and human-readable revert error explanations.

---

## 3. Tech Stack

- **Frontend:** React 19, Vite
- **Blockchain Library:** [Viem](https://viem.sh/) (Public & Wallet Clients)
- **Smart Contracts:** Solidity `^0.8.28` (EVM target: `osaka`)
- **Development Environment:** Hardhat 3 (`^3.21.2`)
- **Testing Framework:** Viem E2E test runner (`node scripts/test-e2e.mjs`)
- **Wallet:** MetaMask browser extension
- **Styling:** Custom CSS with CSS variables, responsive design, and Google Plus Jakarta Sans typography

---

## 4. Quick Start Commands (Exact Commands)

To run the entire system locally:

### Terminal 1: Start the Hardhat Local Blockchain
```bash
cd blockchain
npm run node
```
> *Hardhat starts a local JSON-RPC node listening at `http://127.0.0.1:8545` (Chain ID `31337`), providing 20 pre-funded test accounts (10,000 ETH each).*

### Terminal 2: Deploy Contract & Seed Initial Demo Data
```bash
cd blockchain
npm run deploy
```
> *This deploys `PayProof.sol` to the running node, seeds 4 demo payments (1 Recorded, 1 Disputed, 1 Refunded, 1 Rejected), and automatically updates the frontend config at `frontend/src/contracts/PayProofConfig.js`.*

### Terminal 3: Start the React Frontend
```bash
cd frontend
npm run dev
```
> *Open your browser at **`http://localhost:5173`**.*

---

## 5. Automated End-to-End Testing

You can run an automated end-to-end test script that executes the complete lifecycle on-chain:

```bash
# From project root:
npm run test:e2e

# Or from blockchain directory:
cd blockchain
node scripts/test-e2e.mjs
```

### What the E2E script verifies:
1. Customer creates Payment A (₹3,500) → status `PaymentRecorded (0)`.
2. Customer raises dispute on Payment A with reason and IPFS hash → status `Disputed (1)`.
3. Customer submits updated evidence hash on Payment A.
4. Merchant submits counter-statement on Payment A.
5. Arbitrator approves refund on Payment A → status `Refunded (2)`.
6. Customer creates Payment B (₹6,200).
7. Customer raises dispute on Payment B.
8. Merchant submits counter-statement on Payment B.
9. Arbitrator rejects refund on Payment B → status `RefundRejected (3)`.
10. Verifies access controls:
    - Customer cannot approve refunds (reverts).
    - Merchant cannot raise customer disputes (reverts).
    - Customer cannot submit merchant responses (reverts).
11. Verifies batch retrieval (`getAllPayments()`) returns all records.

---

## 6. MetaMask Configuration & Role Setup

### Step 1: Add the Hardhat Local Network to MetaMask
Click **"Connect Wallet"** on the PayProof webpage. MetaMask will prompt you to automatically add/switch to **Hardhat Local**.

If adding manually in MetaMask:
- **Network Name:** Hardhat Local
- **RPC URL:** `http://127.0.0.1:8545`
- **Chain ID:** `31337`
- **Currency Symbol:** `ETH`

### Step 2: Import Demo Accounts into MetaMask

> ⚠️ **Security Notice:** The private keys below are publicly known Hardhat test keys. Use them **only** on your local test network. Never send real funds to these addresses.

In MetaMask, click your account avatar → **Add account or hardware wallet** → **Import account** → paste the private key:

| Role | Account Name | Address | Private Key | Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **Arbitrator** | Account #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` | Approves or rejects disputed refunds on-chain |
| **Customer** | Account #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` | Creates payments, raises disputes, updates IPFS evidence |
| **Merchant** | Account #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` | Receives payments, submits counter-statements |

---

## 7. Step-by-Step Viva & University Demonstration Script

Follow these steps for a complete 5-minute live demonstration:

### Step 1: Protocol Overview & System Health
1. Open `http://localhost:5173`.
2. Point out the top **Protocol Overview** section showing:
   - Total Payments count and simulated volume.
   - Active Disputes count.
   - Approved Refunds count.
   - Rejected Refunds count.
3. Show the **Contract & Network** cards showing the verified contract address, deployer arbitrator address, and Chain `31337`.

### Step 2: Customer Creates a Payment
1. In MetaMask, select **Account #1 (Customer)**.
2. In the navbar, the role chip displays **CUSTOMER**.
3. Under **Operations → Simulate Payment**:
   - Click the **"Sample Merchant"** button to auto-fill Merchant Account #2 (`0x3C44...`).
   - Click the **"₹1,500"** preset chip.
   - Enter an optional note: *"Hardware Sensor Kit"*.
   - Click **Record Payment**.
4. Confirm the transaction in MetaMask.
5. A toast appears confirming transaction inclusion, and the new payment appears in the **Transaction Ledger** with status `Payment Recorded`.

### Step 3: Customer Raises a Dispute with Cryptographic Evidence
1. In the **Transaction Ledger**, find the newly created payment.
2. Click the **Dispute** button.
3. In the modal:
   - Enter Dispute Reason: *"Item received defective and missing sensors"*.
   - Click the preset **"Defect Photo"** button (auto-fills sample IPFS CID).
   - Click **Confirm & Sign**.
4. Sign the transaction in MetaMask.
5. The payment status changes to `Disputed` (amber badge) and immediately moves into the **Active Disputes** feed.

### Step 4: Merchant Submits a Counter-Statement
1. In MetaMask, switch to **Account #2 (Merchant)**.
2. The navbar role chip immediately updates to **MERCHANT**.
3. Under **Active Disputes**, the **Submit Response** button is now enabled (only the merchant can respond).
4. Click **Submit Response**:
   - Enter: *"Dispatch video confirmed sealed package delivered via Courier ID #FEDEX-9921"*.
   - Click **Confirm & Sign**.
5. Sign in MetaMask. The merchant statement is now immutably attached to the dispute record on-chain.

### Step 5: Arbitrator Reviews and Issues Ruling
1. In MetaMask, switch to **Account #0 (Arbitrator)**.
2. The navbar role chip updates to **ARBITRATOR** (purple badge).
3. Under **Active Disputes**, click **Arbitrate**.
4. In the decision modal:
   - Select **Approve Refund** (Customer wins) or **Reject Refund** (Merchant wins).
   - Click **Confirm & Sign**.
5. Sign in MetaMask.
6. The dispute is permanently resolved on-chain with state `Refund Approved` or `Refund Rejected`, locking the record against any further changes.

---

## 8. Troubleshooting MetaMask

### Nonce Desynchronization (If Hardhat Node is Restarted)
When you restart `npm run node`, the local blockchain's transaction count resets to block 0, but MetaMask remembers prior transaction nonces.
- **Symptom:** MetaMask displays `Transaction failed: nonce too high` or `replacement transaction underpriced`.
- **Fix:** In MetaMask → click the 3 vertical dots (menu) → **Settings** → **Advanced** → **Clear activity tab data** (or "Reset Account"). This clears cached nonces without deleting your accounts or keys.

### "Unable to connect to Hardhat Local"
- Ensure `npm run node` is currently running in your blockchain terminal.
- Ensure the RPC URL is `http://127.0.0.1:8545` and Chain ID is `31337`.
- If using Brave or Chrome with ad-blockers, ensure local loopback connections are allowed.
