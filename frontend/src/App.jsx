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

const DEMO_ACCOUNTS = [
  {
    role: "Arbitrator",
    label: "Account #0 — Contract Deployer / Arbitrator",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    desc: "Can approve or reject disputed refunds on-chain",
  },
  {
    role: "Customer",
    label: "Account #1 — Sample Customer / Buyer",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    desc: "Can create payments and raise disputes with IPFS proof",
  },
  {
    role: "Merchant",
    label: "Account #2 — Sample Merchant / Seller",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    desc: "Receives payments and submits counter-statements",
  },
];

export default function App() {
  const [wallet, setWallet] = useState("");
  const [chainId, setChainId] = useState(null);
  const [arbitrator, setArbitrator] = useState(ARBITRATOR_ADDRESS);
  const [payments, setPayments] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [modalForm, setModalForm] = useState({ reason: "", evidenceHash: "", response: "", approve: true });
  const [merchantInput, setMerchantInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [txFilter, setTxFilter] = useState("all");

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const copyToClipboard = (text, label = "Address") => {
    navigator.clipboard.writeText(text);
    showToast("info", `${label} copied to clipboard!`);
  };

  const isArbitrator = wallet && arbitrator && wallet.toLowerCase() === arbitrator.toLowerCase();

  const getRoleForAccount = (address) => {
    if (!address) return "Visitor";
    if (arbitrator && address.toLowerCase() === arbitrator.toLowerCase()) return "Arbitrator";
    if (address.toLowerCase() === DEMO_ACCOUNTS[1].address.toLowerCase()) return "Customer";
    if (address.toLowerCase() === DEMO_ACCOUNTS[2].address.toLowerCase()) return "Merchant";
    return "User";
  };

  const currentRole = getRoleForAccount(wallet);

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

  const connectWallet = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      showToast("error", "MetaMask is not installed.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accounts?.length > 0) {
        setWallet(accounts[0]);
        showToast("success", `Connected: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);
      }
      const hex = await window.ethereum.request({ method: "eth_chainId" });
      const id = parseInt(hex, 16);
      setChainId(id);
      if (id !== CHAIN_ID) {
        try {
          await switchOrAddHardhatNetwork();
          const h = await window.ethereum.request({ method: "eth_chainId" });
          setChainId(parseInt(h, 16));
        } catch {
          showToast("error", "Wrong network — switch to Hardhat Local (31337).");
        }
      }
      await loadBlockchainData();
    } catch (err) {
      showToast("error", parseErrorMessage(err));
    }
  };

  const disconnectWallet = () => {
    setWallet("");
    showToast("info", "Wallet disconnected.");
  };

  const handleSwitchNetwork = async () => {
    try {
      await switchOrAddHardhatNetwork();
      const hex = await window.ethereum.request({ method: "eth_chainId" });
      setChainId(parseInt(hex, 16));
      showToast("success", "Switched to Hardhat Local (31337).");
      await loadBlockchainData();
    } catch (err) {
      showToast("error", parseErrorMessage(err));
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((a) => { if (a?.length) setWallet(a[0]); }).catch(() => {});
      window.ethereum.request({ method: "eth_chainId" }).then((h) => setChainId(parseInt(h, 16))).catch(() => {});
      const onAccounts = (a) => { if (!a.length) { setWallet(""); showToast("info", "MetaMask disconnected."); } else { setWallet(a[0]); showToast("info", `Account changed: ${a[0].slice(0,6)}...${a[0].slice(-4)}`); loadBlockchainData(); }};
      const onChain = (h) => { setChainId(parseInt(h, 16)); loadBlockchainData(); };
      window.ethereum.on("accountsChanged", onAccounts);
      window.ethereum.on("chainChanged", onChain);
      return () => { window.ethereum.removeListener("accountsChanged", onAccounts); window.ethereum.removeListener("chainChanged", onChain); };
    }
  }, [loadBlockchainData]);

  useEffect(() => { loadBlockchainData(); }, [loadBlockchainData]); // eslint-disable-line

  const handleCreatePayment = async (e) => {
    e.preventDefault();
    if (!wallet) { showToast("error", "Connect your wallet first."); return; }
    if (!merchantInput || !merchantInput.startsWith("0x") || merchantInput.length !== 42) { showToast("error", "Enter a valid merchant address."); return; }
    if (merchantInput.toLowerCase() === wallet.toLowerCase()) { showToast("error", "Customer cannot be merchant."); return; }
    if (!amountInput || Number(amountInput) <= 0) { showToast("error", "Amount must be > 0."); return; }
    setTxPending(true);
    try {
      showToast("info", "Broadcasting payment...");
      const { hash } = await createPaymentTx(wallet, merchantInput, amountInput);
      showToast("success", `Payment created! Tx: ${hash.slice(0, 10)}...`);
      setMerchantInput(""); setAmountInput(""); setNoteInput("");
      await loadBlockchainData();
    } catch (err) { showToast("error", parseErrorMessage(err)); } finally { setTxPending(false); }
  };

  const openActionModal = (type, payment) => { setSelectedPayment(payment); setActiveModal(type); setModalForm({ reason: "", evidenceHash: "", response: "", approve: true }); };
  const closeModal = () => { setActiveModal(null); setSelectedPayment(null); };

  const submitModalAction = async () => {
    if (!wallet || !selectedPayment) return;
    setTxPending(true);
    try {
      if (activeModal === "raiseDispute") {
        if (!modalForm.reason.trim()) { showToast("error", "Reason required."); setTxPending(false); return; }
        await raiseDisputeTx(wallet, selectedPayment.id, modalForm.reason, modalForm.evidenceHash || "ipfs://QmDefault");
        showToast("success", `Dispute opened for #${selectedPayment.id}!`);
      } else if (activeModal === "submitEvidence") {
        if (!modalForm.evidenceHash.trim()) { showToast("error", "Hash required."); setTxPending(false); return; }
        await submitEvidenceTx(wallet, selectedPayment.id, modalForm.evidenceHash);
        showToast("success", "Evidence recorded!");
      } else if (activeModal === "merchantRespond") {
        if (!modalForm.response.trim()) { showToast("error", "Response required."); setTxPending(false); return; }
        await merchantRespondTx(wallet, selectedPayment.id, modalForm.response);
        showToast("success", "Merchant response recorded!");
      } else if (activeModal === "resolveDispute") {
        await resolveDisputeTx(wallet, selectedPayment.id, modalForm.approve);
        showToast("success", `Dispute #${selectedPayment.id} ${modalForm.approve ? "approved" : "rejected"}!`);
      }
      closeModal();
      await loadBlockchainData();
    } catch (err) { showToast("error", parseErrorMessage(err)); } finally { setTxPending(false); }
  };

  const totalPayments = payments.length;
  const activeDisputes = payments.filter((p) => p.status === 1).length;
  const approvedRefunds = payments.filter((p) => p.status === 2).length;
  const rejectedRefunds = payments.filter((p) => p.status === 3).length;
  const totalVolume = payments.reduce((a, p) => a + Number(p.amount), 0);
  const filteredPayments = payments.filter((p) => {
    if (txFilter === "all") return true;
    if (txFilter === "recorded") return p.status === 0;
    if (txFilter === "disputed") return p.status === 1;
    if (txFilter === "refunded") return p.status === 2;
    if (txFilter === "rejected") return p.status === 3;
    return true;
  });
  const disputedPayments = payments.filter((p) => p.status === 1);
  const isWrongNetwork = wallet && chainId !== null && chainId !== CHAIN_ID;

  // Short address helper
  const shortAddr = (a) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  return (
    <div className="app-container">
      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>
            {toast.type === "success" && <CheckIcon size={16} />}
            {toast.type === "error" && <XIcon size={16} />}
            {toast.type === "info" && <ShieldIcon size={16} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* ===== NAVBAR ===== */}
      <header className="agent-navbar">
        <div className="nav-brand">
          <div className="nav-brand-logo"><ShieldIcon size={15} /></div>
          <span className="nav-brand-title">payproof</span>
          <span className={`nav-network-dot ${isWrongNetwork ? "wrong" : "live"}`} style={{ marginLeft: 6 }} />
          <span className="nav-network-label">
            {isWrongNetwork ? `Chain ${chainId}` : `Hardhat #${CHAIN_ID}`}
          </span>
        </div>

        <div className="nav-actions">
          <button className="btn-secondary" onClick={loadBlockchainData} disabled={loadingData} title="Sync">
            <RefreshIcon size={14} className={loadingData ? "spin" : ""} />
            <span>Sync</span>
          </button>

          {wallet ? (
            <div className="wallet-chip">
              <span className={`role-badge ${isArbitrator ? "role-arbitrator" : currentRole === "Merchant" ? "role-merchant" : "role-customer"}`}>
                <ScaleIcon size={11} /> {currentRole}
              </span>
              <span className="wallet-address" onClick={() => copyToClipboard(wallet, "Wallet")} title="Copy">
                {shortAddr(wallet)} <CopyIcon size={11} />
              </span>
              <button className="btn-disconnect" onClick={disconnectWallet}>✕</button>
            </div>
          ) : (
            <button className="btn-electric" onClick={connectWallet}>
              <WalletIcon size={14} /> Connect Wallet <ArrowRightIcon size={13} />
            </button>
          )}
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="agent-hero">
        <div className="hero-glow-bottom" />
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-dot" /> BACKED BY SMART CONTRACTS
          </div>
          <h1 className="hero-title">Payment disputes<br />on autopilot.</h1>
          <p className="hero-subtitle">
            Say what went wrong. Submit cryptographic proof. PayProof handles everything
            in between: escrow logging, merchant rebuttal, and on-chain arbitration.
            Built for <span className="hero-underline">teams that demand trust.</span>
          </p>
          <div className="hero-cta-row">
            {!wallet ? (
              <button className="btn-electric" onClick={connectWallet} style={{ padding: "12px 28px", fontSize: "15px" }}>
                Connect MetaMask <ArrowRightIcon size={15} />
              </button>
            ) : (
              <a href="#create-payment" className="btn-electric" style={{ padding: "12px 28px", fontSize: "15px", textDecoration: "none" }}>
                Create Payment <ArrowRightIcon size={15} />
              </a>
            )}
          </div>
        </div>
        <div className="hero-scroll">
          <span className="hero-scroll-text">SCROLL</span>
          <div className="hero-scroll-line" />
        </div>
      </section>

      {/* ===== MAIN CONTENT — Top to Bottom Flow ===== */}
      <main className="main-content">

        {/* Wrong Network Warning */}
        {isWrongNetwork && (
          <div className="network-warning-banner">
            <div>⚠️ <strong>Wrong Network:</strong> MetaMask is on Chain {chainId}, but PayProof uses Hardhat Local ({CHAIN_ID}).</div>
            <button onClick={handleSwitchNetwork}>Switch Network</button>
          </div>
        )}

        {/* ── Section 1: Protocol Overview Metrics ── */}
        <div>
          <div className="section-header" style={{ marginBottom: 14 }}>
            <div>
              <div className="section-title"><TransactionsIcon size={20} style={{ color: "#388af6" }} /> Protocol Overview</div>
              <div className="section-desc">Live on-chain metrics from the PayProof smart contract</div>
            </div>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Total Payments</span>
                <div className="stat-icon" style={{ background: "rgba(56,138,246,0.15)", color: "#60a5fa" }}><PaymentIcon size={16} /></div>
              </div>
              <div className="stat-value">{totalPayments}</div>
              <div className="stat-sub">Volume: ₹{totalVolume.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Active Disputes</span>
                <div className="stat-icon" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}><DisputeIcon size={16} /></div>
              </div>
              <div className="stat-value" style={{ color: "#fbbf24" }}>{activeDisputes}</div>
              <div className="stat-sub">Awaiting action</div>
            </div>
            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Approved</span>
                <div className="stat-icon" style={{ background: "rgba(16,185,129,0.15)", color: "#34d399" }}><CheckIcon size={16} /></div>
              </div>
              <div className="stat-value" style={{ color: "#34d399" }}>{approvedRefunds}</div>
              <div className="stat-sub">Customer wins</div>
            </div>
            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Rejected</span>
                <div className="stat-icon" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}><XIcon size={16} /></div>
              </div>
              <div className="stat-value" style={{ color: "#f87171" }}>{rejectedRefunds}</div>
              <div className="stat-sub">Merchant wins</div>
            </div>
          </div>
        </div>

        <div className="section-divider" />

        {/* ── Section 2: Create Payment + Active Disputes ── */}
        <div>
          <div className="section-header" style={{ marginBottom: 14 }}>
            <div>
              <div className="section-title"><PaymentIcon size={20} style={{ color: "#388af6" }} /> Operations</div>
              <div className="section-desc">Create payments and manage active disputes</div>
            </div>
          </div>

          <div className="two-col">
            {/* Create Payment */}
            <div className="card-panel" id="create-payment">
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Simulate Payment</h3>
              <p style={{ fontSize: 12, color: "#64748b", marginBottom: 18 }}>Broadcast a simulated on-chain payment from your wallet</p>

              <form onSubmit={handleCreatePayment}>
                <div className="form-group">
                  <label className="form-label">Merchant Address</label>
                  <input type="text" placeholder="0x..." value={merchantInput} onChange={(e) => setMerchantInput(e.target.value)} required />
                  <div className="presets-row">
                    <span className="form-hint">Quick fill:</span>
                    <button type="button" className="preset-chip" onClick={() => setMerchantInput(DEMO_ACCOUNTS[2].address)}>Sample Merchant</button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Amount (₹)</label>
                  <input type="number" placeholder="e.g. 1500" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} min="1" required />
                  <div className="presets-row">
                    {["500", "1500", "5000"].map((v) => (
                      <button key={v} type="button" className="preset-chip" onClick={() => setAmountInput(v)}>₹{Number(v).toLocaleString()}</button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Note (Optional)</label>
                  <input type="text" placeholder="e.g. Hardware Kit #372" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} />
                </div>
                <button type="submit" className="btn-electric" disabled={txPending} style={{ width: "100%", justifyContent: "center", padding: "11px" }}>
                  {txPending ? "Confirming..." : <><span>Record Payment</span> <ArrowRightIcon size={14} /></>}
                </button>
              </form>
            </div>

            {/* Active Disputes */}
            <div className="card-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Active Disputes</h3>
                  <p style={{ fontSize: 12, color: "#64748b" }}>{activeDisputes} dispute{activeDisputes !== 1 ? "s" : ""} awaiting resolution</p>
                </div>
              </div>

              {disputedPayments.length === 0 ? (
                <div className="empty-state">
                  <ShieldIcon size={28} style={{ color: "rgba(255,255,255,0.12)" }} />
                  <p>No active disputes. Create a payment and dispute it from the ledger below.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {disputedPayments.slice(0, 4).map((p) => (
                    <DisputeCard key={p.id} payment={p} wallet={wallet} isArbitrator={isArbitrator} onAction={openActionModal} onCopy={copyToClipboard} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="section-divider" />

        {/* ── Section 3: Transaction Ledger ── */}
        <div>
          <div className="section-header" style={{ marginBottom: 14 }}>
            <div>
              <div className="section-title"><TransactionsIcon size={20} style={{ color: "#388af6" }} /> Transaction Ledger</div>
              <div className="section-desc">Immutable on-chain audit trail of all payments</div>
            </div>
            <div className="filter-tabs">
              {[
                { key: "all", label: "All", count: payments.length },
                { key: "recorded", label: "Recorded", count: payments.filter((p) => p.status === 0).length },
                { key: "disputed", label: "Disputed", count: activeDisputes },
                { key: "refunded", label: "Refunded", count: approvedRefunds },
                { key: "rejected", label: "Rejected", count: rejectedRefunds },
              ].map((f) => (
                <button key={f.key} className={`filter-tab ${txFilter === f.key ? "active" : ""}`} onClick={() => setTxFilter(f.key)}>
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
          </div>

          {filteredPayments.length === 0 ? (
            <div className="card-panel">
              <div className="empty-state">
                <TransactionsIcon size={28} style={{ color: "rgba(255,255,255,0.12)" }} />
                <p>No transactions found.</p>
              </div>
            </div>
          ) : (
            <TransactionsTable payments={filteredPayments} wallet={wallet} isArbitrator={isArbitrator} onAction={openActionModal} onCopy={copyToClipboard} />
          )}
        </div>

        <div className="section-divider" />

        {/* ── Section 4: Contract & Network Info ── */}
        <div>
          <div className="section-header" style={{ marginBottom: 14 }}>
            <div>
              <div className="section-title"><SettingsIcon size={20} style={{ color: "#388af6" }} /> Contract & Network</div>
              <div className="section-desc">Smart contract deployment details and chain configuration</div>
            </div>
          </div>

          <div className="config-grid">
            <div className="config-item">
              <div className="config-label">PayProof Contract</div>
              <div className="config-value">
                <span className="config-addr" style={{ color: "#60a5fa" }}>{PAYPROOF_ADDRESS}</span>
                <button className="preset-chip" onClick={() => copyToClipboard(PAYPROOF_ADDRESS, "Contract")}>Copy</button>
              </div>
            </div>
            <div className="config-item">
              <div className="config-label">Authorized Arbitrator</div>
              <div className="config-value">
                <span className="config-addr" style={{ color: "#c084fc" }}>{arbitrator}</span>
                <button className="preset-chip" onClick={() => copyToClipboard(arbitrator, "Arbitrator")}>Copy</button>
              </div>
            </div>
            <div className="config-item">
              <div className="config-label">Network</div>
              <div className="config-value">
                <div>
                  <div style={{ color: "#ffffff", fontWeight: 600, fontSize: 14 }}>Hardhat Local</div>
                  <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>Chain ID: {CHAIN_ID} &nbsp;·&nbsp; RPC: {RPC_URL}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="section-divider" />

        {/* ── Section 5: Demo Role Accounts ── */}
        <div>
          <div className="section-header" style={{ marginBottom: 6 }}>
            <div>
              <div className="section-title"><ScaleIcon size={20} style={{ color: "#388af6" }} /> Demo Role Accounts</div>
              <div className="section-desc">Switch between these Hardhat test accounts in MetaMask to test role-based access</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {DEMO_ACCOUNTS.map((acc) => {
              const isCurrent = wallet && wallet.toLowerCase() === acc.address.toLowerCase();
              return (
                <div key={acc.role} className={`role-card ${isCurrent ? "active-wallet" : ""}`}>
                  <div className="role-card-info">
                    <div className="role-card-top">
                      <span className={`role-badge ${acc.role === "Arbitrator" ? "role-arbitrator" : acc.role === "Merchant" ? "role-merchant" : "role-customer"}`}>
                        {acc.role}
                      </span>
                      <span className="role-card-label">{acc.label}</span>
                      {isCurrent && <span className="active-pill">● Active</span>}
                    </div>
                    <span className="role-card-addr">{acc.address}</span>
                    <span className="role-card-desc">{acc.desc}</span>
                  </div>
                  <div className="role-card-actions">
                    <button className="preset-chip" onClick={() => copyToClipboard(acc.address, `${acc.role} address`)}>Copy</button>
                    {acc.role === "Merchant" && (
                      <button className="preset-chip" style={{ color: "#388af6", borderColor: "rgba(56,138,246,0.4)" }}
                        onClick={() => { setMerchantInput(acc.address); showToast("info", "Merchant address filled!"); }}>
                        Use
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </main>

      {/* ===== MODAL ===== */}
      {activeModal && selectedPayment && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {activeModal === "raiseDispute" && `Raise Dispute — #${selectedPayment.id}`}
                {activeModal === "submitEvidence" && `Submit Evidence — #${selectedPayment.id}`}
                {activeModal === "merchantRespond" && `Merchant Response — #${selectedPayment.id}`}
                {activeModal === "resolveDispute" && `Arbitrator Ruling — #${selectedPayment.id}`}
              </h3>
              <button onClick={closeModal} style={{ background: "transparent", color: "#64748b" }}><XIcon size={18} /></button>
            </div>

            <div style={{ marginBottom: 16, fontSize: 13, color: "#94a3b8" }}>
              Amount: <strong style={{ color: "#fff" }}>₹{selectedPayment.amount}</strong> &nbsp;·&nbsp;
              Customer: <code style={{ fontFamily: "var(--font-mono)", color: "#60a5fa" }}>{shortAddr(selectedPayment.customer)}</code> &nbsp;·&nbsp;
              Merchant: <code style={{ fontFamily: "var(--font-mono)", color: "#fbbf24" }}>{shortAddr(selectedPayment.merchant)}</code>
            </div>

            {activeModal === "raiseDispute" && (
              <div>
                <div className="form-group">
                  <label className="form-label">Dispute Reason</label>
                  <textarea rows="3" placeholder="Describe the issue..." value={modalForm.reason} onChange={(e) => setModalForm({ ...modalForm, reason: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Evidence / IPFS Hash</label>
                  <input type="text" placeholder="ipfs://Qm..." value={modalForm.evidenceHash} onChange={(e) => setModalForm({ ...modalForm, evidenceHash: e.target.value })} />
                  <div className="presets-row">
                    <span className="form-hint">Samples:</span>
                    <button type="button" className="preset-chip" onClick={() => setModalForm({ ...modalForm, evidenceHash: "ipfs://QmProofDeliveryMissed8829" })}>Delivery Issue</button>
                    <button type="button" className="preset-chip" onClick={() => setModalForm({ ...modalForm, evidenceHash: "ipfs://QmDefectivePhotoEvidence9912" })}>Defect Photo</button>
                  </div>
                </div>
              </div>
            )}

            {activeModal === "submitEvidence" && (
              <div className="form-group">
                <label className="form-label">Updated Evidence Hash</label>
                <input type="text" placeholder="ipfs://Qm..." value={modalForm.evidenceHash} onChange={(e) => setModalForm({ ...modalForm, evidenceHash: e.target.value })} />
              </div>
            )}

            {activeModal === "merchantRespond" && (
              <div className="form-group">
                <label className="form-label">Counter-Statement</label>
                <textarea rows="4" placeholder="Provide proof of fulfillment..." value={modalForm.response} onChange={(e) => setModalForm({ ...modalForm, response: e.target.value })} />
              </div>
            )}

            {activeModal === "resolveDispute" && (
              <div>
                <label className="form-label" style={{ marginBottom: 8, display: "block" }}>Decision</label>
                <div style={{ display: "flex", gap: 12 }}>
                  <button type="button" onClick={() => setModalForm({ ...modalForm, approve: true })}
                    style={{ flex: 1, padding: 12, borderRadius: 8, fontWeight: 600,
                      border: modalForm.approve ? "2px solid #10b981" : "1px solid var(--border-subtle)",
                      background: modalForm.approve ? "rgba(16,185,129,0.15)" : "var(--bg-input)",
                      color: modalForm.approve ? "#34d399" : "#94a3b8" }}>
                    Approve Refund
                  </button>
                  <button type="button" onClick={() => setModalForm({ ...modalForm, approve: false })}
                    style={{ flex: 1, padding: 12, borderRadius: 8, fontWeight: 600,
                      border: !modalForm.approve ? "2px solid #ef4444" : "1px solid var(--border-subtle)",
                      background: !modalForm.approve ? "rgba(239,68,68,0.15)" : "var(--bg-input)",
                      color: !modalForm.approve ? "#f87171" : "#94a3b8" }}>
                    Reject Refund
                  </button>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 8, fontSize: 12, color: "#64748b", marginTop: 14 }}>
                  ⚖️ This ruling is permanently recorded on the blockchain.
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button className="btn-secondary" onClick={closeModal} disabled={txPending}>Cancel</button>
              <button className="btn-electric" onClick={submitModalAction} disabled={txPending}>
                {txPending ? "Confirming..." : "Confirm & Sign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ── Dispute Card ── */
function DisputeCard({ payment, wallet, isArbitrator, onAction, onCopy }) {
  const isCustomer = wallet && payment.customer.toLowerCase() === wallet.toLowerCase();
  const isMerchant = wallet && payment.merchant.toLowerCase() === wallet.toLowerCase();
  return (
    <div className="dispute-card">
      <div className="card-top">
        <span className="dispute-id">PAYMENT #{payment.id}</span>
        <span className="status-badge" style={{ background: payment.statusMeta.bg, color: payment.statusMeta.color, border: `1px solid ${payment.statusMeta.border}` }}>
          {payment.statusMeta.label}
        </span>
      </div>
      <div className="dispute-amount">₹{Number(payment.amount).toLocaleString()}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div className="dispute-row"><span className="dispute-label">Customer</span><span className="dispute-value" onClick={() => onCopy(payment.customer, "Customer")}>{payment.customer.slice(0,8)}...{payment.customer.slice(-6)}</span></div>
        <div className="dispute-row"><span className="dispute-label">Merchant</span><span className="dispute-value" onClick={() => onCopy(payment.merchant, "Merchant")}>{payment.merchant.slice(0,8)}...{payment.merchant.slice(-6)}</span></div>
        <div className="dispute-row"><span className="dispute-label">Created</span><span className="dispute-value" style={{ fontFamily: "inherit" }}>{payment.timestamp > 0 ? new Date(payment.timestamp * 1000).toLocaleString() : "N/A"}</span></div>
      </div>
      {payment.disputeReason && <div className="dispute-box"><div className="dispute-box-title">Reason</div><div style={{ color: "#e2e8f0", fontSize: 13 }}>{payment.disputeReason}</div></div>}
      {payment.evidenceHash && <div className="dispute-box"><div className="dispute-box-title">Evidence IPFS</div><div style={{ color: "#388af6", fontSize: 12, fontFamily: "var(--font-mono)", wordBreak: "break-all", cursor: "pointer" }} onClick={() => onCopy(payment.evidenceHash, "Evidence")}>{payment.evidenceHash}</div></div>}
      {payment.merchantResponse && <div className="dispute-box" style={{ borderColor: "rgba(56,138,246,0.3)" }}><div className="dispute-box-title" style={{ color: "#388af6" }}>Merchant Statement</div><div style={{ color: "#e2e8f0", fontSize: 13 }}>{payment.merchantResponse}</div></div>}
      <div className="dispute-actions">
        {payment.status === 0 && <button className="btn-electric" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => onAction("raiseDispute", payment)} disabled={!isCustomer && wallet !== ""}>Raise Dispute</button>}
        {payment.status === 1 && isCustomer && <button className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => onAction("submitEvidence", payment)}>Update Evidence</button>}
        {payment.status === 1 && isMerchant && <button className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px", borderColor: "#388af6" }} onClick={() => onAction("merchantRespond", payment)}>Submit Response</button>}
        {payment.status === 1 && isArbitrator && <button className="btn-electric" style={{ fontSize: 12, padding: "5px 12px", background: "linear-gradient(135deg,#7c3aed,#9333ea)", boxShadow: "0 0 14px rgba(147,51,234,0.4)" }} onClick={() => onAction("resolveDispute", payment)}>Arbitrate</button>}
        {payment.status === 1 && !isCustomer && !isMerchant && !isArbitrator && <span style={{ fontSize: 11, color: "#64748b" }}>Connect relevant wallet to act</span>}
      </div>
    </div>
  );
}


/* ── Transactions Table ── */
function TransactionsTable({ payments, wallet, isArbitrator, onAction, onCopy }) {
  return (
    <div className="table-container">
      <table className="data-table">
        <thead><tr><th>ID</th><th>Customer</th><th>Merchant</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>
          {payments.map((p) => {
            const isC = wallet && p.customer.toLowerCase() === wallet.toLowerCase();
            const isM = wallet && p.merchant.toLowerCase() === wallet.toLowerCase();
            return (
              <tr key={p.id}>
                <td style={{ fontWeight: 700, color: "#388af6", fontFamily: "var(--font-mono)" }}>#{p.id}</td>
                <td><span style={{ fontFamily: "var(--font-mono)", cursor: "pointer" }} onClick={() => onCopy(p.customer, "Customer")}>{p.customer.slice(0,6)}...{p.customer.slice(-4)}</span></td>
                <td><span style={{ fontFamily: "var(--font-mono)", cursor: "pointer" }} onClick={() => onCopy(p.merchant, "Merchant")}>{p.merchant.slice(0,6)}...{p.merchant.slice(-4)}</span></td>
                <td style={{ fontWeight: 700, color: "#fff" }}>₹{Number(p.amount).toLocaleString()}</td>
                <td><span className="status-badge" style={{ background: p.statusMeta.bg, color: p.statusMeta.color, border: `1px solid ${p.statusMeta.border}` }}>{p.statusMeta.label}</span></td>
                <td>{p.timestamp > 0 ? new Date(p.timestamp * 1000).toLocaleDateString() : "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {p.status === 0 && <button className="preset-chip" onClick={() => onAction("raiseDispute", p)} disabled={!isC && wallet !== ""}>Dispute</button>}
                    {p.status === 1 && isArbitrator && <button className="preset-chip" style={{ color: "#c084fc", borderColor: "#c084fc" }} onClick={() => onAction("resolveDispute", p)}>Resolve</button>}
                    {p.status === 1 && isM && <button className="preset-chip" onClick={() => onAction("merchantRespond", p)}>Respond</button>}
                    {p.status > 1 && <span style={{ fontSize: 11, color: "#64748b" }}>Closed</span>}
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
