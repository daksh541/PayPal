import { useState, useEffect, useCallback } from "react";
import {
  ShieldIcon,
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
  ArrowRightIcon,
  TerminalIcon,
  BookIcon,
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
    desc: "Can approve or reject disputed refunds on-chain",
  },
  {
    role: "Customer",
    label: "Account #1 (Sample Customer / Buyer)",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    desc: "Can create payments and raise disputes with IPFS proof",
  },
  {
    role: "Merchant",
    label: "Account #2 (Sample Merchant / Seller)",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    desc: "Receives payments and submits merchant counter-statements",
  },
];

export default function App() {
  // Navigation: 'story' | 'dashboard' | 'disputes' | 'transactions' | 'settings'
  const [currentTab, setCurrentTab] = useState("story");

  // Blockchain state
  const [wallet, setWallet] = useState("");
  const [chainId, setChainId] = useState(null);
  const [arbitrator, setArbitrator] = useState(ARBITRATOR_ADDRESS);
  const [payments, setPayments] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [txPending, setTxPending] = useState(false);

  // Notifications / Toast
  const [toast, setToast] = useState(null);

  // Modals state
  const [activeModal, setActiveModal] = useState(null);
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
            {toast.type === "success" && <CheckIcon size={18} />}
            {toast.type === "error" && <XIcon size={18} />}
            {toast.type === "info" && <ShieldIcon size={18} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Top Navigation Bar (Agent37 format) */}
      <header className="agent-navbar">
        {/* Brand */}
        <div className="nav-brand" onClick={() => setCurrentTab("story")}>
          <div className="nav-brand-logo">
            <ShieldIcon size={16} />
          </div>
          <span className="nav-brand-title">payproof</span>
          <span className="nav-brand-badge">• ON-CHAIN</span>
        </div>

        {/* Center Pipeline Status Tracker */}
        <div className="nav-pipeline">
          <div className={`pipeline-step ${totalPayments > 0 ? "active" : ""}`}>
            <span className="pipeline-dot" />
            <span>RECORDED</span>
          </div>
          <div className={`pipeline-step ${activeDisputes > 0 ? "active" : ""}`}>
            <span className="pipeline-dot" />
            <span>DISPUTED</span>
          </div>
          <div className={`pipeline-step ${disputedPaymentsList.some((p) => p.merchantResponse) ? "active" : ""}`}>
            <span className="pipeline-dot" />
            <span>COUNTER-STATEMENT</span>
          </div>
          <div className={`pipeline-step ${approvedRefunds + rejectedRefunds > 0 ? "done" : ""}`}>
            <span className="pipeline-dot" />
            <span>ARBITRATED</span>
          </div>
          <div className="pipeline-step">
            <span className="pipeline-dot" />
            <span>SETTLED</span>
          </div>
        </div>

        {/* Right Nav Actions */}
        <div className="nav-actions">
          {/* Segmented Mode Switcher (Story | Terminal Ops) */}
          <div className="segmented-control">
            <button
              className={`segmented-btn ${currentTab === "story" ? "active" : ""}`}
              onClick={() => setCurrentTab("story")}
            >
              <BookIcon size={14} />
              <span>Story</span>
            </button>
            <button
              className={`segmented-btn ${currentTab === "dashboard" ? "active" : ""}`}
              onClick={() => setCurrentTab("dashboard")}
            >
              <TerminalIcon size={14} />
              <span>Terminal Ops</span>
            </button>
            <button
              className={`segmented-btn ${currentTab === "disputes" ? "active" : ""}`}
              onClick={() => setCurrentTab("disputes")}
            >
              <DisputeIcon size={14} />
              <span>Disputes ({activeDisputes})</span>
            </button>
            <button
              className={`segmented-btn ${currentTab === "transactions" ? "active" : ""}`}
              onClick={() => setCurrentTab("transactions")}
            >
              <TransactionsIcon size={14} />
              <span>Ledger</span>
            </button>
            <button
              className={`segmented-btn ${currentTab === "settings" ? "active" : ""}`}
              onClick={() => setCurrentTab("settings")}
            >
              <SettingsIcon size={14} />
              <span>Roles</span>
            </button>
          </div>

          {/* Connected Wallet or Connect Button */}
          {wallet ? (
            <div className="wallet-chip">
              <span
                className={`role-badge ${
                  isArbitrator
                    ? "role-arbitrator"
                    : currentRole === "Merchant"
                    ? "role-merchant"
                    : "role-customer"
                }`}
              >
                <ScaleIcon size={12} />
                {currentRole}
              </span>

              <span
                className="wallet-address"
                onClick={() => copyToClipboard(wallet, "Wallet address")}
                title="Click to copy full address"
              >
                {wallet.slice(0, 6)}...{wallet.slice(-4)}
                <CopyIcon size={12} />
              </span>

              <button
                className="btn-disconnect"
                onClick={disconnectWallet}
                title="Disconnect wallet"
              >
                ✕
              </button>
            </div>
          ) : (
            <button className="btn-electric" onClick={connectWallet}>
              <WalletIcon size={15} />
              <span>Connect Wallet</span>
              <ArrowRightIcon size={14} />
            </button>
          )}

          {/* Quick Trigger Button */}
          {wallet && (
            <button
              className="btn-electric"
              onClick={() => {
                setCurrentTab("dashboard");
                const target = document.getElementById("create-payment-section");
                if (target) {
                  target.scrollIntoView({ behavior: "smooth" });
                }
              }}
            >
              <span>Launch Terminal</span>
              <ArrowRightIcon size={14} />
            </button>
          )}
        </div>
      </header>

      {/* Hero Section (Matching exact format, colors, and typography from the image) */}
      <section className="agent-hero">
        <div className="hero-glow-bottom" />

        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-dot" />
            BACKED BY SMART CONTRACTS
          </div>

          <h1 className="hero-title">
            Payment disputes on<br />
            <span className="hero-title-accent">autopilot.</span>
          </h1>

          <p className="hero-subtitle">
            Say what went wrong. Submit cryptographic proof. PayProof handles everything
            in between: escrow logging, merchant rebuttal, and on-chain arbitration.
            Built for <span className="hero-underline">teams that demand trust.</span>
          </p>

          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              className="hero-cta"
              onClick={() => {
                setCurrentTab("dashboard");
                const target = document.getElementById("ops-workspace");
                if (target) {
                  target.scrollIntoView({ behavior: "smooth" });
                }
              }}
            >
              <span>Launch Terminal</span>
              <ArrowRightIcon size={16} />
            </button>

            {!wallet && (
              <button className="btn-secondary" onClick={connectWallet} style={{ padding: "12px 24px" }}>
                <WalletIcon size={16} />
                <span>Connect MetaMask</span>
              </button>
            )}

            <button
              className="btn-secondary"
              onClick={loadBlockchainData}
              disabled={loadingData}
              style={{ padding: "12px 20px" }}
              title="Refresh smart contract state"
            >
              <RefreshIcon size={15} className={loadingData ? "spin" : ""} />
              <span>Sync Ledger</span>
            </button>
          </div>
        </div>

        <div className="hero-scroll">
          <span className="hero-scroll-text">SCROLL</span>
          <div className="hero-scroll-line" />
        </div>
      </section>

      {/* Main Operations Workspace */}
      <main className="main-workspace" id="ops-workspace">
        {/* Wrong Network Warning */}
        {isWrongNetwork && (
          <div className="network-warning-banner">
            <div>
              ⚠️ <strong>Wrong Network Detected:</strong> MetaMask is on Chain ID{" "}
              {chainId}, but PayProof smart contracts are deployed to Hardhat Local (Chain{" "}
              {CHAIN_ID}).
            </div>
            <button onClick={handleSwitchNetwork}>Switch to Hardhat Local</button>
          </div>
        )}

        {/* Operations Header */}
        <div className="ops-header">
          <div className="ops-title-group">
            <h2>
              <TerminalIcon size={22} style={{ color: "#388af6" }} />
              On-Chain Terminal Operations
            </h2>
            <p>
              Decentralized dispute escalation and cryptographic arbitration engine
            </p>
          </div>

          <div className="network-live-pill">
            <span className={`live-pulse-dot ${isWrongNetwork ? "warning" : ""}`} />
            <span>
              {isWrongNetwork
                ? `Wrong Chain (${chainId})`
                : `Hardhat Local #${CHAIN_ID} • ${RPC_URL}`}
            </span>
          </div>
        </div>

        {/* 4 Stat Metric Cards (Always visible for live protocol health) */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-title">Total Payments</span>
              <div className="stat-icon" style={{ background: "rgba(56, 138, 246, 0.15)", color: "#60a5fa" }}>
                <PaymentIcon size={18} />
              </div>
            </div>
            <div className="stat-value">{totalPayments}</div>
            <div className="stat-sub">Simulated Volume: ₹{totalVolume.toLocaleString()}</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-title">Active Disputes</span>
              <div className="stat-icon" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" }}>
                <DisputeIcon size={18} />
              </div>
            </div>
            <div className="stat-value" style={{ color: "#fbbf24" }}>
              {activeDisputes}
            </div>
            <div className="stat-sub">Pending rebuttal or arbitrator decision</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-title">Refunds Approved</span>
              <div className="stat-icon" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}>
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
              <div className="stat-icon" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#f87171" }}>
                <XIcon size={18} />
              </div>
            </div>
            <div className="stat-value" style={{ color: "#f87171" }}>
              {rejectedRefunds}
            </div>
            <div className="stat-sub">Decided in favor of merchant</div>
          </div>
        </div>

        {/* Quick Demo Role Switcher & Autofill Bar (Essential for presentation) */}
        <div className="role-testing-bar">
          <div className="role-testing-header">
            <div className="role-testing-title">
              <ScaleIcon size={16} />
              <span>Standard Hardhat Test Accounts (Presentation & Role Testing)</span>
            </div>
            <span style={{ fontSize: "11px", color: "#64748b" }}>
              Switch accounts in MetaMask to test role access control
            </span>
          </div>

          <div className="role-accounts-grid">
            {DEMO_ACCOUNTS.map((acc) => {
              const isCurrent = wallet && wallet.toLowerCase() === acc.address.toLowerCase();
              return (
                <div
                  key={acc.role}
                  className={`role-account-pill ${isCurrent ? "active-wallet" : ""}`}
                >
                  <div className="role-pill-meta">
                    <div className="role-pill-name">
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
                      {isCurrent && (
                        <span style={{ fontSize: "10px", color: "#10b981", fontWeight: 700 }}>
                          ● ACTIVE
                        </span>
                      )}
                    </div>
                    <span className="role-pill-addr">{acc.address}</span>
                  </div>

                  <div className="role-pill-actions">
                    <button
                      className="preset-chip"
                      onClick={() => copyToClipboard(acc.address, `${acc.role} address`)}
                      title="Copy Address"
                    >
                      Copy
                    </button>
                    {acc.role === "Merchant" && (
                      <button
                        className="preset-chip"
                        style={{ color: "#388af6", borderColor: "rgba(56, 138, 246, 0.4)" }}
                        onClick={() => {
                          setMerchantInput(acc.address);
                          showToast("info", "Merchant address auto-filled in Payment form!");
                        }}
                        title="Use as Merchant in Payment Form"
                      >
                        Use
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* TAB 1: STORY VIEW (Detailed Protocol Walkthrough) */}
        {currentTab === "story" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className="card-panel">
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">
                    <BookIcon size={18} style={{ color: "#388af6" }} />
                    How PayProof Works Under the Hood
                  </h3>
                  <p className="panel-desc">
                    A decentralized arbitration and tamper-resistant transaction audit trail built on Ethereum smart contracts.
                  </p>
                </div>
                <button
                  className="btn-electric"
                  onClick={() => setCurrentTab("dashboard")}
                >
                  <span>Open Terminal Ops</span>
                  <ArrowRightIcon size={14} />
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "16px",
                  marginTop: "8px",
                }}
              >
                <div className="dispute-box" style={{ padding: "16px" }}>
                  <div className="dispute-box-title" style={{ color: "#388af6" }}>
                    Stage 01 • Payment Logging
                  </div>
                  <p style={{ fontSize: "13px", color: "#cbd5e1", marginTop: "6px", lineHeight: "1.5" }}>
                    Customer initiates a simulated payment to a verified merchant address. The transaction is permanently hashed on-chain with block timestamps.
                  </p>
                </div>

                <div className="dispute-box" style={{ padding: "16px" }}>
                  <div className="dispute-box-title" style={{ color: "#fbbf24" }}>
                    Stage 02 • Dispute Escalation
                  </div>
                  <p style={{ fontSize: "13px", color: "#cbd5e1", marginTop: "6px", lineHeight: "1.5" }}>
                    If a dispute arises (damaged goods, delivery failure), the customer submits a dispute reason and cryptographic IPFS proof hash.
                  </p>
                </div>

                <div className="dispute-box" style={{ padding: "16px" }}>
                  <div className="dispute-box-title" style={{ color: "#c084fc" }}>
                    Stage 03 • Merchant Counter-Rebuttal
                  </div>
                  <p style={{ fontSize: "13px", color: "#cbd5e1", marginTop: "6px", lineHeight: "1.5" }}>
                    Only the designated merchant account can submit a counter-statement or carrier fulfillment tracking ID to defend their position.
                  </p>
                </div>

                <div className="dispute-box" style={{ padding: "16px" }}>
                  <div className="dispute-box-title" style={{ color: "#34d399" }}>
                    Stage 04 • On-Chain Ruling
                  </div>
                  <p style={{ fontSize: "13px", color: "#cbd5e1", marginTop: "6px", lineHeight: "1.5" }}>
                    The authorized neutral arbitrator reviews the immutable trail and issues a final, non-repudiable Approve or Reject ruling.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Demo Launchpad */}
            <div className="card-panel" style={{ background: "rgba(56, 138, 246, 0.04)", borderColor: "rgba(56, 138, 246, 0.2)" }}>
              <div className="panel-header">
                <div>
                  <h4 style={{ color: "#ffffff", fontSize: "15px", fontWeight: 700 }}>
                    ⚡ Ready to test the simulated workflow?
                  </h4>
                  <p style={{ color: "#94a3b8", fontSize: "13px" }}>
                    Create a payment, raise an on-chain dispute, and resolve it with MetaMask.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button className="btn-electric" onClick={() => setCurrentTab("dashboard")}>
                    <TerminalIcon size={14} />
                    <span>Launch Terminal Ops</span>
                  </button>
                  <button className="btn-secondary" onClick={() => setCurrentTab("disputes")}>
                    <DisputeIcon size={14} />
                    <span>View Disputes ({activeDisputes})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TERMINAL OPS / DASHBOARD */}
        {currentTab === "dashboard" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: "24px",
            }}
          >
            {/* Left: Create Payment Console */}
            <div className="card-panel" id="create-payment-section">
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">
                    <PaymentIcon size={18} style={{ color: "#388af6" }} />
                    Simulate Payment
                  </h3>
                  <p className="panel-desc">
                    Broadcast a simulated on-chain payment from connected customer wallet
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreatePayment}>
                <div className="form-group">
                  <label className="form-label">Merchant Ethereum Address</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={merchantInput}
                    onChange={(e) => setMerchantInput(e.target.value)}
                    required
                  />
                  <div className="presets-row">
                    <span className="form-hint">Quick autofill:</span>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() => setMerchantInput(DEMO_ACCOUNTS[2].address)}
                    >
                      Sample Merchant (Acc #2)
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 1500"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    min="1"
                    required
                  />
                  <div className="presets-row">
                    <span className="form-hint">Presets:</span>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() => setAmountInput("500")}
                    >
                      ₹500
                    </button>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() => setAmountInput("1500")}
                    >
                      ₹1,500
                    </button>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() => setAmountInput("5000")}
                    >
                      ₹5,000
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Order Memo / Item Note (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Hardware Sensor Kit #372"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-electric"
                  style={{ width: "100%", justifyContent: "center", padding: "12px", marginTop: "8px" }}
                  disabled={txPending}
                >
                  {txPending ? (
                    "Confirming On-Chain..."
                  ) : (
                    <>
                      <span>Record Payment On-Chain</span>
                      <ArrowRightIcon size={14} />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Right: Live Dispute Stream */}
            <div className="card-panel">
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">
                    <DisputeIcon size={18} style={{ color: "#fbbf24" }} />
                    Active Disputes Feed ({activeDisputes})
                  </h3>
                  <p className="panel-desc">
                    Disputes requiring customer evidence, merchant counter-response, or arbitrator ruling
                  </p>
                </div>
                <button
                  className="preset-chip"
                  onClick={() => setCurrentTab("disputes")}
                >
                  View All
                </button>
              </div>

              {disputedPaymentsList.length === 0 ? (
                <div
                  style={{
                    padding: "40px 20px",
                    textAlign: "center",
                    color: "var(--text-dim)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <ShieldIcon size={32} style={{ color: "rgba(255,255,255,0.15)" }} />
                  <p style={{ fontSize: "14px" }}>No active disputes currently open.</p>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Payments can be disputed by the customer from the Ledger tab.
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {disputedPaymentsList.slice(0, 3).map((p) => (
                    <DisputeCard
                      key={p.id}
                      payment={p}
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

        {/* TAB 3: FULL DISPUTES VIEW */}
        {currentTab === "disputes" && (
          <div className="card-panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">
                  <DisputeIcon size={20} style={{ color: "#fbbf24" }} />
                  Dispute Arbitration Center
                </h3>
                <p className="panel-desc">
                  Live on-chain dispute records with cryptographic IPFS evidence hashes and merchant rebuttals
                </p>
              </div>
            </div>

            {disputedPaymentsList.length === 0 ? (
              <div
                style={{
                  padding: "60px 20px",
                  textAlign: "center",
                  color: "var(--text-dim)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <ShieldIcon size={40} style={{ color: "rgba(255,255,255,0.15)" }} />
                <h4 style={{ color: "#ffffff", fontSize: "16px" }}>No Open Disputes</h4>
                <p style={{ fontSize: "13px", maxWidth: "400px", color: "#64748b" }}>
                  All recorded payments are currently in good standing. To test dispute resolution, go to Ledger and raise a dispute on any recorded payment.
                </p>
                <button
                  className="btn-electric"
                  onClick={() => setCurrentTab("transactions")}
                  style={{ marginTop: "10px" }}
                >
                  <span>Go to Ledger</span>
                  <ArrowRightIcon size={14} />
                </button>
              </div>
            ) : (
              <div className="dispute-grid">
                {disputedPaymentsList.map((p) => (
                  <DisputeCard
                    key={p.id}
                    payment={p}
                    wallet={wallet}
                    isArbitrator={isArbitrator}
                    onAction={openActionModal}
                    onCopy={copyToClipboard}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: AUDIT TRAIL & TRANSACTIONS */}
        {currentTab === "transactions" && (
          <div className="card-panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">
                  <TransactionsIcon size={20} style={{ color: "#388af6" }} />
                  On-Chain Payment Ledger & Audit Trail
                </h3>
                <p className="panel-desc">
                  Immutable transaction history queryable directly from the smart contract state
                </p>
              </div>

              {/* Filter Pills */}
              <div className="segmented-control">
                <button
                  className={`segmented-btn ${txFilter === "all" ? "active" : ""}`}
                  onClick={() => setTxFilter("all")}
                >
                  All ({payments.length})
                </button>
                <button
                  className={`segmented-btn ${txFilter === "recorded" ? "active" : ""}`}
                  onClick={() => setTxFilter("recorded")}
                >
                  Recorded ({payments.filter((p) => p.status === 0).length})
                </button>
                <button
                  className={`segmented-btn ${txFilter === "disputed" ? "active" : ""}`}
                  onClick={() => setTxFilter("disputed")}
                >
                  Disputed ({activeDisputes})
                </button>
                <button
                  className={`segmented-btn ${txFilter === "refunded" ? "active" : ""}`}
                  onClick={() => setTxFilter("refunded")}
                >
                  Refunded ({approvedRefunds})
                </button>
                <button
                  className={`segmented-btn ${txFilter === "rejected" ? "active" : ""}`}
                  onClick={() => setTxFilter("rejected")}
                >
                  Rejected ({rejectedRefunds})
                </button>
              </div>
            </div>

            {filteredPayments.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                No payments match the selected filter.
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
                      fontFamily: "var(--font-mono)",
                      color: "#388af6",
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
                      fontFamily: "var(--font-mono)",
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

            {/* Role Demonstration Guide */}
            <div className="card-panel">
              <h3 className="panel-title" style={{ marginBottom: "8px" }}>
                <ScaleIcon size={18} />
                MetaMask Role-Testing Walkthrough
              </h3>
              <p className="panel-desc" style={{ marginBottom: "20px" }}>
                For project evaluation and viva defense, switch between these standard Hardhat test accounts in MetaMask to demonstrate role-based access control:
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {DEMO_ACCOUNTS.map((acc) => {
                  const isCurrent =
                    wallet && wallet.toLowerCase() === acc.address.toLowerCase();
                  return (
                    <div
                      key={acc.role}
                      className="role-account-pill"
                      style={{ padding: "16px 20px" }}
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
                            fontFamily: "var(--font-mono)",
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
              <code style={{ fontFamily: "var(--font-mono)", color: "#388af6" }}>
                {selectedPayment.customer.slice(0, 6)}...
              </code>{" "}
              | Merchant:{" "}
              <code style={{ fontFamily: "var(--font-mono)", color: "#fbbf24" }}>
                {selectedPayment.merchant.slice(0, 6)}...
              </code>
            </div>

            {/* Modal Body Based On Action */}
            {activeModal === "raiseDispute" && (
              <div>
                <div className="form-group">
                  <label className="form-label">Dispute Reason (Required)</label>
                  <textarea
                    rows="3"
                    placeholder="Describe the issue (e.g. Item never delivered, defective goods, unauthorized charge)..."
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
                    placeholder="e.g. ipfs://QmProofHash9876543210 or invoice hash"
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
                className="btn-electric"
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
              color: "#388af6",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
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
        <div className="dispute-box" style={{ borderColor: "rgba(56, 138, 246, 0.3)" }}>
          <div className="dispute-box-title" style={{ color: "#388af6" }}>
            Merchant Statement
          </div>
          <div style={{ color: "var(--text-main)", fontSize: "13px" }}>
            {payment.merchantResponse}
          </div>
        </div>
      )}

      {/* Role-Specific Actions */}
      <div className="dispute-actions">
        {payment.status === 0 && (
          <button
            className="btn-electric"
            style={{ fontSize: "12px", padding: "6px 14px" }}
            onClick={() => onAction("raiseDispute", payment)}
            disabled={!isCustomer && wallet !== ""}
            title={!isCustomer ? "Only the customer who created this payment can dispute" : ""}
          >
            Raise Dispute
          </button>
        )}

        {payment.status === 1 && isCustomer && (
          <button
            className="btn-secondary"
            style={{ fontSize: "12px", padding: "6px 14px" }}
            onClick={() => onAction("submitEvidence", payment)}
          >
            Update Evidence
          </button>
        )}

        {payment.status === 1 && isMerchant && (
          <button
            className="btn-secondary"
            style={{ fontSize: "12px", padding: "6px 14px", borderColor: "#388af6" }}
            onClick={() => onAction("merchantRespond", payment)}
          >
            Submit Response
          </button>
        )}

        {payment.status === 1 && isArbitrator && (
          <button
            className="btn-electric"
            style={{
              fontSize: "12px",
              padding: "6px 14px",
              background: "linear-gradient(135deg, #7c3aed, #9333ea)",
              boxShadow: "0 0 16px rgba(147, 51, 234, 0.4)",
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
                <td style={{ fontWeight: 700, color: "#388af6", fontFamily: "var(--font-mono)" }}>
                  #{p.id}
                </td>
                <td>
                  <span
                    style={{ fontFamily: "var(--font-mono)", cursor: "pointer" }}
                    onClick={() => onCopy(p.customer, "Customer address")}
                  >
                    {p.customer.slice(0, 6)}...{p.customer.slice(-4)}
                  </span>
                </td>
                <td>
                  <span
                    style={{ fontFamily: "var(--font-mono)", cursor: "pointer" }}
                    onClick={() => onCopy(p.merchant, "Merchant address")}
                  >
                    {p.merchant.slice(0, 6)}...{p.merchant.slice(-4)}
                  </span>
                </td>
                <td style={{ fontWeight: 700, color: "#ffffff" }}>
                  ₹{Number(p.amount).toLocaleString()}
                </td>
                <td>
                  <span
                    className="status-badge"
                    style={{
                      background: p.statusMeta.bg,
                      color: paymentStatusTextColor(p.status),
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

function paymentStatusTextColor(status) {
  switch (status) {
    case 0:
      return "#60a5fa";
    case 1:
      return "#fbbf24";
    case 2:
      return "#34d399";
    case 3:
      return "#f87171";
    default:
      return "#cbd5e1";
  }
}
