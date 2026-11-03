import { useState, useEffect, useCallback } from "react";
import {
  ShieldIcon,
  DashboardIcon,
  PaymentIcon,
  DisputeIcon,
  TransactionsIcon,
  SettingsIcon,
  WalletIcon,
  RefreshIcon,
  CheckIcon,
  XIcon,
  CopyIcon,
  ScaleIcon,
} from "./components/Icons";
import {
  fetchContractData,
  createPaymentTx,
  raiseDisputeTx,
  submitEvidenceTx,
  merchantRespondTx,
  resolveDisputeTx,
  switchOrAddHardhatNetwork,
  parseErrorMessage,
} from "./services/blockchain";
import {
  PAYPROOF_ADDRESS,
  ARBITRATOR_ADDRESS,
  CHAIN_ID,
  RPC_URL,
} from "./contracts/PayProofConfig";
import "./App.css";

// Hardhat standard test accounts for easy presentation & demonstration
const DEMO_ACCOUNTS = [
  {
    role: "Arbitrator",
    label: "Account #0 (Contract Deployer / Arbitrator)",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    desc: "Can approve or reject disputed refunds",
  },
  {
    role: "Customer",
    label: "Account #1 (Sample Customer / Buyer)",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    desc: "Can create payments and raise disputes with evidence",
  },
  {
    role: "Merchant",
    label: "Account #2 (Sample Merchant / Seller)",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    desc: "Receives payments and submits merchant counter-responses",
  },
];

export default function App() {
  // Navigation
  const [currentTab, setCurrentTab] = useState("dashboard"); // 'dashboard' | 'payment' | 'disputes' | 'transactions' | 'settings'

  // Blockchain state
  const [wallet, setWallet] = useState("");
  const [chainId, setChainId] = useState(null);
  const [arbitrator, setArbitrator] = useState(ARBITRATOR_ADDRESS);
  const [payments, setPayments] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [txPending, setTxPending] = useState(false);

  // Notifications / Toast
  const [toast, setToast] = useState(null); // { type: 'success' | 'error' | 'info', message: string }

  // Modals state
  const [activeModal, setActiveModal] = useState(null); // 'raiseDispute' | 'submitEvidence' | 'merchantRespond' | 'resolveDispute' | null
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [modalForm, setModalForm] = useState({
    reason: "",
    evidenceHash: "",
    response: "",
    approve: true,
  });

  // Create Payment Form State
  const [merchantInput, setMerchantInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");

  // Transaction history filter
  const [txFilter, setTxFilter] = useState("all");

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  const copyToClipboard = (text, label = "Address") => {
    navigator.clipboard.writeText(text);
    showToast("info", `${label} copied to clipboard!`);
  };

  // Check user role
  const isArbitrator =
    wallet && arbitrator && wallet.toLowerCase() === arbitrator.toLowerCase();

  const getRoleForAccount = (address) => {
    if (!address) return "Visitor";
    if (arbitrator && address.toLowerCase() === arbitrator.toLowerCase()) {
      return "Arbitrator";
    }
    // Check if matches demo accounts
    if (address.toLowerCase() === DEMO_ACCOUNTS[1].address.toLowerCase()) {
      return "Customer";
    }
    if (address.toLowerCase() === DEMO_ACCOUNTS[2].address.toLowerCase()) {
      return "Merchant";
    }
    return "User";
  };

  const currentRole = getRoleForAccount(wallet);

  // Refresh blockchain data
  const loadBlockchainData = useCallback(async () => {
    setLoadingData(true);
    try {
      const data = await fetchContractData();
      setArbitrator(data.arbitrator);
      setPayments(data.payments);
    } catch (err) {
      console.warn("Could not load contract data:", err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  // Connect MetaMask
  const connectWallet = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      showToast("error", "MetaMask is not installed. Please install MetaMask extension.");
      return;
    }

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (accounts && accounts.length > 0) {
        setWallet(accounts[0]);
        showToast("success", `Connected: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);
      }

      const currentChainHex = await window.ethereum.request({ method: "eth_chainId" });
      const currentId = parseInt(currentChainHex, 16);
      setChainId(currentId);

      if (currentId !== CHAIN_ID) {
        try {
          await switchOrAddHardhatNetwork();
          const updatedHex = await window.ethereum.request({ method: "eth_chainId" });
          setChainId(parseInt(updatedHex, 16));
        } catch {
          showToast("error", "Wrong network: please switch MetaMask to Hardhat Local (Chain 31337).");
        }
      }

      await loadBlockchainData();
    } catch (err) {
      showToast("error", parseErrorMessage(err));
    }
  };

  // Disconnect wallet at frontend level
  const disconnectWallet = () => {
    setWallet("");
    showToast("info", "Wallet disconnected at frontend level.");
  };

  // Handle wrong network switch
  const handleSwitchNetwork = async () => {
    try {
      await switchOrAddHardhatNetwork();
      const currentChainHex = await window.ethereum.request({ method: "eth_chainId" });
      setChainId(parseInt(currentChainHex, 16));
      showToast("success", "Switched to Hardhat Local network (Chain 31337).");
      await loadBlockchainData();
    } catch (err) {
      showToast("error", parseErrorMessage(err));
    }
  };

  // Setup MetaMask listeners on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accounts) => {
          if (accounts && accounts.length > 0) {
            setWallet(accounts[0]);
          }
        })
        .catch(() => {});

      window.ethereum
        .request({ method: "eth_chainId" })
        .then((hex) => setChainId(parseInt(hex, 16)))
        .catch(() => {});

      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          setWallet("");
          showToast("info", "MetaMask disconnected.");
        } else {
          setWallet(accounts[0]);
          showToast("info", `Account changed to: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);
          loadBlockchainData();
        }
      };

      const handleChainChanged = (newChainHex) => {
        setChainId(parseInt(newChainHex, 16));
        loadBlockchainData();
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);

      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      };
    }
  }, [loadBlockchainData]);

  // Initial fetch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBlockchainData();
  }, [loadBlockchainData]);

  // Handle Payment Creation
  const handleCreatePayment = async (e) => {
    e.preventDefault();
    if (!wallet) {
      showToast("error", "Please connect your MetaMask wallet first.");
      return;
    }
    if (!merchantInput || !merchantInput.startsWith("0x") || merchantInput.length !== 42) {
      showToast("error", "Please provide a valid 42-character merchant Ethereum address.");
      return;
    }
    if (merchantInput.toLowerCase() === wallet.toLowerCase()) {
      showToast("error", "Customer cannot be merchant. Select a different merchant address.");
      return;
    }
    if (!amountInput || Number(amountInput) <= 0) {
      showToast("error", "Payment amount must be greater than zero.");
      return;
    }

    setTxPending(true);
    try {
      showToast("info", "Broadcasting payment transaction to blockchain...");
      const { hash } = await createPaymentTx(wallet, merchantInput, amountInput);
      showToast("success", `Payment created successfully! Tx: ${hash.slice(0, 10)}...`);
      setMerchantInput("");
      setAmountInput("");
      setNoteInput("");
      await loadBlockchainData();
      setCurrentTab("transactions");
    } catch (err) {
      showToast("error", parseErrorMessage(err));
    } finally {
      setTxPending(false);
    }
  };

  // Handle Modal Actions
  const openActionModal = (modalType, payment) => {
    setSelectedPayment(payment);
    setActiveModal(modalType);
    setModalForm({
      reason: "",
      evidenceHash: "",
      response: "",
      approve: true,
    });
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedPayment(null);
  };

  const submitModalAction = async () => {
    if (!wallet) {
      showToast("error", "Please connect your wallet.");
      return;
    }
    if (!selectedPayment) return;

    setTxPending(true);
    try {
      if (activeModal === "raiseDispute") {
        if (!modalForm.reason.trim()) {
          showToast("error", "Dispute reason is required.");
          setTxPending(false);
          return;
        }
        showToast("info", `Opening dispute for Payment #${selectedPayment.id}...`);
        await raiseDisputeTx(
          wallet,
          selectedPayment.id,
          modalForm.reason,
          modalForm.evidenceHash || "ipfs://QmDefaultSimulatedHash"
        );
        showToast("success", `Dispute opened for Payment #${selectedPayment.id}!`);
      } else if (activeModal === "submitEvidence") {
        if (!modalForm.evidenceHash.trim()) {
          showToast("error", "Evidence hash cannot be empty.");
          setTxPending(false);
          return;
        }
        showToast("info", `Submitting evidence for Payment #${selectedPayment.id}...`);
        await submitEvidenceTx(wallet, selectedPayment.id, modalForm.evidenceHash);
        showToast("success", `Evidence recorded on blockchain!`);
      } else if (activeModal === "merchantRespond") {
        if (!modalForm.response.trim()) {
          showToast("error", "Merchant response statement cannot be empty.");
          setTxPending(false);
          return;
        }
        showToast("info", `Submitting merchant counter-response...`);
        await merchantRespondTx(wallet, selectedPayment.id, modalForm.response);
        showToast("success", `Merchant response recorded on blockchain!`);
      } else if (activeModal === "resolveDispute") {
        showToast(
          "info",
          `Arbitrator ${modalForm.approve ? "approving" : "rejecting"} refund for #${selectedPayment.id}...`
        );
        await resolveDisputeTx(wallet, selectedPayment.id, modalForm.approve);
        showToast(
          "success",
          `Dispute #${selectedPayment.id} resolved as ${
            modalForm.approve ? "Refund Approved" : "Refund Rejected"
          }!`
        );
      }

      closeModal();
      await loadBlockchainData();
    } catch (err) {
      showToast("error", parseErrorMessage(err));
    } finally {
      setTxPending(false);
    }
  };

  // Metrics
  const totalPayments = payments.length;
  const activeDisputes = payments.filter((p) => p.status === 1).length;
  const approvedRefunds = payments.filter((p) => p.status === 2).length;
  const rejectedRefunds = payments.filter((p) => p.status === 3).length;
  const totalVolume = payments.reduce((acc, p) => acc + Number(p.amount), 0);

  // Filtered payments for transaction table
  const filteredPayments = payments.filter((p) => {
    if (txFilter === "all") return true;
    if (txFilter === "recorded") return p.status === 0;
    if (txFilter === "disputed") return p.status === 1;
    if (txFilter === "refunded") return p.status === 2;
    if (txFilter === "rejected") return p.status === 3;
    return true;
  });

  const disputedPaymentsList = payments.filter((p) => p.status === 1);

  const isWrongNetwork = wallet && chainId !== null && chainId !== CHAIN_ID;

  return (
    <div className="app-container">
      {/* Toast Alert Drawer */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>
            {toast.type === "success" && <CheckIcon size={20} />}
            {toast.type === "error" && <XIcon size={20} />}
            {toast.type === "info" && <ShieldIcon size={20} />}
            <span style={{ fontSize: "13px" }}>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <ShieldIcon size={22} />
          </div>
          <div className="brand-text">
            <h1>PayProof</h1>
            <span className="brand-badge">Academic Prototype</span>
          </div>
        </div>

        <nav className="nav-list">
          <button
            className={`nav-item ${currentTab === "dashboard" ? "active" : ""}`}
            onClick={() => setCurrentTab("dashboard")}
          >
            <DashboardIcon size={18} />
            <span>Dashboard</span>
          </button>

          <button
            className={`nav-item ${currentTab === "payment" ? "active" : ""}`}
            onClick={() => setCurrentTab("payment")}
          >
            <PaymentIcon size={18} />
            <span>Create Payment</span>
          </button>

          <button
            className={`nav-item ${currentTab === "disputes" ? "active" : ""}`}
            onClick={() => setCurrentTab("disputes")}
          >
            <DisputeIcon size={18} />
            <span>Disputes ({activeDisputes})</span>
          </button>

          <button
            className={`nav-item ${currentTab === "transactions" ? "active" : ""}`}
            onClick={() => setCurrentTab("transactions")}
          >
            <TransactionsIcon size={18} />
            <span>Transactions ({totalPayments})</span>
          </button>

          <button
            className={`nav-item ${currentTab === "settings" ? "active" : ""}`}
            onClick={() => setCurrentTab("settings")}
          >
            <SettingsIcon size={18} />
            <span>Demo Roles & Setup</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="network-pill">
            <span className={`status-dot ${isWrongNetwork ? "wrong" : ""}`} />
            <span>
              {isWrongNetwork
                ? `Wrong Network (Chain ${chainId})`
                : `Hardhat Local (${CHAIN_ID})`}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="main-wrapper">
        {/* Top Header */}
        <header className="top-header">
          <div className="header-title">
            <h2>Payment Dispute & Refund Resolution</h2>
            <p>Decentralized arbitration and tamper-resistant transaction audit trail</p>
          </div>

          <div className="header-actions">
            <button
              className="btn-secondary"
              onClick={loadBlockchainData}
              title="Refresh blockchain data"
              disabled={loadingData}
            >
              <RefreshIcon size={16} className={loadingData ? "spin" : ""} />
              <span>Refresh</span>
            </button>

            {wallet ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  className={`role-badge ${
                    isArbitrator
                      ? "role-arbitrator"
                      : currentRole === "Merchant"
                      ? "role-merchant"
                      : "role-customer"
                  }`}
                >
                  <ScaleIcon size={14} />
                  {currentRole}
                </span>

                <button
                  className="btn-secondary"
                  onClick={() => copyToClipboard(wallet, "Wallet address")}
                  title="Click to copy full address"
                >
                  <WalletIcon size={16} />
                  <span>
                    {wallet.slice(0, 6)}...{wallet.slice(-4)}
                  </span>
                  <CopyIcon size={14} />
                </button>

                <button
                  className="btn-outline-danger"
                  onClick={disconnectWallet}
                  title="Disconnect wallet"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button className="btn-primary" onClick={connectWallet}>
                <WalletIcon size={16} />
                <span>Connect MetaMask</span>
              </button>
            )}
          </div>
        </header>

        {/* Wrong Network Warning Banner */}
        {isWrongNetwork && (
          <div className="network-warning-banner">
            <div>
              ⚠️ <strong>Wrong Network Detected:</strong> MetaMask is connected to Chain ID{" "}
              {chainId}, but PayProof smart contracts are deployed to Hardhat Local (Chain{" "}
              {CHAIN_ID}).
            </div>
            <button onClick={handleSwitchNetwork}>Switch to Hardhat Local</button>
          </div>
        )}

        {/* Content Body */}
        <main className="content-area">
          {/* STATS OVERVIEW CARDS (Visible on Dashboard & Overview) */}
          {(currentTab === "dashboard" || currentTab === "transactions") && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-title">Total Payments</span>
                  <div
                    className="stat-icon"
                    style={{ background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" }}
                  >
                    <PaymentIcon size={18} />
                  </div>
                </div>
                <div className="stat-value">{totalPayments}</div>
                <div className="stat-sub">
                  Simulated Volume: ₹{totalVolume.toLocaleString()}
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-title">Active Disputes</span>
                  <div
                    className="stat-icon"
                    style={{ background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" }}
                  >
                    <DisputeIcon size={18} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: "#fbbf24" }}>
                  {activeDisputes}
                </div>
                <div className="stat-sub">Awaiting merchant or arbitrator action</div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-title">Refunds Approved</span>
                  <div
                    className="stat-icon"
                    style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}
                  >
                    <CheckIcon size={18} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: "#34d399" }}>
                  {approvedRefunds}
                </div>
                <div className="stat-sub">Decided in favor of customer</div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-title">Refunds Rejected</span>
                  <div
                    className="stat-icon"
                    style={{ background: "rgba(239, 68, 68, 0.15)", color: "#f87171" }}
                  >
                    <XIcon size={18} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: "#f87171" }}>
                  {rejectedRefunds}
                </div>
                <div className="stat-sub">Decided in favor of merchant</div>
              </div>
            </div>
          )}

          {/* TAB 1: DASHBOARD VIEW */}
          {currentTab === "dashboard" && (
            <div>
              {/* Quick Actions Panel */}
              <div className="card-panel">
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title">
                      <ShieldIcon size={18} />
                      Academic Prototype Workflow
                    </h3>
                    <p className="panel-desc">
                      Simulate end-to-end payment creation, dispute escalation, merchant counter-response, and arbitrator resolution on the local blockchain.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      className="btn-primary"
                      onClick={() => setCurrentTab("payment")}
                    >
                      <PaymentIcon size={16} />
                      New Payment
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => setCurrentTab("disputes")}
                    >
                      <DisputeIcon size={16} />
                      Manage Disputes
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "16px",
                    marginTop: "16px",
                  }}
                >
                  <div
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      padding: "16px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <h4 style={{ color: "#60a5fa", fontSize: "14px", marginBottom: "6px" }}>
                      1. Record Payment
                    </h4>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Customer records simulated payment specifying merchant address & amount.
                    </p>
                  </div>

                  <div
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      padding: "16px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <h4 style={{ color: "#fbbf24", fontSize: "14px", marginBottom: "6px" }}>
                      2. Customer Dispute
                    </h4>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      If item is missing or fraudulent, customer raises dispute with reason & IPFS evidence hash.
                    </p>
                  </div>

                  <div
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      padding: "16px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <h4 style={{ color: "#c084fc", fontSize: "14px", marginBottom: "6px" }}>
                      3. Merchant Response
                    </h4>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Designated merchant submits counter-proof or delivery receipt.
                    </p>
                  </div>

                  <div
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      padding: "16px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <h4 style={{ color: "#34d399", fontSize: "14px", marginBottom: "6px" }}>
                      4. Arbitrator Ruling
                    </h4>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Independent arbitrator evaluates proof and signs immutable approval or rejection.
                    </p>
                  </div>
                </div>
              </div>

              {/* Active Disputes Section Preview */}
              <div className="card-panel">
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title">
                      <DisputeIcon size={18} />
                      Active Disputes Requiring Attention
                    </h3>
                    <p className="panel-desc">
                      Transactions currently under active dispute on the blockchain.
                    </p>
                  </div>
                  {activeDisputes > 0 && (
                    <button
                      className="btn-secondary"
                      onClick={() => setCurrentTab("disputes")}
                    >
                      View All Disputes
                    </button>
                  )}
                </div>

                {disputedPaymentsList.length === 0 ? (
                  <div className="empty-state">
                    <ShieldIcon size={40} className="empty-icon" />
                    <p style={{ fontWeight: 600 }}>No active disputes found.</p>
                    <p style={{ fontSize: "12px", marginTop: "4px" }}>
                      All recorded transactions are either undisputably settled or already resolved.
                    </p>
                  </div>
                ) : (
                  <div className="disputes-grid">
                    {disputedPaymentsList.slice(0, 4).map((payment) => (
                      <DisputeCard
                        key={payment.id}
                        payment={payment}
                        wallet={wallet}
                        isArbitrator={isArbitrator}
                        onAction={openActionModal}
                        onCopy={copyToClipboard}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Transactions Preview */}
              <div className="card-panel">
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title">
                      <TransactionsIcon size={18} />
                      Recent Blockchain Payments
                    </h3>
                    <p className="panel-desc">
                      Latest payments recorded in the PayProof smart contract.
                    </p>
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={() => setCurrentTab("transactions")}
                  >
                    Full History
                  </button>
                </div>

                {payments.length === 0 ? (
                  <div className="empty-state">
                    <PaymentIcon size={40} className="empty-icon" />
                    <p style={{ fontWeight: 600 }}>No payment records yet.</p>
                    <p style={{ fontSize: "12px", marginTop: "4px" }}>
                      Click "New Payment" to simulate a blockchain transaction record.
                    </p>
                  </div>
                ) : (
                  <TransactionsTable
                    payments={payments.slice(-5).reverse()}
                    wallet={wallet}
                    isArbitrator={isArbitrator}
                    onAction={openActionModal}
                    onCopy={copyToClipboard}
                  />
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CREATE PAYMENT */}
          {currentTab === "payment" && (
            <div className="card-panel" style={{ maxWidth: "680px", margin: "0 auto" }}>
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">
                    <PaymentIcon size={18} />
                    Record Simulated Payment
                  </h3>
                  <p className="panel-desc">
                    Generates an immutable simulated payment entry on the local blockchain ledger.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreatePayment}>
                <div className="form-group">
                  <label className="form-label">Recipient Merchant Wallet Address</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={merchantInput}
                    onChange={(e) => setMerchantInput(e.target.value)}
                    required
                  />
                  <div className="presets-row">
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", alignSelf: "center" }}>
                      Quick Test Merchants:
                    </span>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() => setMerchantInput(DEMO_ACCOUNTS[2].address)}
                    >
                      Demo Merchant (Account #2)
                    </button>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() => setMerchantInput("0x90F79bf6EB2c4f870365E785982E1f101E93b906")}
                    >
                      Merchant B (Account #3)
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Amount (Simulated ₹ / Tokens)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 2500"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    required
                  />
                  <div className="presets-row">
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", alignSelf: "center" }}>
                      Presets:
                    </span>
                    {["500", "1500", "3000", "7500"].map((val) => (
                      <button
                        key={val}
                        type="button"
                        className="preset-chip"
                        onClick={() => setAmountInput(val)}
                      >
                        ₹{val}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Note / Order Reference (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Invoice #INV-2026-904, Order for Electronics"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                  />
                </div>

                <div
                  style={{
                    background: "rgba(59, 130, 246, 0.08)",
                    border: "1px solid rgba(59, 130, 246, 0.2)",
                    borderRadius: "8px",
                    padding: "12px",
                    fontSize: "12px",
                    color: "#93c5fd",
                    marginBottom: "20px",
                  }}
                >
                  ℹ️ <strong>Academic Prototype Note:</strong> No real currency is charged. The
                  transaction will invoke <code>PayProof.createPayment()</code> on Hardhat Local and
                  lock the record with status <code>PaymentRecorded</code>.
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: "100%", justifyContent: "center", padding: "12px" }}
                  disabled={txPending || !wallet}
                >
                  {txPending ? (
                    <span>Broadcasting to Blockchain...</span>
                  ) : !wallet ? (
                    <span>Connect Wallet to Record Payment</span>
                  ) : (
                    <span>Create Blockchain Payment Record</span>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: DISPUTE MANAGEMENT */}
          {currentTab === "disputes" && (
            <div>
              <div className="card-panel">
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title">
                      <DisputeIcon size={18} />
                      Payment Dispute Management Center
                    </h3>
                    <p className="panel-desc">
                      Manage active disputes, inspect evidence hashes, provide merchant statements, and execute arbitrator rulings.
                    </p>
                  </div>
                </div>

                {payments.length === 0 ? (
                  <div className="empty-state">
                    <DisputeIcon size={40} className="empty-icon" />
                    <p style={{ fontWeight: 600 }}>No payments exist yet to dispute.</p>
                    <p style={{ fontSize: "12px", marginTop: "4px" }}>
                      Create a payment first to test the dispute escalation workflow.
                    </p>
                  </div>
                ) : (
                  <div className="disputes-grid">
                    {payments
                      .filter((p) => p.status !== 0) // Disputed, Refunded, or RefundRejected
                      .map((payment) => (
                        <DisputeCard
                          key={payment.id}
                          payment={payment}
                          wallet={wallet}
                          isArbitrator={isArbitrator}
                          onAction={openActionModal}
                          onCopy={copyToClipboard}
                        />
                      ))}

                    {/* Also display recorded payments eligible for raising a dispute */}
                    {payments
                      .filter((p) => p.status === 0)
                      .map((payment) => (
                        <DisputeCard
                          key={payment.id}
                          payment={payment}
                          wallet={wallet}
                          isArbitrator={isArbitrator}
                          onAction={openActionModal}
                          onCopy={copyToClipboard}
                        />
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: TRANSACTIONS HISTORY */}
          {currentTab === "transactions" && (
            <div className="card-panel">
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">
                    <TransactionsIcon size={18} />
                    On-Chain Transaction Audit Trail
                  </h3>
                  <p className="panel-desc">
                    Tamper-resistant records directly fetched from the PayProof smart contract.
                  </p>
                </div>

                {/* Filter Tabs */}
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { id: "all", label: "All Records" },
                    { id: "recorded", label: "Recorded" },
                    { id: "disputed", label: "Disputed" },
                    { id: "refunded", label: "Refunded" },
                    { id: "rejected", label: "Rejected" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      className="preset-chip"
                      style={{
                        background:
                          txFilter === tab.id ? "rgba(59, 130, 246, 0.25)" : undefined,
                        borderColor:
                          txFilter === tab.id ? "rgba(59, 130, 246, 0.5)" : undefined,
                        color: txFilter === tab.id ? "#60a5fa" : undefined,
                      }}
                      onClick={() => setTxFilter(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredPayments.length === 0 ? (
                <div className="empty-state">
                  <TransactionsIcon size={40} className="empty-icon" />
                  <p style={{ fontWeight: 600 }}>No transactions match this filter.</p>
                </div>
              ) : (
                <TransactionsTable
                  payments={filteredPayments}
                  wallet={wallet}
                  isArbitrator={isArbitrator}
                  onAction={openActionModal}
                  onCopy={copyToClipboard}
                />
              )}
            </div>
          )}

          {/* TAB 5: DEMO ROLES & SETTINGS */}
          {currentTab === "settings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div className="card-panel">
                <h3 className="panel-title" style={{ marginBottom: "12px" }}>
                  <SettingsIcon size={18} />
                  Contract & Network Configuration
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "16px",
                  }}
                >
                  <div className="dispute-box">
                    <div className="dispute-box-title">PayProof Contract Address</div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontFamily: "monospace",
                        color: "#60a5fa",
                      }}
                    >
                      <span>{PAYPROOF_ADDRESS}</span>
                      <button
                        className="preset-chip"
                        onClick={() => copyToClipboard(PAYPROOF_ADDRESS, "Contract address")}
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="dispute-box">
                    <div className="dispute-box-title">Authorized Arbitrator Address</div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontFamily: "monospace",
                        color: "#c084fc",
                      }}
                    >
                      <span>{arbitrator}</span>
                      <button
                        className="preset-chip"
                        onClick={() => copyToClipboard(arbitrator, "Arbitrator address")}
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="dispute-box">
                    <div className="dispute-box-title">Network & Chain ID</div>
                    <div style={{ color: "var(--text-main)", fontWeight: 600 }}>
                      Hardhat Local Network (Chain ID: {CHAIN_ID}) — {RPC_URL}
                    </div>
                  </div>
                </div>
              </div>

              {/* Demo Accounts Switcher Guide */}
              <div className="card-panel">
                <h3 className="panel-title" style={{ marginBottom: "8px" }}>
                  <ScaleIcon size={18} />
                  Role Demonstration Guide (MetaMask Testing)
                </h3>
                <p className="panel-desc" style={{ marginBottom: "20px" }}>
                  For university project evaluation and live demonstration, switch between these 3 standard Hardhat test accounts in MetaMask:
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {DEMO_ACCOUNTS.map((acc) => {
                    const isCurrent =
                      wallet && wallet.toLowerCase() === acc.address.toLowerCase();
                    return (
                      <div
                        key={acc.role}
                        style={{
                          background: isCurrent
                            ? "rgba(59, 130, 246, 0.12)"
                            : "var(--bg-secondary)",
                          border: `1px solid ${
                            isCurrent ? "rgba(59, 130, 246, 0.4)" : "var(--border-subtle)"
                          }`,
                          borderRadius: "12px",
                          padding: "16px 20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: "12px",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span
                              className={`role-badge ${
                                acc.role === "Arbitrator"
                                  ? "role-arbitrator"
                                  : acc.role === "Merchant"
                                  ? "role-merchant"
                                  : "role-customer"
                              }`}
                            >
                              {acc.role}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: "14px" }}>
                              {acc.label}
                            </span>
                            {isCurrent && (
                              <span
                                style={{
                                  fontSize: "11px",
                                  background: "#10b981",
                                  color: "white",
                                  padding: "2px 8px",
                                  borderRadius: "10px",
                                  fontWeight: 600,
                                }}
                              >
                                Active Wallet
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontFamily: "monospace",
                              fontSize: "12px",
                              color: "var(--text-dim)",
                              marginTop: "6px",
                            }}
                          >
                            {acc.address}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--text-muted)",
                              marginTop: "4px",
                            }}
                          >
                            {acc.desc}
                          </div>
                        </div>

                        <button
                          className="btn-secondary"
                          onClick={() => copyToClipboard(acc.address, `${acc.role} address`)}
                        >
                          <CopyIcon size={14} />
                          <span>Copy Address</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* POPUP ACTION MODAL */}
      {activeModal && selectedPayment && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {activeModal === "raiseDispute" && `Raise Dispute for Payment #${selectedPayment.id}`}
                {activeModal === "submitEvidence" && `Submit Evidence for Payment #${selectedPayment.id}`}
                {activeModal === "merchantRespond" && `Merchant Counter-Response #${selectedPayment.id}`}
                {activeModal === "resolveDispute" && `Arbitrator Ruling #${selectedPayment.id}`}
              </h3>
              <button
                onClick={closeModal}
                style={{ background: "transparent", color: "var(--text-dim)" }}
              >
                <XIcon size={20} />
              </button>
            </div>

            <div style={{ marginBottom: "16px", fontSize: "13px", color: "var(--text-muted)" }}>
              Payment Amount: <strong>₹{selectedPayment.amount}</strong> | Customer:{" "}
              <code>{selectedPayment.customer.slice(0, 6)}...</code> | Merchant:{" "}
              <code>{selectedPayment.merchant.slice(0, 6)}...</code>
            </div>

            {/* Modal Body Based On Action */}
            {activeModal === "raiseDispute" && (
              <div>
                <div className="form-group">
                  <label className="form-label">Dispute Reason (Required)</label>
                  <textarea
                    rows="3"
                    placeholder="Describe the issue (e.g. Item never delivered, damaged goods, incorrect billing)..."
                    value={modalForm.reason}
                    onChange={(e) =>
                      setModalForm({ ...modalForm, reason: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Evidence Identifier / IPFS Hash</label>
                  <input
                    type="text"
                    placeholder="e.g. ipfs://QmProofHash9876543210 or transaction receipt ID"
                    value={modalForm.evidenceHash}
                    onChange={(e) =>
                      setModalForm({ ...modalForm, evidenceHash: e.target.value })
                    }
                  />
                  <div className="presets-row">
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", alignSelf: "center" }}>
                      Sample IPFS Hashes:
                    </span>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() =>
                        setModalForm({
                          ...modalForm,
                          evidenceHash: "ipfs://QmProofReceiptDeliveryMissed8829",
                        })
                      }
                    >
                      Delivery Issue Hash
                    </button>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() =>
                        setModalForm({
                          ...modalForm,
                          evidenceHash: "ipfs://QmDefectivePhotoEvidence9912",
                        })
                      }
                    >
                      Defect Photo Hash
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeModal === "submitEvidence" && (
              <div>
                <div className="form-group">
                  <label className="form-label">Updated Evidence Hash / IPFS CID</label>
                  <input
                    type="text"
                    placeholder="e.g. ipfs://QmAdditionalDocumentProof7712"
                    value={modalForm.evidenceHash}
                    onChange={(e) =>
                      setModalForm({ ...modalForm, evidenceHash: e.target.value })
                    }
                  />
                </div>
              </div>
            )}

            {activeModal === "merchantRespond" && (
              <div>
                <div className="form-group">
                  <label className="form-label">Merchant Counter-Statement</label>
                  <textarea
                    rows="4"
                    placeholder="State your counter-claim or provide proof of fulfillment (e.g. Tracking ID #FEDEX-8839 shows delivered on Oct 30)..."
                    value={modalForm.response}
                    onChange={(e) =>
                      setModalForm({ ...modalForm, response: e.target.value })
                    }
                  />
                </div>
              </div>
            )}

            {activeModal === "resolveDispute" && (
              <div>
                <div style={{ marginBottom: "16px" }}>
                  <label className="form-label">Arbitrator Ruling Decision</label>
                  <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: "8px",
                        border: modalForm.approve
                          ? "2px solid #10b981"
                          : "1px solid var(--border-subtle)",
                        background: modalForm.approve
                          ? "rgba(16, 185, 129, 0.15)"
                          : "var(--bg-input)",
                        color: modalForm.approve ? "#34d399" : "var(--text-muted)",
                        fontWeight: 600,
                      }}
                      onClick={() => setModalForm({ ...modalForm, approve: true })}
                    >
                      Approve Refund (Customer Wins)
                    </button>

                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: "8px",
                        border: !modalForm.approve
                          ? "2px solid #ef4444"
                          : "1px solid var(--border-subtle)",
                        background: !modalForm.approve
                          ? "rgba(239, 68, 68, 0.15)"
                          : "var(--bg-input)",
                        color: !modalForm.approve ? "#f87171" : "var(--text-muted)",
                        fontWeight: 600,
                      }}
                      onClick={() => setModalForm({ ...modalForm, approve: false })}
                    >
                      Reject Refund (Merchant Wins)
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    padding: "12px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "var(--text-dim)",
                  }}
                >
                  ⚖️ This decision will be permanently recorded on the blockchain ledger and the dispute will be marked as resolved.
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
              <button className="btn-secondary" onClick={closeModal} disabled={txPending}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={submitModalAction}
                disabled={txPending}
              >
                {txPending ? "Confirming On-Chain..." : "Confirm & Sign Transaction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable Dispute Card Component
function DisputeCard({ payment, wallet, isArbitrator, onAction, onCopy }) {
  const isCustomer = wallet && payment.customer.toLowerCase() === wallet.toLowerCase();
  const isMerchant = wallet && payment.merchant.toLowerCase() === wallet.toLowerCase();

  return (
    <div className="dispute-card">
      <div className="card-top">
        <span className="dispute-id">PAYMENT #{payment.id}</span>
        <span
          className="status-badge"
          style={{
            background: payment.statusMeta.bg,
            color: payment.statusMeta.color,
            border: `1px solid ${payment.statusMeta.border}`,
          }}
        >
          {payment.statusMeta.label}
        </span>
      </div>

      <div className="dispute-amount">₹{Number(payment.amount).toLocaleString()}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div className="dispute-row">
          <span className="dispute-label">Customer:</span>
          <span className="dispute-value" onClick={() => onCopy(payment.customer, "Customer")}>
            {payment.customer.slice(0, 8)}...{payment.customer.slice(-6)}
          </span>
        </div>
        <div className="dispute-row">
          <span className="dispute-label">Merchant:</span>
          <span className="dispute-value" onClick={() => onCopy(payment.merchant, "Merchant")}>
            {payment.merchant.slice(0, 8)}...{payment.merchant.slice(-6)}
          </span>
        </div>
        <div className="dispute-row">
          <span className="dispute-label">Created:</span>
          <span className="dispute-value" style={{ fontFamily: "inherit" }}>
            {payment.timestamp > 0
              ? new Date(payment.timestamp * 1000).toLocaleString()
              : "N/A"}
          </span>
        </div>
      </div>

      {payment.disputeReason && (
        <div className="dispute-box">
          <div className="dispute-box-title">Dispute Reason</div>
          <div style={{ color: "var(--text-main)", fontSize: "13px" }}>
            {payment.disputeReason}
          </div>
        </div>
      )}

      {payment.evidenceHash && (
        <div className="dispute-box">
          <div className="dispute-box-title">Evidence Hash / IPFS</div>
          <div
            style={{
              color: "#60a5fa",
              fontSize: "12px",
              fontFamily: "monospace",
              wordBreak: "break-all",
              cursor: "pointer",
            }}
            onClick={() => onCopy(payment.evidenceHash, "Evidence hash")}
            title="Click to copy"
          >
            {payment.evidenceHash}
          </div>
        </div>
      )}

      {payment.merchantResponse && (
        <div className="dispute-box" style={{ borderColor: "rgba(59, 130, 246, 0.3)" }}>
          <div className="dispute-box-title" style={{ color: "#60a5fa" }}>
            Merchant Statement
          </div>
          <div style={{ color: "var(--text-main)", fontSize: "13px" }}>
            {payment.merchantResponse}
          </div>
        </div>
      )}

      {/* Role-Specific Actions */}
      <div className="dispute-actions">
        {/* Raise Dispute (Customer & status == 0) */}
        {payment.status === 0 && (
          <button
            className="btn-primary"
            style={{ fontSize: "12px", padding: "6px 12px" }}
            onClick={() => onAction("raiseDispute", payment)}
            disabled={!isCustomer && wallet !== ""}
            title={!isCustomer ? "Only the customer who created this payment can dispute" : ""}
          >
            Raise Dispute
          </button>
        )}

        {/* Submit Additional Evidence (Customer & status == 1) */}
        {payment.status === 1 && isCustomer && (
          <button
            className="btn-secondary"
            style={{ fontSize: "12px", padding: "6px 12px" }}
            onClick={() => onAction("submitEvidence", payment)}
          >
            Update Evidence
          </button>
        )}

        {/* Merchant Response (Merchant & status == 1) */}
        {payment.status === 1 && isMerchant && (
          <button
            className="btn-secondary"
            style={{ fontSize: "12px", padding: "6px 12px", borderColor: "#60a5fa" }}
            onClick={() => onAction("merchantRespond", payment)}
          >
            Submit Response
          </button>
        )}

        {/* Arbitrator Resolution (Arbitrator & status == 1) */}
        {payment.status === 1 && isArbitrator && (
          <button
            className="btn-primary"
            style={{
              fontSize: "12px",
              padding: "6px 12px",
              background: "linear-gradient(135deg, #7c3aed, #9333ea)",
            }}
            onClick={() => onAction("resolveDispute", payment)}
          >
            Arbitrate Ruling
          </button>
        )}

        {payment.status === 1 && !isCustomer && !isMerchant && !isArbitrator && (
          <span style={{ fontSize: "11px", color: "var(--text-dim)", alignSelf: "center" }}>
            Connect as Customer, Merchant, or Arbitrator to take action
          </span>
        )}
      </div>
    </div>
  );
}

// Reusable Transactions Table
function TransactionsTable({ payments, wallet, isArbitrator, onAction, onCopy }) {
  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Customer</th>
            <th>Merchant</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const isCustomer = wallet && p.customer.toLowerCase() === wallet.toLowerCase();
            const isMerchant = wallet && p.merchant.toLowerCase() === wallet.toLowerCase();

            return (
              <tr key={p.id}>
                <td style={{ fontWeight: 700, color: "#60a5fa" }}>#{p.id}</td>
                <td>
                  <span
                    style={{ fontFamily: "monospace", cursor: "pointer" }}
                    onClick={() => onCopy(p.customer, "Customer address")}
                  >
                    {p.customer.slice(0, 6)}...{p.customer.slice(-4)}
                  </span>
                </td>
                <td>
                  <span
                    style={{ fontFamily: "monospace", cursor: "pointer" }}
                    onClick={() => onCopy(p.merchant, "Merchant address")}
                  >
                    {p.merchant.slice(0, 6)}...{p.merchant.slice(-4)}
                  </span>
                </td>
                <td style={{ fontWeight: 600, color: "var(--text-main)" }}>
                  ₹{Number(p.amount).toLocaleString()}
                </td>
                <td>
                  <span
                    className="status-badge"
                    style={{
                      background: p.statusMeta.bg,
                      color: p.statusMeta.color,
                      border: `1px solid ${p.statusMeta.border}`,
                    }}
                  >
                    {p.statusMeta.label}
                  </span>
                </td>
                <td>
                  {p.timestamp > 0
                    ? new Date(p.timestamp * 1000).toLocaleDateString()
                    : "-"}
                </td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {p.status === 0 && (
                      <button
                        className="preset-chip"
                        onClick={() => onAction("raiseDispute", p)}
                        disabled={!isCustomer && wallet !== ""}
                      >
                        Dispute
                      </button>
                    )}
                    {p.status === 1 && isArbitrator && (
                      <button
                        className="preset-chip"
                        style={{ color: "#c084fc", borderColor: "#c084fc" }}
                        onClick={() => onAction("resolveDispute", p)}
                      >
                        Resolve
                      </button>
                    )}
                    {p.status === 1 && isMerchant && (
                      <button
                        className="preset-chip"
                        onClick={() => onAction("merchantRespond", p)}
                      >
                        Respond
                      </button>
                    )}
                    {p.status > 1 && (
                      <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                        Closed
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
