// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { IUSDT } from "./IUSDT.sol";

/// Invoices in USDT. Every action has two forms: a direct call, and a signed form that anyone can
/// submit, so neither the merchant nor the customer needs gas. Funds go customer -> merchant inside
/// one transaction; this contract never holds USDT at rest, so there is no escrow and nothing to
/// withdraw. There is no owner.
contract InvoiceRegistry is ReentrancyGuard, EIP712 {
    using SafeERC20 for IUSDT;

    // ---------- Types ----------

    /// Refunded means any refund was issued, partial or full.
    enum Status {
        Open,
        Paid,
        Refunded,
        Cancelled
    }

    struct Invoice {
        address merchant;
        address payer; // set on payment
        uint256 amount; // USDT, 6 decimals
        uint256 refunded; // cumulative
        uint64 dueAt; // unix seconds; informational, not enforced
        uint64 paidAt;
        Status status;
        bytes32 ref; // keccak of the invoice details; optional
        uint256 relayFee; // USDT the merchant pays whoever submits a gasless payment
    }

    /// What a merchant signs to have someone else submit `createFor`.
    struct CreateRequest {
        address merchant;
        uint256 amount;
        uint64 dueAt;
        bytes32 ref;
        uint256 relayFee;
        bytes32 salt; // makes each request unique
        uint256 deadline; // unix seconds; the signature is void afterwards
    }

    // ---------- Storage ----------

    bytes32 private constant CREATE_TYPEHASH = keccak256(
        "CreateInvoice(address merchant,uint256 amount,uint64 dueAt,bytes32 ref,uint256 relayFee,bytes32 salt,uint256 deadline)"
    );
    bytes32 private constant CANCEL_TYPEHASH = keccak256("CancelInvoice(uint256 id,uint256 deadline)");

    IUSDT public immutable usdt;
    uint256 public nextId = 1;
    mapping(uint256 => Invoice) public invoices;
    /// Signed create requests that were already used, by EIP-712 digest.
    mapping(bytes32 => bool) public usedCreateRequests;

    // ---------- Events and errors ----------

    event InvoiceCreated(
        uint256 indexed id,
        address indexed merchant,
        uint256 amount,
        uint64 dueAt,
        bytes32 ref,
        uint256 relayFee
    );
    /// `relayFee` is what the relayer was paid: 0 on the direct path.
    event InvoicePaid(
        uint256 indexed id,
        address indexed merchant,
        address indexed payer,
        uint256 amount,
        uint256 relayFee,
        bool gasless
    );
    event InvoiceRefunded(
        uint256 indexed id,
        address indexed merchant,
        address indexed payer,
        uint256 amount,
        uint256 totalRefunded
    );
    event InvoiceCancelled(uint256 indexed id, address indexed merchant);

    error ZeroAmount();
    error FeeTooLarge();
    error InvoiceNotFound();
    error InvoiceNotOpen();
    error NotMerchant();
    error NotRefundable();
    error RefundTooLarge();
    error SignatureExpired();
    error SignatureUsed();
    error InvalidSignature();

    constructor(IUSDT usdt_) EIP712("Settle InvoiceRegistry", "2") {
        usdt = usdt_;
    }

    // ---------- Create ----------

    function create(uint256 amount, uint64 dueAt, bytes32 ref, uint256 relayFee)
        external
        returns (uint256 id)
    {
        return _create(msg.sender, amount, dueAt, ref, relayFee);
    }

    /// Gasless create: anyone may submit a request the merchant signed. Each request works once.
    function createFor(CreateRequest calldata request, bytes calldata signature)
        external
        returns (uint256 id)
    {
        if (block.timestamp > request.deadline) revert SignatureExpired();

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    CREATE_TYPEHASH,
                    request.merchant,
                    request.amount,
                    request.dueAt,
                    request.ref,
                    request.relayFee,
                    request.salt,
                    request.deadline
                )
            )
        );
        if (usedCreateRequests[digest]) revert SignatureUsed();
        if (ECDSA.recover(digest, signature) != request.merchant) revert InvalidSignature();

        usedCreateRequests[digest] = true;
        return _create(request.merchant, request.amount, request.dueAt, request.ref, request.relayFee);
    }

    // ---------- Payments ----------

    /// Direct path: the customer holds WBT and has approved this contract. No relay fee applies.
    function pay(uint256 id) external nonReentrant {
        Invoice storage inv = _markPaid(id, msg.sender, false);
        usdt.safeTransferFrom(msg.sender, inv.merchant, inv.amount);
    }

    /// Gasless path: anyone may submit, because the signature is the authorization. The submitter
    /// earns the invoice's relay fee, and the merchant receives the rest.
    ///
    /// receiveWithAuthorization requires msg.sender == to, so only this contract can consume the
    /// signature. transferWithAuthorization would let anyone submit it straight to USDT: the funds
    /// would move but the invoice would never be marked paid.
    function payWithAuthorization(
        uint256 id,
        address payer,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        Invoice storage inv = _markPaid(id, payer, true);
        usdt.receiveWithAuthorization(
            payer, address(this), inv.amount, validAfter, validBefore, authorizationNonce(id, payer), v, r, s
        );

        uint256 fee = inv.relayFee;
        usdt.safeTransfer(inv.merchant, inv.amount - fee);
        if (fee > 0) usdt.safeTransfer(msg.sender, fee);
    }

    /// One authorization per (invoice, payer). The SDK computes the same value off-chain.
    function authorizationNonce(uint256 id, address payer) public pure returns (bytes32) {
        return keccak256(abi.encode("SETTLE_INVOICE", id, payer));
    }

    // ---------- Refunds ----------

    /// Direct path. Pulls from the merchant, who must have approved this contract, since it holds
    /// no funds.
    function refund(uint256 id, uint256 amount) external nonReentrant {
        if (msg.sender != invoices[id].merchant) revert NotMerchant();
        Invoice storage inv = _recordRefund(id, amount);
        usdt.safeTransferFrom(msg.sender, inv.payer, amount);
    }

    /// Gasless path: anyone may submit an authorization the merchant signed. It needs no approval,
    /// and it only validates if the invoice's merchant signed it, for this amount and this refund.
    function refundWithAuthorization(
        uint256 id,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        bytes32 nonce = refundNonce(id, invoices[id].refunded);
        Invoice storage inv = _recordRefund(id, amount);
        usdt.receiveWithAuthorization(
            inv.merchant, address(this), amount, validAfter, validBefore, nonce, v, r, s
        );
        usdt.safeTransfer(inv.payer, amount);
    }

    /// One authorization per refund: `refundedBefore` is the invoice's total refunded so far, so a
    /// signature can't be reused once any refund lands.
    function refundNonce(uint256 id, uint256 refundedBefore) public pure returns (bytes32) {
        return keccak256(abi.encode("SETTLE_REFUND", id, refundedBefore));
    }

    // ---------- Cancel ----------

    function cancel(uint256 id) external {
        if (msg.sender != invoices[id].merchant) revert NotMerchant();
        _cancel(id);
    }

    /// Gasless cancel: anyone may submit a cancellation the merchant signed.
    function cancelWithSignature(uint256 id, uint256 deadline, bytes calldata signature) external {
        if (block.timestamp > deadline) revert SignatureExpired();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CANCEL_TYPEHASH, id, deadline)));
        // recover never returns the zero address, so an id that was never created fails here.
        if (ECDSA.recover(digest, signature) != invoices[id].merchant) revert InvalidSignature();

        _cancel(id);
    }

    // ---------- Internal ----------

    function _create(address merchant, uint256 amount, uint64 dueAt, bytes32 ref, uint256 relayFee)
        private
        returns (uint256 id)
    {
        if (amount == 0) revert ZeroAmount();
        if (relayFee >= amount) revert FeeTooLarge();

        id = nextId++;
        Invoice storage inv = invoices[id];
        inv.merchant = merchant;
        inv.amount = amount;
        inv.dueAt = dueAt;
        inv.ref = ref;
        inv.relayFee = relayFee;
        emit InvoiceCreated(id, merchant, amount, dueAt, ref, relayFee);
    }

    /// Open is the zero value of Status, so an id that was never created also reads as Open.
    /// The merchant check is what stops a stranger "paying" a nonexistent invoice.
    function _markPaid(uint256 id, address payer, bool gasless) private returns (Invoice storage inv) {
        inv = invoices[id];
        if (inv.merchant == address(0)) revert InvoiceNotFound();
        if (inv.status != Status.Open) revert InvoiceNotOpen();

        inv.status = Status.Paid;
        inv.payer = payer;
        // forge-lint: disable-next-line(unsafe-typecast)
        inv.paidAt = uint64(block.timestamp);
        emit InvoicePaid(id, inv.merchant, payer, inv.amount, gasless ? inv.relayFee : 0, gasless);
    }

    function _recordRefund(uint256 id, uint256 amount) private returns (Invoice storage inv) {
        inv = invoices[id];
        if (inv.status != Status.Paid && inv.status != Status.Refunded) revert NotRefundable();
        if (amount == 0) revert ZeroAmount();
        if (inv.refunded + amount > inv.amount) revert RefundTooLarge();

        inv.refunded += amount;
        inv.status = Status.Refunded;
        emit InvoiceRefunded(id, inv.merchant, inv.payer, amount, inv.refunded);
    }

    function _cancel(uint256 id) private {
        Invoice storage inv = invoices[id];
        if (inv.status != Status.Open) revert InvoiceNotOpen();

        inv.status = Status.Cancelled;
        emit InvoiceCancelled(id, inv.merchant);
    }
}
