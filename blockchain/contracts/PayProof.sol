// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title PayProof
 * @notice Academic prototype for blockchain-based payment dispute and refund resolution.
 * Provides transparent, tamper-resistant dispute records and audit trails.
 */
contract PayProof {
    address public arbitrator;

    enum Status {
        PaymentRecorded,
        Disputed,
        Refunded,
        RefundRejected
    }

    struct Payment {
        uint256 id;
        address customer;
        address merchant;
        uint256 amount;
        uint256 timestamp;
        Status status;
        string disputeReason;
        string evidenceHash;
        string merchantResponse;
        uint256 disputedAt;
        uint256 resolvedAt;
    }

    uint256 public nextPaymentId = 1;
    mapping(uint256 => Payment) private payments;

    // Events
    event PaymentCreated(
        uint256 indexed paymentId,
        address indexed customer,
        address indexed merchant,
        uint256 amount,
        uint256 timestamp
    );

    event DisputeOpened(
        uint256 indexed paymentId,
        address indexed customer,
        string reason,
        string evidenceHash,
        uint256 timestamp
    );

    event EvidenceSubmitted(
        uint256 indexed paymentId,
        address indexed customer,
        string evidenceHash,
        uint256 timestamp
    );

    event MerchantResponded(
        uint256 indexed paymentId,
        address indexed merchant,
        string response,
        uint256 timestamp
    );

    event DisputeResolved(
        uint256 indexed paymentId,
        address indexed arbitrator,
        bool refundApproved,
        Status status,
        uint256 timestamp
    );

    event ArbitratorTransferred(
        address indexed previousArbitrator,
        address indexed newArbitrator
    );

    modifier onlyArbitrator() {
        require(msg.sender == arbitrator, "Only arbitrator can perform this action");
        _;
    }

    constructor() {
        arbitrator = msg.sender;
    }

    /**
     * @notice Transfer the arbitrator role to a new address.
     * @param newArbitrator Address of the new arbitrator.
     */
    function transferArbitrator(address newArbitrator) external onlyArbitrator {
        require(newArbitrator != address(0), "Invalid arbitrator address");
        address prev = arbitrator;
        arbitrator = newArbitrator;
        emit ArbitratorTransferred(prev, newArbitrator);
    }

    /**
     * @notice Records a simulated payment transaction.
     * @param merchant The recipient merchant wallet address.
     * @param amount The simulated payment amount (must be > 0).
     */
    function createPayment(
        address merchant,
        uint256 amount
    ) external returns (uint256) {
        require(merchant != address(0), "Invalid merchant address");
        require(merchant != msg.sender, "Customer cannot be merchant");
        require(amount > 0, "Amount must be greater than zero");

        uint256 paymentId = nextPaymentId++;

        payments[paymentId] = Payment({
            id: paymentId,
            customer: msg.sender,
            merchant: merchant,
            amount: amount,
            timestamp: block.timestamp,
            status: Status.PaymentRecorded,
            disputeReason: "",
            evidenceHash: "",
            merchantResponse: "",
            disputedAt: 0,
            resolvedAt: 0
        });

        emit PaymentCreated(paymentId, msg.sender, merchant, amount, block.timestamp);
        return paymentId;
    }

    /**
     * @notice Raises a dispute for a recorded payment with reason and optional evidence.
     * @param paymentId The ID of the payment to dispute.
     * @param reason The customer's reason for disputing.
     * @param evidenceHash Cryptographic hash / IPFS CID of supporting proof.
     */
    function raiseDispute(
        uint256 paymentId,
        string memory reason,
        string memory evidenceHash
    ) public {
        Payment storage payment = payments[paymentId];

        require(payment.id != 0, "Payment does not exist");
        require(msg.sender == payment.customer, "Only customer can raise dispute");
        require(
            payment.status == Status.PaymentRecorded,
            "Payment cannot be disputed: invalid state"
        );
        require(bytes(reason).length > 0, "Dispute reason is required");

        payment.status = Status.Disputed;
        payment.disputeReason = reason;
        payment.evidenceHash = evidenceHash;
        payment.disputedAt = block.timestamp;

        emit DisputeOpened(paymentId, msg.sender, reason, evidenceHash, block.timestamp);
    }

    /**
     * @notice Backwards-compatible alias for raising a dispute.
     */
    function openDispute(
        uint256 paymentId,
        string calldata evidenceHash
    ) external {
        raiseDispute(paymentId, "Dispute opened by customer", evidenceHash);
    }

    /**
     * @notice Submits or updates evidence for an active dispute.
     * @param paymentId The ID of the disputed payment.
     * @param evidenceHash The evidence identifier / IPFS hash.
     */
    function submitEvidence(
        uint256 paymentId,
        string calldata evidenceHash
    ) external {
        Payment storage payment = payments[paymentId];

        require(payment.id != 0, "Payment does not exist");
        require(msg.sender == payment.customer, "Only customer can submit evidence");
        require(
            payment.status == Status.Disputed,
            "Dispute must be active to submit evidence"
        );
        require(bytes(evidenceHash).length > 0, "Evidence hash cannot be empty");

        payment.evidenceHash = evidenceHash;
        emit EvidenceSubmitted(paymentId, msg.sender, evidenceHash, block.timestamp);
    }

    /**
     * @notice Allows the designated merchant to submit a counter-response.
     * @param paymentId The ID of the payment.
     * @param response The merchant's statement or counter-evidence.
     */
    function merchantRespond(
        uint256 paymentId,
        string calldata response
    ) external {
        Payment storage payment = payments[paymentId];

        require(payment.id != 0, "Payment does not exist");
        require(msg.sender == payment.merchant, "Only merchant can respond");
        require(
            payment.status == Status.Disputed,
            "No active dispute to respond to"
        );
        require(bytes(response).length > 0, "Response cannot be empty");

        payment.merchantResponse = response;
        emit MerchantResponded(paymentId, msg.sender, response, block.timestamp);
    }

    /**
     * @notice Resolves an active dispute by either approving or rejecting the refund.
     * @param paymentId The ID of the disputed payment.
     * @param refundApproved True to approve refund, false to reject.
     */
    function resolveDispute(
        uint256 paymentId,
        bool refundApproved
    ) public onlyArbitrator {
        Payment storage payment = payments[paymentId];

        require(payment.id != 0, "Payment does not exist");
        require(
            payment.status == Status.Disputed,
            "Payment is not in disputed state"
        );

        Status resolvedStatus = refundApproved ? Status.Refunded : Status.RefundRejected;
        payment.status = resolvedStatus;
        payment.resolvedAt = block.timestamp;

        emit DisputeResolved(
            paymentId,
            msg.sender,
            refundApproved,
            resolvedStatus,
            block.timestamp
        );
    }

    /**
     * @notice Convenience function to approve refund.
     */
    function approveRefund(uint256 paymentId) external onlyArbitrator {
        resolveDispute(paymentId, true);
    }

    /**
     * @notice Convenience function to reject refund.
     */
    function rejectRefund(uint256 paymentId) external onlyArbitrator {
        resolveDispute(paymentId, false);
    }

    /**
     * @notice Retrieves details for a specific payment.
     */
    function getPayment(
        uint256 paymentId
    ) external view returns (Payment memory) {
        require(payments[paymentId].id != 0, "Payment does not exist");
        return payments[paymentId];
    }

    /**
     * @notice Returns total number of payments created so far.
     */
    function getPaymentCount() external view returns (uint256) {
        return nextPaymentId - 1;
    }

    /**
     * @notice Retrieves all payment records in a single query.
     */
    function getAllPayments() external view returns (Payment[] memory) {
        uint256 count = nextPaymentId - 1;
        Payment[] memory list = new Payment[](count);
        for (uint256 i = 0; i < count; i++) {
            list[i] = payments[i + 1];
        }
        return list;
    }
}
