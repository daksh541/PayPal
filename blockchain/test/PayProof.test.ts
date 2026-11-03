import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

describe("PayProof Contract Test Suite", async function () {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [arbitratorWallet, customerWallet, merchantWallet, strangerWallet] =
    await viem.getWalletClients();

  async function deployFixture() {
    const payProof = await viem.deployContract("PayProof", [], {
      client: { wallet: arbitratorWallet },
    });
    return { payProof };
  }

  describe("Deployment & Initialization", function () {
    it("Should set the deployer as arbitrator", async function () {
      const { payProof } = await deployFixture();
      const arbitrator = await payProof.read.arbitrator();
      assert.equal(
        arbitrator.toLowerCase(),
        arbitratorWallet.account.address.toLowerCase()
      );
    });

    it("Should start nextPaymentId at 1 and payment count at 0", async function () {
      const { payProof } = await deployFixture();
      const count = await payProof.read.getPaymentCount();
      assert.equal(count, 0n);
      const nextId = await payProof.read.nextPaymentId();
      assert.equal(nextId, 1n);
    });
  });

  describe("Payment Creation", function () {
    it("Should allow customer to create a simulated payment", async function () {
      const { payProof } = await deployFixture();
      const amount = 5000n;

      const customerPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: customerWallet } }
      );

      const txHash = await customerPayProof.write.createPayment([
        merchantWallet.account.address,
        amount,
      ]);
      assert.ok(txHash);

      const count = await payProof.read.getPaymentCount();
      assert.equal(count, 1n);

      const payment = await payProof.read.getPayment([1n]);
      assert.equal(payment.id, 1n);
      assert.equal(
        payment.customer.toLowerCase(),
        customerWallet.account.address.toLowerCase()
      );
      assert.equal(
        payment.merchant.toLowerCase(),
        merchantWallet.account.address.toLowerCase()
      );
      assert.equal(payment.amount, amount);
      assert.equal(payment.status, 0); // PaymentRecorded
      assert.ok(payment.timestamp > 0n);
    });

    it("Should revert if merchant is address(0)", async function () {
      const { payProof } = await deployFixture();
      const zeroAddr = "0x0000000000000000000000000000000000000000";

      await assert.rejects(
        async () => {
          await payProof.write.createPayment([zeroAddr, 100n]);
        },
        (err: any) => err.message.includes("Invalid merchant address")
      );
    });

    it("Should revert if customer attempts to pay self (customer == merchant)", async function () {
      const { payProof } = await deployFixture();
      await assert.rejects(
        async () => {
          await payProof.write.createPayment([
            arbitratorWallet.account.address,
            100n,
          ]);
        },
        (err: any) => err.message.includes("Customer cannot be merchant")
      );
    });

    it("Should revert if amount is 0", async function () {
      const { payProof } = await deployFixture();
      await assert.rejects(
        async () => {
          await payProof.write.createPayment([
            merchantWallet.account.address,
            0n,
          ]);
        },
        (err: any) =>
          err.message.includes("Amount must be greater than zero")
      );
    });

    it("Should increment payment IDs sequentially", async function () {
      const { payProof } = await deployFixture();
      const customerPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: customerWallet } }
      );

      await customerPayProof.write.createPayment([
        merchantWallet.account.address,
        100n,
      ]);
      await customerPayProof.write.createPayment([
        merchantWallet.account.address,
        200n,
      ]);

      const all = await payProof.read.getAllPayments();
      assert.equal(all.length, 2);
      assert.equal(all[0].id, 1n);
      assert.equal(all[0].amount, 100n);
      assert.equal(all[1].id, 2n);
      assert.equal(all[1].amount, 200n);
    });
  });

  describe("Dispute Management", function () {
    async function createdPaymentFixture() {
      const { payProof } = await deployFixture();
      const customerPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: customerWallet } }
      );
      await customerPayProof.write.createPayment([
        merchantWallet.account.address,
        1500n,
      ]);
      return { payProof, customerPayProof };
    }

    it("Should allow the customer to raise a dispute with reason and evidence", async function () {
      const { payProof, customerPayProof } = await createdPaymentFixture();

      const reason = "Item not received";
      const evidenceHash = "ipfs://QmProofHash123456789";

      await customerPayProof.write.raiseDispute([1n, reason, evidenceHash]);

      const payment = await payProof.read.getPayment([1n]);
      assert.equal(payment.status, 1); // Disputed
      assert.equal(payment.disputeReason, reason);
      assert.equal(payment.evidenceHash, evidenceHash);
      assert.ok(payment.disputedAt > 0n);
    });

    it("Should revert if unauthorized user attempts to raise dispute", async function () {
      const { payProof } = await createdPaymentFixture();
      const strangerPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: strangerWallet } }
      );

      await assert.rejects(
        async () => {
          await strangerPayProof.write.raiseDispute([
            1n,
            "Fraudulent charge",
            "hash123",
          ]);
        },
        (err: any) => err.message.includes("Only customer can raise dispute")
      );
    });

    it("Should revert if disputing a non-existent payment ID", async function () {
      const { customerPayProof } = await createdPaymentFixture();

      await assert.rejects(
        async () => {
          await customerPayProof.write.raiseDispute([
            999n,
            "Non-existent",
            "hash",
          ]);
        },
        (err: any) => err.message.includes("Payment does not exist")
      );
    });

    it("Should revert if dispute reason is empty", async function () {
      const { customerPayProof } = await createdPaymentFixture();

      await assert.rejects(
        async () => {
          await customerPayProof.write.raiseDispute([1n, "", "hash123"]);
        },
        (err: any) => err.message.includes("Dispute reason is required")
      );
    });

    it("Should prevent duplicate disputes on the same payment", async function () {
      const { customerPayProof } = await createdPaymentFixture();

      await customerPayProof.write.raiseDispute([
        1n,
        "Defective item",
        "hash1",
      ]);

      await assert.rejects(
        async () => {
          await customerPayProof.write.raiseDispute([
            1n,
            "Duplicate dispute",
            "hash2",
          ]);
        },
        (err: any) =>
          err.message.includes("Payment cannot be disputed: invalid state")
      );
    });

    it("Should allow customer to submit additional evidence during active dispute", async function () {
      const { payProof, customerPayProof } = await createdPaymentFixture();
      await customerPayProof.write.raiseDispute([1n, "Defective item", ""]);

      await customerPayProof.write.submitEvidence([
        1n,
        "ipfs://QmNewUpdatedEvidenceHash",
      ]);
      const payment = await payProof.read.getPayment([1n]);
      assert.equal(payment.evidenceHash, "ipfs://QmNewUpdatedEvidenceHash");
    });

    it("Should revert if stranger tries to submit evidence", async function () {
      const { payProof, customerPayProof } = await createdPaymentFixture();
      await customerPayProof.write.raiseDispute([1n, "Defective item", ""]);

      const strangerPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: strangerWallet } }
      );

      await assert.rejects(
        async () => {
          await strangerPayProof.write.submitEvidence([1n, "hackerHash"]);
        },
        (err: any) =>
          err.message.includes("Only customer can submit evidence")
      );
    });
  });

  describe("Merchant Response", function () {
    async function disputedPaymentFixture() {
      const { payProof } = await deployFixture();
      const customerPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: customerWallet } }
      );
      await customerPayProof.write.createPayment([
        merchantWallet.account.address,
        2500n,
      ]);
      await customerPayProof.write.raiseDispute([
        1n,
        "Package empty",
        "hashProof",
      ]);
      return { payProof };
    }

    it("Should allow assigned merchant to submit counter-response", async function () {
      const { payProof } = await disputedPaymentFixture();
      const merchantPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: merchantWallet } }
      );

      const responseText = "Tracking shows delivered and signed by customer.";
      await merchantPayProof.write.merchantRespond([1n, responseText]);

      const payment = await payProof.read.getPayment([1n]);
      assert.equal(payment.merchantResponse, responseText);
    });

    it("Should revert if unauthorized address tries to respond as merchant", async function () {
      const { payProof } = await disputedPaymentFixture();
      const strangerPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: strangerWallet } }
      );

      await assert.rejects(
        async () => {
          await strangerPayProof.write.merchantRespond([
            1n,
            "I am impersonating merchant",
          ]);
        },
        (err: any) => err.message.includes("Only merchant can respond")
      );
    });

    it("Should revert if merchant responds when payment is not disputed", async function () {
      const { payProof } = await deployFixture();
      const customerPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: customerWallet } }
      );
      await customerPayProof.write.createPayment([
        merchantWallet.account.address,
        1000n,
      ]);

      const merchantPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: merchantWallet } }
      );

      await assert.rejects(
        async () => {
          await merchantPayProof.write.merchantRespond([
            1n,
            "Premature response",
          ]);
        },
        (err: any) => err.message.includes("No active dispute to respond to")
      );
    });
  });

  describe("Arbitrator Refund Resolution", function () {
    async function readyToResolveFixture() {
      const { payProof } = await deployFixture();
      const customerPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: customerWallet } }
      );
      const merchantPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: merchantWallet } }
      );

      await customerPayProof.write.createPayment([
        merchantWallet.account.address,
        3000n,
      ]);
      await customerPayProof.write.raiseDispute([
        1n,
        "Faulty hardware",
        "hashHW",
      ]);
      await merchantPayProof.write.merchantRespond([
        1n,
        "Hardware passed QC test",
      ]);

      return { payProof };
    }

    it("Should allow arbitrator to approve refund", async function () {
      const { payProof } = await readyToResolveFixture();

      await payProof.write.approveRefund([1n]);

      const payment = await payProof.read.getPayment([1n]);
      assert.equal(payment.status, 2); // Refunded
      assert.ok(payment.resolvedAt > 0n);
    });

    it("Should allow arbitrator to reject refund", async function () {
      const { payProof } = await readyToResolveFixture();

      await payProof.write.rejectRefund([1n]);

      const payment = await payProof.read.getPayment([1n]);
      assert.equal(payment.status, 3); // RefundRejected
      assert.ok(payment.resolvedAt > 0n);
    });

    it("Should revert if non-arbitrator tries to resolve dispute", async function () {
      const { payProof } = await readyToResolveFixture();
      const customerPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: customerWallet } }
      );

      await assert.rejects(
        async () => {
          await customerPayProof.write.resolveDispute([1n, true]);
        },
        (err: any) =>
          err.message.includes("Only arbitrator can perform this action")
      );
    });

    it("Should revert if arbitrator resolves an already resolved dispute (invalid state transition)", async function () {
      const { payProof } = await readyToResolveFixture();

      await payProof.write.approveRefund([1n]);

      await assert.rejects(
        async () => {
          await payProof.write.rejectRefund([1n]);
        },
        (err: any) =>
          err.message.includes("Payment is not in disputed state")
      );
    });

    it("Should revert if arbitrator tries to resolve payment that is not disputed", async function () {
      const { payProof } = await deployFixture();
      const customerPayProof = await viem.getContractAt(
        "PayProof",
        payProof.address,
        { client: { wallet: customerWallet } }
      );
      await customerPayProof.write.createPayment([
        merchantWallet.account.address,
        500n,
      ]);

      await assert.rejects(
        async () => {
          await payProof.write.approveRefund([1n]);
        },
        (err: any) =>
          err.message.includes("Payment is not in disputed state")
      );
    });

    it("Should allow arbitrator to transfer role to another address", async function () {
      const { payProof } = await deployFixture();

      await payProof.write.transferArbitrator([
        strangerWallet.account.address,
      ]);
      const newArb = await payProof.read.arbitrator();
      assert.equal(
        newArb.toLowerCase(),
        strangerWallet.account.address.toLowerCase()
      );
    });
  });
});

