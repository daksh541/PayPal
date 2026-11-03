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
- **Simulated Payment Logging:** Stores `paymentId`, `customer`, `merchant`, `amount`, `timestamp`, and `status`.
- **Dispute Escalation:** Customer can open a dispute with a documented reason and IPFS evidence hash.
- **Evidence Management:** Customers can submit or update evidence during an active dispute.
- **Merchant Counter-Response:** Only the designated merchant can respond with fulfillment statements or tracking proof.
- **Arbitration Engine:** Strict access control ensuring only the authorized arbitrator can execute `approveRefund` or `rejectRefund`.
- **State Transition Guardrails:** Four distinct states (`PaymentRecorded`, `Disputed`, `Refunded`, `RefundRejected`) with protections against duplicate disputes and unauthorized mutations.
- **Comprehensive View Functions:** Single-query batch retrieval (`getAllPayments()`) for gas-efficient, fast frontend indexing.

### 💻 Modern Fintech Banking Interface
- **Dark Navy Theme:** Professional banking design with `#070d18` / `#111c35` palette, blue accents, glowing badges, and responsive layouts.
- **MetaMask Integration via Viem:** 
  - Dynamic wallet connection & account change listener.
  - Automatic detection of wrong networks with a 1-click button to add/switch to Hardhat Local (Chain `31337`).
  - Frontend-level disconnection option.
  - Role detection (`Arbitrator`, `Customer`, `Merchant`, `User`) based on active connected address.
- **Interactive Dispute Center:** Live dispute cards displaying customer/merchant addresses, reasons, evidence hashes, and role-specific action buttons.
- **On-Chain Audit Trail:** Searchable and filterable transaction log reflecting real contract state.
- **Live Feedback & Toasts:** Transaction pending spinners, toast alerts, and human-readable revert error explanations.

---

## 3. Tech Stack

- **Frontend:** React 19, Vite
- **Blockchain Library:** [Viem](https://viem.sh/) (Public & Wallet Clients)
- **Smart Contracts:** Solidity `^0.8.28` (EVM target: `osaka`)
- **Development Environment:** Hardhat 3 (`^3.21.2`)
- **Testing Framework:** Node.js native test runner (`node:test`) + Viem assertions
- **Wallet:** MetaMask browser extension
- **Styling:** Custom CSS with CSS variables and responsive design

---

## 4. Project Structure

```
PayProof/
├── package.json                    # Root shortcuts for blockchain & frontend
├── README.md                       # Comprehensive project documentation
├── blockchain/                     # Smart contract workspace
│   ├── contracts/
│   │   └── PayProof.sol            # Main smart contract
│   ├── scripts/
│   │   ├── deploy.ts               # Deployment & frontend config exporter
│   │   └── seed.ts                 # Demo seed script for live testing
│   ├── test/
│   │   └── PayProof.test.ts        # 23 automated test cases
│   ├── hardhat.config.ts           # Hardhat 3 configuration (Viem, networks)
│   └── package.json
└── frontend/                       # React + Vite application
    ├── src/
    │   ├── contracts/
    │   │   ├── PayProofConfig.js   # Auto-generated contract ABI & address
    │   │   └── PayProofConfig.json
    │   ├── services/
    │   │   └── blockchain.js       # Viem public/wallet clients & contract calls
    │   ├── components/
    │   │   └── Icons.jsx           # Handcrafted SVG fintech icons
    │   ├── App.jsx                 # Redesigned banking dashboard & modals
    │   ├── App.css                 # Dark navy theme stylesheet
    │   └── main.jsx
    ├── package.json
    └── vite.config.js
```

---

## 5. Prerequisites & Installation

### Requirements
- **Node.js:** v18.0.0 or later (v20+ recommended)
- **npm:** v9.0.0 or later
- **MetaMask Browser Extension** installed in Chrome, Brave, or Firefox.

### Step 1: Install Dependencies

From the project root:

```bash
# Install blockchain dependencies
cd blockchain
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

---

## 6. How to Run the Project

### Step 1: Start the Local Hardhat Blockchain

Open a new terminal window:

```bash
npm run blockchain:node
```

> Hardhat starts a local JSON-RPC node listening at `http://127.0.0.1:8545` with Chain ID `31337`, providing 20 pre-funded test accounts (10,000 ETH each).

---

### Step 2: Deploy the Smart Contract & Seed Demo Data

In a second terminal:

```bash
npm run blockchain:deploy
```

To automatically populate the contract with sample settled payments and open disputes for instant demonstration, run:

```bash
npm run blockchain:seed
```

> **Automatic Frontend Sync:** The deployment and seed scripts automatically save the deployed contract address and ABI directly to `frontend/src/contracts/PayProofConfig.js`.

---

### Step 3: Start the React Frontend

In the same second terminal:

```bash
npm run frontend:dev
```

Open your browser and navigate to:
```
http://localhost:5173
```

---

## 7. How to Configure MetaMask

To interact with the local blockchain using MetaMask:

1. Open the MetaMask extension.
2. If PayProof detects you are on another network (e.g. Ethereum Mainnet or Sepolia), click the **"Switch to Hardhat Local"** button in the red banner. MetaMask will prompt you to approve adding the network.
3. Alternatively, manually add the network in MetaMask:
   - **Network Name:** Hardhat Local
   - **New RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency Symbol:** `ETH`

### Importing Demo Accounts into MetaMask

Import any of the default Hardhat private keys into MetaMask for role-based testing:

| Role | Account | Address | Private Key |
| :--- | :--- | :--- | :--- |
| **Arbitrator** | Account #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| **Customer** | Account #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| **Merchant** | Account #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |

---

## 8. How to Demonstrate the Project (Step-by-Step)

Here is a 5-minute demonstration script for project reviews:

1. **Connect as Customer (Account #1):**
   - Click **Connect MetaMask** and switch to Account #1.
   - The top bar will display the green **Customer** role badge.
   - Navigate to **Create Payment**, enter Merchant Address (`0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`), select ₹3,000, and click **Create Blockchain Payment Record**.
   - Approve the transaction in MetaMask.
   - The transaction will appear in the **Transaction History** table with status `Payment Recorded`.

2. **Customer Raises a Dispute:**
   - In **Disputes** or **Transactions**, locate the new payment.
   - Click **Raise Dispute**.
   - Enter a reason (*"Item received was defective and non-functional"*) and an IPFS evidence hash (`ipfs://QmProofReceipt99182`).
   - Sign the transaction. The payment status transitions to `Disputed`.

3. **Switch to Merchant (Account #2):**
   - In MetaMask, switch to Account #2.
   - The app immediately detects the account change and updates the role badge to **Merchant**.
   - Under **Disputes**, the **Submit Response** action is now enabled for Payment #1.
   - Submit a counter-statement (*"Replacement was dispatched via DHL Express AWB#9921"*).
   - Sign the transaction.

4. **Switch to Arbitrator (Account #0):**
   - In MetaMask, switch to Account #0.
   - The app updates the role badge to **Arbitrator**.
   - Click **Arbitrate Ruling** on the disputed card.
   - Select **Approve Refund** (or **Reject Refund**) and confirm.
   - The status transitions to `Refund Approved` (or `Refund Rejected`), permanently locking the dispute on-chain.

---

## 9. Automated Testing

The smart contract includes a test suite covering all core business logic, access controls, and state invariants:

```bash
npm run blockchain:test
```

### Test Coverage Highlights (23 Tests Passing):
- **Deployment & Roles:** Deployer is correctly assigned as immutable/transferable arbitrator.
- **Payment Creation:** Validates customer != merchant, merchant != 0x0, amount > 0, sequential ID assignment.
- **Dispute Access Control:** Prevents non-customers from disputing; prevents empty reasons; enforces valid payment IDs.
- **Duplicate Prevention:** Reverts if customer tries to dispute an already disputed or resolved payment.
- **Merchant Statements:** Ensures only the designated merchant of that specific payment can respond, and only when disputed.
- **Arbitrator Resolutions:** Reverts non-arbitrator resolution attempts; validates state transitions; prevents re-resolving finalized disputes.
- **Role Delegation:** Verifies arbitrator role transfer functionality.

---

## 10. Limitations of the Prototype

- **Simulated Funds:** Transactions record simulated fiat amounts rather than locking real ERC-20 tokens or ETH in escrow.
- **Off-Chain Evidence Storage:** Evidence is referenced via cryptographic hashes or IPFS URIs rather than hosting raw image/PDF bytes directly on-chain (best practice for gas optimization).
- **Single Arbitrator Model:** Uses a designated arbitrator address. A production iteration could replace this with a decentralized DAO voting mechanism or a multi-signature arbitration panel (e.g. Kleros integration).

