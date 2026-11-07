// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { IUSDT } from "./IUSDT.sol";

/// Recurring USDT payments. A merchant publishes a plan; a customer subscribes for a number of
/// periods and gives this contract a USDT allowance, usually with an EIP-2612 permit. Anyone may
/// then collect each period's payment once it is due. USDT goes customer -> merchant inside one
/// transaction; this contract never holds it. Every action has a direct form and a signed form
/// that anyone can submit, so neither side needs gas. There is no owner.
contract Subscriptions is ReentrancyGuard, EIP712 {
    using SafeERC20 for IUSDT;

    // ---------- Types ----------

    struct Plan {
        address merchant;
        uint256 amount; // USDT per period, 6 decimals
        uint32 period; // seconds between charges
        uint256 relayFee; // USDT the merchant pays whoever submits a charge
        bytes32 ref; // keccak of the plan's details; optional
        bool active; // a closed plan takes no new subscribers and no more charges
    }

    struct Subscription {
        uint256 planId;
        address subscriber;
        uint64 nextChargeAt; // unix seconds
        uint32 periodsLeft; // charges the subscriber still allows
        bool active;
    }

    /// What a merchant signs to have someone else submit `createPlanFor`.
    struct PlanRequest {
        address merchant;
        uint256 amount;
        uint32 period;
        bytes32 ref;
        uint256 relayFee;
        bytes32 salt; // makes each request unique
        uint256 deadline; // unix seconds; the signature is void afterwards
    }

    /// What a customer signs to have someone else submit `subscribeFor`. It names the plan, so an
    /// allowance given for one plan can't be spent on another.
    struct SubscribeRequest {
        uint256 planId;
        address subscriber;
        uint32 periods; // the most charges this subscription may make
        bytes32 salt;
        uint256 deadline;
    }

    /// An EIP-2612 permit that gives this contract its allowance.
    struct Permit {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // ---------- Storage ----------

    /// Short enough to show a renewal in a demo.
    uint32 public constant MIN_PERIOD = 1 minutes;

    bytes32 private constant PLAN_TYPEHASH = keccak256(
        "CreatePlan(address merchant,uint256 amount,uint32 period,bytes32 ref,uint256 relayFee,bytes32 salt,uint256 deadline)"
    );
    bytes32 private constant CLOSE_TYPEHASH = keccak256("ClosePlan(uint256 planId,uint256 deadline)");
    bytes32 private constant SUBSCRIBE_TYPEHASH = keccak256(
        "Subscribe(uint256 planId,address subscriber,uint32 periods,bytes32 salt,uint256 deadline)"
    );
    bytes32 private constant CANCEL_TYPEHASH = keccak256("CancelSubscription(uint256 id,uint256 deadline)");

    IUSDT public immutable usdt;
    uint256 public nextPlanId = 1;
    uint256 public nextSubscriptionId = 1;
    mapping(uint256 => Plan) public plans;
    mapping(uint256 => Subscription) public subscriptions;
    /// A subscriber's active subscription to a plan, or 0. One per plan per subscriber.
    mapping(uint256 planId => mapping(address subscriber => uint256 id)) public subscriptionOf;
    /// Signed plan and subscribe requests that were already used, by EIP-712 digest.
    mapping(bytes32 => bool) public usedRequests;

    // ---------- Events and errors ----------

    event PlanCreated(
        uint256 indexed planId,
        address indexed merchant,
        uint256 amount,
        uint32 period,
        bytes32 ref,
        uint256 relayFee
    );
    event PlanClosed(uint256 indexed planId, address indexed merchant);
    event Subscribed(uint256 indexed id, uint256 indexed planId, address indexed subscriber, uint32 periods);
    /// `relayFee` is what the submitter was paid: 0 when the subscriber paid their own gas.
    event Charged(
        uint256 indexed id,
        uint256 indexed planId,
        address indexed subscriber,
        uint256 amount,
        uint256 relayFee,
        uint64 nextChargeAt
    );
    event SubscriptionCancelled(uint256 indexed id, address indexed by);
    /// The subscription made every charge it was allowed.
    event SubscriptionEnded(uint256 indexed id);

    error ZeroAmount();
    error PeriodTooShort();
    error FeeTooLarge();
    error ZeroPeriods();
    error PlanNotOpen();
    error AlreadySubscribed();
    error NotActive();
    error NotDue();
    error NotAllowed();
    error SignatureExpired();
    error SignatureUsed();
    error InvalidSignature();

    constructor(IUSDT usdt_) EIP712("Settle Subscriptions", "1") {
        usdt = usdt_;
    }

    // ---------- Plans ----------

    function createPlan(uint256 amount, uint32 period, bytes32 ref, uint256 relayFee)
        external
        returns (uint256 planId)
    {
        return _createPlan(msg.sender, amount, period, ref, relayFee);
    }

    /// Gasless create: anyone may submit a request the merchant signed. Each request works once.
    function createPlanFor(PlanRequest calldata request, bytes calldata signature)
        external
        returns (uint256 planId)
    {
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    PLAN_TYPEHASH,
                    request.merchant,
                    request.amount,
                    request.period,
                    request.ref,
                    request.relayFee,
                    request.salt,
                    request.deadline
                )
            )
        );
        _useRequest(digest, request.deadline, signature, request.merchant);
        return _createPlan(request.merchant, request.amount, request.period, request.ref, request.relayFee);
    }

    function closePlan(uint256 planId) external {
        if (msg.sender != plans[planId].merchant) revert NotAllowed();
        _closePlan(planId);
    }

    /// Gasless close: anyone may submit a close the merchant signed.
    function closePlanWithSignature(uint256 planId, uint256 deadline, bytes calldata signature) external {
        if (block.timestamp > deadline) revert SignatureExpired();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CLOSE_TYPEHASH, planId, deadline)));
        // recover never returns the zero address, so a plan that was never created fails here.
        if (ECDSA.recover(digest, signature) != plans[planId].merchant) revert InvalidSignature();

        _closePlan(planId);
    }

    // ---------- Subscribe ----------

    /// Direct path: the subscriber holds WBT and has approved this contract. The first period is
    /// charged now, with no relay fee.
    function subscribe(uint256 planId, uint32 periods) external nonReentrant returns (uint256 id) {
        id = _subscribe(planId, msg.sender, periods);
        _charge(id, false);
    }

    /// Gasless path: anyone may submit. The subscriber's signature names the plan and the number
    /// of periods; the permit only supplies the allowance. Without the first, a permit seen in
    /// transit could be attached to someone else's plan.
    function subscribeFor(SubscribeRequest calldata request, bytes calldata signature, Permit calldata permit)
        external
        nonReentrant
        returns (uint256 id)
    {
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    SUBSCRIBE_TYPEHASH,
                    request.planId,
                    request.subscriber,
                    request.periods,
                    request.salt,
                    request.deadline
                )
            )
        );
        _useRequest(digest, request.deadline, signature, request.subscriber);

        // A permit can be submitted to the token by anyone, which would make this call fail. The
        // allowance is what matters, and the charge below reverts without it.
        try usdt.permit(
            request.subscriber, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s
        ) { }
            catch { }

        id = _subscribe(request.planId, request.subscriber, request.periods);
        _charge(id, true);
    }

    // ---------- Charge ----------

    /// Collects one period once it is due. Anyone may call, and is paid the plan's relay fee.
    function charge(uint256 id) external nonReentrant {
        _charge(id, true);
    }

    // ---------- Cancel ----------

    /// The subscriber can leave at any time, and the merchant can end a subscription.
    function cancel(uint256 id) external {
        Subscription storage sub = subscriptions[id];
        if (msg.sender != sub.subscriber && msg.sender != plans[sub.planId].merchant) revert NotAllowed();
        _cancel(id, msg.sender);
    }

    /// Gasless cancel: anyone may submit a cancellation signed by the subscriber or the merchant.
    function cancelWithSignature(uint256 id, uint256 deadline, bytes calldata signature) external {
        if (block.timestamp > deadline) revert SignatureExpired();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CANCEL_TYPEHASH, id, deadline)));
        address signer = ECDSA.recover(digest, signature);
        Subscription storage sub = subscriptions[id];
        // recover never returns the zero address, so an id that was never created fails here.
        if (signer != sub.subscriber && signer != plans[sub.planId].merchant) revert InvalidSignature();

        _cancel(id, signer);
    }

    // ---------- Internal ----------

    /// Checks a signed request and marks it used, so it can't be submitted twice.
    function _useRequest(bytes32 digest, uint256 deadline, bytes calldata signature, address signer) private {
        if (block.timestamp > deadline) revert SignatureExpired();
        if (usedRequests[digest]) revert SignatureUsed();
        if (ECDSA.recover(digest, signature) != signer) revert InvalidSignature();
        usedRequests[digest] = true;
    }

    function _createPlan(address merchant, uint256 amount, uint32 period, bytes32 ref, uint256 relayFee)
        private
        returns (uint256 planId)
    {
        if (amount == 0) revert ZeroAmount();
        if (period < MIN_PERIOD) revert PeriodTooShort();
        // The fee comes out of each charge, so it must leave the merchant something.
        if (relayFee >= amount) revert FeeTooLarge();

        planId = nextPlanId++;
        plans[planId] = Plan({
            merchant: merchant, amount: amount, period: period, relayFee: relayFee, ref: ref, active: true
        });
        emit PlanCreated(planId, merchant, amount, period, ref, relayFee);
    }

    function _closePlan(uint256 planId) private {
        Plan storage plan = plans[planId];
        if (!plan.active) revert PlanNotOpen();

        plan.active = false;
        emit PlanClosed(planId, plan.merchant);
    }

    function _subscribe(uint256 planId, address subscriber, uint32 periods) private returns (uint256 id) {
        // A plan that was never created is not active either.
        if (!plans[planId].active) revert PlanNotOpen();
        if (periods == 0) revert ZeroPeriods();
        if (subscriptionOf[planId][subscriber] != 0) revert AlreadySubscribed();

        id = nextSubscriptionId++;
        // forge-lint: disable-next-line(unsafe-typecast)
        subscriptions[id] = Subscription({
            planId: planId,
            subscriber: subscriber,
            nextChargeAt: uint64(block.timestamp),
            periodsLeft: periods,
            active: true
        });
        subscriptionOf[planId][subscriber] = id;
        emit Subscribed(id, planId, subscriber, periods);
    }

    function _charge(uint256 id, bool relayed) private {
        Subscription storage sub = subscriptions[id];
        if (!sub.active) revert NotActive();
        Plan storage plan = plans[sub.planId];
        if (!plan.active) revert PlanNotOpen();
        if (block.timestamp < sub.nextChargeAt) revert NotDue();

        // A charge less than a period late keeps the schedule. A later one restarts it from now,
        // so missed periods are never collected in a burst.
        uint64 next = sub.nextChargeAt + plan.period;
        // forge-lint: disable-next-line(unsafe-typecast)
        if (next <= block.timestamp) next = uint64(block.timestamp) + plan.period;
        sub.nextChargeAt = next;
        sub.periodsLeft -= 1;

        uint256 fee = relayed ? plan.relayFee : 0;
        emit Charged(id, sub.planId, sub.subscriber, plan.amount, fee, next);
        if (sub.periodsLeft == 0) {
            sub.active = false;
            delete subscriptionOf[sub.planId][sub.subscriber];
            emit SubscriptionEnded(id);
        }

        usdt.safeTransferFrom(sub.subscriber, plan.merchant, plan.amount - fee);
        if (fee > 0) usdt.safeTransferFrom(sub.subscriber, msg.sender, fee);
    }

    function _cancel(uint256 id, address by) private {
        Subscription storage sub = subscriptions[id];
        if (!sub.active) revert NotActive();

        sub.active = false;
        delete subscriptionOf[sub.planId][sub.subscriber];
        emit SubscriptionCancelled(id, by);
    }
}
