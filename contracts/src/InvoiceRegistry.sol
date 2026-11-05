// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IUSDT } from "./IUSDT.sol";

/// Invoices in USDT. A customer pays directly, or gaslessly by signing an EIP-3009 authorization
/// that a relayer submits. Funds go customer -> merchant inside one transaction; this contract
/// never holds USDT at rest, so there is no escrow and nothing to withdraw.
contract InvoiceRegistry is ReentrancyGuard {
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
        bytes32 ref; // keccak of an external order id or memo; optional
    }

    // ---------- Storage ----------

    IUSDT public immutable usdt;
    uint256 public nextId = 1;
    mapping(uint256 => Invoice) public invoices;

    // ---------- Events and errors ----------

    event InvoiceCreated(
        uint256 indexed id, address indexed merchant, uint256 amount, uint64 dueAt, bytes32 ref
    );
    event InvoicePaid(
        uint256 indexed id, address indexed merchant, address indexed payer, uint256 amount, bool gasless
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
    error InvoiceNotFound();
    error InvoiceNotOpen();
    error NotMerchant();
    error NotRefundable();
    error RefundTooLarge();

    constructor(IUSDT usdt_) {
        usdt = usdt_;
    }

    // ---------- Create ----------

    function create(uint256 amount, uint64 dueAt, bytes32 ref) external returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        id = nextId++;
        Invoice storage inv = invoices[id];
        inv.merchant = msg.sender;
        inv.amount = amount;
        inv.dueAt = dueAt;
        inv.ref = ref;
        emit InvoiceCreated(id, msg.sender, amount, dueAt, ref);
    }

    // ---------- Payments ----------

    /// Direct path: the customer holds WBT and has approved this contract.
    function pay(uint256 id) external nonReentrant {
        Invoice storage inv = _markPaid(id, msg.sender, false);
        usdt.safeTransferFrom(msg.sender, inv.merchant, inv.amount);
    }

    /// Gasless path: anyone may submit, because the signature is the authorization.
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
        usdt.safeTransfer(inv.merchant, inv.amount);
    }

    /// One authorization per (invoice, payer). The SDK computes the same value off-chain.
    function authorizationNonce(uint256 id, address payer) public pure returns (bytes32) {
        return keccak256(abi.encode("SETTLE_INVOICE", id, payer));
    }

    // ---------- Refunds ----------

    /// Pulls from the merchant, who must have approved this contract, since it holds no funds.
    function refund(uint256 id, uint256 amount) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (msg.sender != inv.merchant) revert NotMerchant();
        if (inv.status != Status.Paid && inv.status != Status.Refunded) revert NotRefundable();
        if (amount == 0) revert ZeroAmount();
        if (inv.refunded + amount > inv.amount) revert RefundTooLarge();

        inv.refunded += amount;
        inv.status = Status.Refunded;
        emit InvoiceRefunded(id, msg.sender, inv.payer, amount, inv.refunded);
        usdt.safeTransferFrom(msg.sender, inv.payer, amount);
    }

    // ---------- Cancel ----------

    function cancel(uint256 id) external {
        Invoice storage inv = invoices[id];
        if (msg.sender != inv.merchant) revert NotMerchant();
        if (inv.status != Status.Open) revert InvoiceNotOpen();

        inv.status = Status.Cancelled;
        emit InvoiceCancelled(id, msg.sender);
    }

    // ---------- Internal ----------

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
        emit InvoicePaid(id, inv.merchant, payer, inv.amount, gasless);
    }
}
