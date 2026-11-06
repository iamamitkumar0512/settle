// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Subscriptions } from "../src/Subscriptions.sol";
import { IUSDT } from "../src/IUSDT.sol";

/// Runs against the REAL test USDT in a pinned fork, so the permit, the allowance pulls and the
/// signature checks are all proven against the deployed token.
contract SubscriptionsTest is Test {
    IUSDT constant USDT = IUSDT(0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7);
    uint256 constant PIN = 12304888;
    uint256 constant START_BALANCE = 500e6;
    uint256 constant AMOUNT = 20e6;
    uint256 constant FEE = 50_000; // 0.05 USDT
    uint32 constant PERIOD = 30 days;
    uint32 constant PERIODS = 12;

    bytes32 constant PLAN_TYPEHASH = keccak256(
        "CreatePlan(address merchant,uint256 amount,uint32 period,bytes32 ref,uint256 relayFee,bytes32 salt,uint256 deadline)"
    );
    bytes32 constant CLOSE_TYPEHASH = keccak256("ClosePlan(uint256 planId,uint256 deadline)");
    bytes32 constant SUBSCRIBE_TYPEHASH = keccak256(
        "Subscribe(uint256 planId,address subscriber,uint32 periods,bytes32 salt,uint256 deadline)"
    );
    bytes32 constant CANCEL_TYPEHASH = keccak256("CancelSubscription(uint256 id,uint256 deadline)");
    bytes32 constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    Subscriptions subs;

    uint256 subscriberPk = 0xA11CE;
    address subscriber;
    uint256 merchantPk = 0x4D45524348;
    address merchant;
    uint256 attackerPk = 0xBAD;
    address attacker;
    address relayer = makeAddr("relayer");
    address stranger = makeAddr("stranger");

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
    event Charged(
        uint256 indexed id,
        uint256 indexed planId,
        address indexed subscriber,
        uint256 amount,
        uint256 relayFee,
        uint64 nextChargeAt
    );
    event SubscriptionCancelled(uint256 indexed id, address indexed by);
    event SubscriptionEnded(uint256 indexed id);

    function setUp() public {
        vm.createSelectFork("https://rpc.testnet.whitechain.io", PIN);
        subs = new Subscriptions(USDT);
        subscriber = vm.addr(subscriberPk);
        merchant = vm.addr(merchantPk);
        attacker = vm.addr(attackerPk);
        deal(address(USDT), subscriber, START_BALANCE);
    }

    // ---------- Helpers ----------

    function _plan() internal returns (uint256) {
        vm.prank(merchant);
        return subs.createPlan(AMOUNT, PERIOD, keccak256("retainer"), FEE);
    }

    function _sign(uint256 pk, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("Settle Subscriptions"),
                keccak256("1"),
                block.chainid,
                address(subs)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function _planRequest() internal view returns (Subscriptions.PlanRequest memory) {
        return Subscriptions.PlanRequest({
            merchant: merchant,
            amount: AMOUNT,
            period: PERIOD,
            ref: keccak256("retainer"),
            relayFee: FEE,
            salt: keccak256("salt-1"),
            deadline: block.timestamp + 1 hours
        });
    }

    function _signPlan(uint256 pk, Subscriptions.PlanRequest memory request)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, keccak256(abi.encode(PLAN_TYPEHASH, request)));
    }

    function _request(uint256 planId, uint32 periods)
        internal
        view
        returns (Subscriptions.SubscribeRequest memory)
    {
        return Subscriptions.SubscribeRequest({
            planId: planId,
            subscriber: subscriber,
            periods: periods,
            salt: keccak256("join-1"),
            deadline: block.timestamp + 1 hours
        });
    }

    function _signSubscribe(uint256 pk, Subscriptions.SubscribeRequest memory request)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, keccak256(abi.encode(SUBSCRIBE_TYPEHASH, request)));
    }

    function _permit(uint256 pk, uint256 value) internal view returns (Subscriptions.Permit memory permit) {
        address owner = vm.addr(pk);
        permit.value = value;
        permit.deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TYPEHASH, owner, address(subs), value, USDT.nonces(owner), permit.deadline)
        );
        (permit.v, permit.r, permit.s) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", USDT.DOMAIN_SEPARATOR(), structHash)));
    }

    function _noPermit() internal pure returns (Subscriptions.Permit memory permit) { }

    /// The gasless path: the subscriber signs twice and the relayer submits.
    function _join(uint256 planId, uint32 periods) internal returns (uint256) {
        Subscriptions.SubscribeRequest memory request = _request(planId, periods);
        bytes memory signature = _signSubscribe(subscriberPk, request);
        Subscriptions.Permit memory permit = _permit(subscriberPk, AMOUNT * periods);
        vm.prank(relayer);
        return subs.subscribeFor(request, signature, permit);
    }

    function _sub(uint256 id) internal view returns (Subscriptions.Subscription memory sub) {
        (sub.planId, sub.subscriber, sub.nextChargeAt, sub.periodsLeft, sub.active) = subs.subscriptions(id);
    }

    function _planActive(uint256 planId) internal view returns (bool active) {
        (,,,,, active) = subs.plans(planId);
    }

    // ---------- Plans ----------

    function test_CreatePlan_StoresAndEmits() public {
        vm.expectEmit(true, true, false, true, address(subs));
        emit PlanCreated(1, merchant, AMOUNT, PERIOD, keccak256("retainer"), FEE);
        uint256 planId = _plan();

        (address planMerchant, uint256 amount, uint32 period, uint256 relayFee, bytes32 ref, bool active) =
            subs.plans(planId);
        assertEq(planId, 1);
        assertEq(planMerchant, merchant);
        assertEq(amount, AMOUNT);
        assertEq(period, PERIOD);
        assertEq(relayFee, FEE);
        assertEq(ref, keccak256("retainer"));
        assertTrue(active);
        assertEq(subs.nextPlanId(), 2);
    }

    function test_RevertWhen_PlanAmountIsZero() public {
        vm.expectRevert(Subscriptions.ZeroAmount.selector);
        subs.createPlan(0, PERIOD, bytes32(0), 0);
    }

    function test_RevertWhen_PeriodIsTooShort() public {
        vm.expectRevert(Subscriptions.PeriodTooShort.selector);
        subs.createPlan(AMOUNT, 59, bytes32(0), 0);
    }

    function test_CreatePlan_AcceptsTheShortestPeriod() public {
        assertEq(subs.createPlan(AMOUNT, 1 minutes, bytes32(0), 0), 1);
    }

    function test_RevertWhen_FeeLeavesTheMerchantNothing() public {
        vm.expectRevert(Subscriptions.FeeTooLarge.selector);
        subs.createPlan(AMOUNT, PERIOD, bytes32(0), AMOUNT);
    }

    function test_CreatePlanFor_MerchantNeedsNoGas() public {
        Subscriptions.PlanRequest memory request = _planRequest();
        bytes memory signature = _signPlan(merchantPk, request);
        assertEq(merchant.balance, 0);

        vm.prank(relayer);
        uint256 planId = subs.createPlanFor(request, signature);

        (address planMerchant,,,,,) = subs.plans(planId);
        assertEq(planMerchant, merchant);
    }

    function test_RevertWhen_PlanRequestReplayed() public {
        Subscriptions.PlanRequest memory request = _planRequest();
        bytes memory signature = _signPlan(merchantPk, request);
        subs.createPlanFor(request, signature);

        vm.expectRevert(Subscriptions.SignatureUsed.selector);
        subs.createPlanFor(request, signature);
    }

    function test_RevertWhen_PlanRequestExpired() public {
        Subscriptions.PlanRequest memory request = _planRequest();
        bytes memory signature = _signPlan(merchantPk, request);
        vm.warp(request.deadline + 1);

        vm.expectRevert(Subscriptions.SignatureExpired.selector);
        subs.createPlanFor(request, signature);
    }

    function test_RevertWhen_PlanRequestSignedBySomeoneElse() public {
        Subscriptions.PlanRequest memory request = _planRequest();
        bytes memory signature = _signPlan(attackerPk, request);

        vm.expectRevert(Subscriptions.InvalidSignature.selector);
        subs.createPlanFor(request, signature);
    }

    function test_RevertWhen_PlanRequestChangedAfterSigning() public {
        Subscriptions.PlanRequest memory request = _planRequest();
        bytes memory signature = _signPlan(merchantPk, request);
        request.relayFee = AMOUNT - 1;

        vm.expectRevert(Subscriptions.InvalidSignature.selector);
        subs.createPlanFor(request, signature);
    }

    function test_ClosePlan_ByMerchant() public {
        uint256 planId = _plan();

        vm.expectEmit(true, true, false, true, address(subs));
        emit PlanClosed(planId, merchant);
        vm.prank(merchant);
        subs.closePlan(planId);

        assertFalse(_planActive(planId));
    }

    function test_RevertWhen_StrangerClosesPlan() public {
        uint256 planId = _plan();

        vm.expectRevert(Subscriptions.NotAllowed.selector);
        vm.prank(stranger);
        subs.closePlan(planId);
    }

    function test_RevertWhen_PlanClosedTwice() public {
        uint256 planId = _plan();
        vm.startPrank(merchant);
        subs.closePlan(planId);

        vm.expectRevert(Subscriptions.PlanNotOpen.selector);
        subs.closePlan(planId);
        vm.stopPrank();
    }

    function test_ClosePlanWithSignature_MerchantNeedsNoGas() public {
        uint256 planId = _plan();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(merchantPk, keccak256(abi.encode(CLOSE_TYPEHASH, planId, deadline)));

        vm.prank(relayer);
        subs.closePlanWithSignature(planId, deadline, signature);

        assertFalse(_planActive(planId));
    }

    function test_RevertWhen_CloseSignedBySomeoneElse() public {
        uint256 planId = _plan();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(attackerPk, keccak256(abi.encode(CLOSE_TYPEHASH, planId, deadline)));

        vm.expectRevert(Subscriptions.InvalidSignature.selector);
        subs.closePlanWithSignature(planId, deadline, signature);
    }

    function test_RevertWhen_CloseSignatureExpired() public {
        uint256 planId = _plan();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(merchantPk, keccak256(abi.encode(CLOSE_TYPEHASH, planId, deadline)));
        vm.warp(deadline + 1);

        vm.expectRevert(Subscriptions.SignatureExpired.selector);
        subs.closePlanWithSignature(planId, deadline, signature);
    }

    function test_RevertWhen_ClosingPlanThatWasNeverCreated() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(merchantPk, keccak256(abi.encode(CLOSE_TYPEHASH, 99, deadline)));

        vm.expectRevert(Subscriptions.InvalidSignature.selector);
        subs.closePlanWithSignature(99, deadline, signature);
    }

    // ---------- Subscribe ----------

    function test_SubscribeFor_ChargesTheFirstPeriod() public {
        uint256 planId = _plan();
        assertEq(subscriber.balance, 0);

        uint256 id = _join(planId, PERIODS);

        assertEq(USDT.balanceOf(subscriber), START_BALANCE - AMOUNT);
        assertEq(USDT.balanceOf(merchant), AMOUNT - FEE);
        assertEq(USDT.balanceOf(relayer), FEE);
        assertEq(USDT.balanceOf(address(subs)), 0);
        assertEq(USDT.allowance(subscriber, address(subs)), AMOUNT * (PERIODS - 1));

        Subscriptions.Subscription memory sub = _sub(id);
        assertEq(sub.planId, planId);
        assertEq(sub.subscriber, subscriber);
        assertEq(sub.nextChargeAt, block.timestamp + PERIOD);
        assertEq(sub.periodsLeft, PERIODS - 1);
        assertTrue(sub.active);
        assertEq(subs.subscriptionOf(planId, subscriber), id);
    }

    function test_SubscribeFor_EmitsSubscribedAndCharged() public {
        uint256 planId = _plan();
        Subscriptions.SubscribeRequest memory request = _request(planId, PERIODS);
        bytes memory signature = _signSubscribe(subscriberPk, request);
        Subscriptions.Permit memory permit = _permit(subscriberPk, AMOUNT * PERIODS);

        vm.expectEmit(true, true, true, true, address(subs));
        emit Subscribed(1, planId, subscriber, PERIODS);
        vm.expectEmit(true, true, true, true, address(subs));
        emit Charged(1, planId, subscriber, AMOUNT, FEE, uint64(block.timestamp + PERIOD));
        vm.prank(relayer);
        subs.subscribeFor(request, signature, permit);
    }

    function test_Subscribe_DirectPaysNoFee() public {
        uint256 planId = _plan();
        vm.startPrank(subscriber);
        USDT.approve(address(subs), AMOUNT * PERIODS);
        uint256 id = subs.subscribe(planId, PERIODS);
        vm.stopPrank();

        assertEq(USDT.balanceOf(merchant), AMOUNT);
        assertEq(_sub(id).periodsLeft, PERIODS - 1);
    }

    /// The reason subscribing takes two signatures. A permit is only an allowance, so someone
    /// who sees one must not be able to attach it to a plan of their own.
    function test_RevertWhen_PermitIsAttachedToAnotherPlan() public {
        _plan();
        vm.prank(attacker);
        uint256 attackerPlan = subs.createPlan(AMOUNT * PERIODS, 1 minutes, bytes32(0), 0);

        Subscriptions.Permit memory permit = _permit(subscriberPk, AMOUNT * PERIODS);
        Subscriptions.SubscribeRequest memory forged = _request(attackerPlan, 1);
        bytes memory signature = _signSubscribe(attackerPk, forged);

        vm.expectRevert(Subscriptions.InvalidSignature.selector);
        vm.prank(attacker);
        subs.subscribeFor(forged, signature, permit);
    }

    function test_RevertWhen_SubscribeRequestMovedToAnotherPlan() public {
        uint256 planId = _plan();
        vm.prank(attacker);
        uint256 attackerPlan = subs.createPlan(AMOUNT, PERIOD, bytes32(0), 0);

        Subscriptions.SubscribeRequest memory request = _request(planId, PERIODS);
        bytes memory signature = _signSubscribe(subscriberPk, request);
        Subscriptions.Permit memory permit = _permit(subscriberPk, AMOUNT * PERIODS);
        request.planId = attackerPlan;

        vm.expectRevert(Subscriptions.InvalidSignature.selector);
        vm.prank(attacker);
        subs.subscribeFor(request, signature, permit);
    }

    function test_RevertWhen_SubscribeRequestAsksForMorePeriods() public {
        uint256 planId = _plan();
        Subscriptions.SubscribeRequest memory request = _request(planId, 1);
        bytes memory signature = _signSubscribe(subscriberPk, request);
        Subscriptions.Permit memory permit = _permit(subscriberPk, AMOUNT * PERIODS);
        request.periods = PERIODS;

        vm.expectRevert(Subscriptions.InvalidSignature.selector);
        subs.subscribeFor(request, signature, permit);
    }

    function test_SubscribeFor_WorksWhenPermitWasAlreadySubmitted() public {
        uint256 planId = _plan();
        Subscriptions.SubscribeRequest memory request = _request(planId, PERIODS);
        bytes memory signature = _signSubscribe(subscriberPk, request);
        Subscriptions.Permit memory permit = _permit(subscriberPk, AMOUNT * PERIODS);

        vm.prank(stranger);
        USDT.permit(subscriber, address(subs), permit.value, permit.deadline, permit.v, permit.r, permit.s);

        vm.prank(relayer);
        uint256 id = subs.subscribeFor(request, signature, permit);
        assertTrue(_sub(id).active);
        assertEq(USDT.balanceOf(merchant), AMOUNT - FEE);
    }

    function test_RevertWhen_NoAllowance() public {
        uint256 planId = _plan();
        Subscriptions.SubscribeRequest memory request = _request(planId, PERIODS);
        bytes memory signature = _signSubscribe(subscriberPk, request);

        vm.expectRevert(bytes("ERC20: transfer amount exceeds allowance"));
        vm.prank(relayer);
        subs.subscribeFor(request, signature, _noPermit());
    }

    function test_RevertWhen_SubscribeRequestReplayed() public {
        uint256 planId = _plan();
        Subscriptions.SubscribeRequest memory request = _request(planId, PERIODS);
        bytes memory signature = _signSubscribe(subscriberPk, request);
        subs.subscribeFor(request, signature, _permit(subscriberPk, AMOUNT * PERIODS));
        vm.prank(subscriber);
        subs.cancel(1);

        vm.expectRevert(Subscriptions.SignatureUsed.selector);
        subs.subscribeFor(request, signature, _noPermit());
    }

    function test_RevertWhen_SubscribeRequestExpired() public {
        uint256 planId = _plan();
        Subscriptions.SubscribeRequest memory request = _request(planId, PERIODS);
        bytes memory signature = _signSubscribe(subscriberPk, request);
        Subscriptions.Permit memory permit = _permit(subscriberPk, AMOUNT * PERIODS);
        vm.warp(request.deadline + 1);

        vm.expectRevert(Subscriptions.SignatureExpired.selector);
        subs.subscribeFor(request, signature, permit);
    }

    function test_RevertWhen_AlreadySubscribed() public {
        uint256 planId = _plan();
        _join(planId, PERIODS);

        Subscriptions.SubscribeRequest memory request = _request(planId, PERIODS);
        request.salt = keccak256("join-2");
        bytes memory signature = _signSubscribe(subscriberPk, request);

        vm.expectRevert(Subscriptions.AlreadySubscribed.selector);
        subs.subscribeFor(request, signature, _noPermit());
    }

    function test_RevertWhen_ZeroPeriods() public {
        uint256 planId = _plan();

        vm.expectRevert(Subscriptions.ZeroPeriods.selector);
        vm.prank(subscriber);
        subs.subscribe(planId, 0);
    }

    function test_RevertWhen_SubscribingToClosedPlan() public {
        uint256 planId = _plan();
        vm.prank(merchant);
        subs.closePlan(planId);

        vm.expectRevert(Subscriptions.PlanNotOpen.selector);
        vm.prank(subscriber);
        subs.subscribe(planId, PERIODS);
    }

    function test_RevertWhen_SubscribingToPlanThatWasNeverCreated() public {
        vm.expectRevert(Subscriptions.PlanNotOpen.selector);
        vm.prank(subscriber);
        subs.subscribe(99, PERIODS);
    }

    // ---------- Charge ----------

    function test_RevertWhen_ChargedBeforeDue() public {
        uint256 id = _join(_plan(), PERIODS);
        vm.warp(block.timestamp + PERIOD - 1);

        vm.expectRevert(Subscriptions.NotDue.selector);
        subs.charge(id);
    }

    function test_Charge_CollectsWhenDueAndKeepsTheSchedule() public {
        uint256 planId = _plan();
        uint256 id = _join(planId, PERIODS);
        uint256 firstDue = _sub(id).nextChargeAt;

        // A few minutes late is still on schedule: the next date doesn't drift.
        vm.warp(firstDue + 5 minutes);
        vm.expectEmit(true, true, true, true, address(subs));
        emit Charged(id, planId, subscriber, AMOUNT, FEE, uint64(firstDue + PERIOD));
        vm.prank(relayer);
        subs.charge(id);

        assertEq(_sub(id).nextChargeAt, firstDue + PERIOD);
        assertEq(_sub(id).periodsLeft, PERIODS - 2);
        assertEq(USDT.balanceOf(subscriber), START_BALANCE - 2 * AMOUNT);
        assertEq(USDT.balanceOf(merchant), 2 * (AMOUNT - FEE));
        assertEq(USDT.balanceOf(relayer), 2 * FEE);
        assertEq(USDT.balanceOf(address(subs)), 0);
    }

    function test_Charge_AnyoneMayCollectAndEarnsTheFee() public {
        uint256 id = _join(_plan(), PERIODS);
        vm.warp(_sub(id).nextChargeAt);

        vm.prank(stranger);
        subs.charge(id);

        assertEq(USDT.balanceOf(stranger), FEE);
    }

    function test_Charge_MissedPeriodsAreNotCollectedInABurst() public {
        uint256 id = _join(_plan(), PERIODS);
        vm.warp(block.timestamp + 3 * uint256(PERIOD) + 1 days);

        subs.charge(id);
        assertEq(_sub(id).nextChargeAt, block.timestamp + PERIOD);

        vm.expectRevert(Subscriptions.NotDue.selector);
        subs.charge(id);
    }

    function test_Charge_EndsAfterTheLastAllowedPeriod() public {
        uint256 planId = _plan();
        uint256 id = _join(planId, 2);
        vm.warp(_sub(id).nextChargeAt);

        vm.expectEmit(true, false, false, false, address(subs));
        emit SubscriptionEnded(id);
        subs.charge(id);

        assertFalse(_sub(id).active);
        assertEq(subs.subscriptionOf(planId, subscriber), 0);
        assertEq(USDT.allowance(subscriber, address(subs)), 0);

        vm.warp(block.timestamp + PERIOD);
        vm.expectRevert(Subscriptions.NotActive.selector);
        subs.charge(id);
    }

    function test_Subscribe_OnePeriodEndsStraightAway() public {
        uint256 planId = _plan();
        uint256 id = _join(planId, 1);

        assertFalse(_sub(id).active);
        assertEq(subs.subscriptionOf(planId, subscriber), 0);
        assertEq(USDT.balanceOf(merchant), AMOUNT - FEE);
    }

    function test_RevertWhen_SubscriberLacksUsdt_ThenChargesAfterTopUp() public {
        uint256 id = _join(_plan(), PERIODS);
        vm.warp(_sub(id).nextChargeAt);
        deal(address(USDT), subscriber, AMOUNT - 1);

        vm.expectRevert(bytes("ERC20: transfer amount exceeds balance"));
        subs.charge(id);
        assertEq(_sub(id).periodsLeft, PERIODS - 1);

        deal(address(USDT), subscriber, AMOUNT);
        subs.charge(id);
        assertEq(_sub(id).periodsLeft, PERIODS - 2);
    }

    function test_RevertWhen_ChargingAfterPlanClosed() public {
        uint256 planId = _plan();
        uint256 id = _join(planId, PERIODS);
        vm.prank(merchant);
        subs.closePlan(planId);
        vm.warp(_sub(id).nextChargeAt);

        vm.expectRevert(Subscriptions.PlanNotOpen.selector);
        subs.charge(id);
    }

    function test_RevertWhen_ChargingSubscriptionThatWasNeverCreated() public {
        vm.expectRevert(Subscriptions.NotActive.selector);
        subs.charge(99);
    }

    function testFuzz_Charges_NeverExceedWhatWasAllowed(uint32 periods, uint8 extraCalls) public {
        periods = uint32(bound(periods, 1, 20));
        uint256 planId = _plan();
        uint256 id = _join(planId, periods);

        for (uint256 i = 0; i < uint256(periods) + extraCalls; i++) {
            vm.warp(block.timestamp + PERIOD);
            try subs.charge(id) { } catch { }
        }

        assertEq(USDT.balanceOf(subscriber), START_BALANCE - AMOUNT * periods);
        assertEq(USDT.balanceOf(merchant), (AMOUNT - FEE) * periods);
        assertEq(USDT.balanceOf(address(subs)), 0);
        assertFalse(_sub(id).active);
    }

    // ---------- Cancel ----------

    function test_Cancel_BySubscriberStopsCharges() public {
        uint256 planId = _plan();
        uint256 id = _join(planId, PERIODS);

        vm.expectEmit(true, true, false, true, address(subs));
        emit SubscriptionCancelled(id, subscriber);
        vm.prank(subscriber);
        subs.cancel(id);

        assertFalse(_sub(id).active);
        assertEq(subs.subscriptionOf(planId, subscriber), 0);

        vm.warp(block.timestamp + PERIOD);
        vm.expectRevert(Subscriptions.NotActive.selector);
        subs.charge(id);
    }

    function test_Cancel_ByMerchant() public {
        uint256 id = _join(_plan(), PERIODS);

        vm.prank(merchant);
        subs.cancel(id);

        assertFalse(_sub(id).active);
    }

    function test_RevertWhen_StrangerCancels() public {
        uint256 id = _join(_plan(), PERIODS);

        vm.expectRevert(Subscriptions.NotAllowed.selector);
        vm.prank(stranger);
        subs.cancel(id);
    }

    function test_RevertWhen_CancelledTwice() public {
        uint256 id = _join(_plan(), PERIODS);
        vm.startPrank(subscriber);
        subs.cancel(id);

        vm.expectRevert(Subscriptions.NotActive.selector);
        subs.cancel(id);
        vm.stopPrank();
    }

    function test_CancelWithSignature_SubscriberNeedsNoGas() public {
        uint256 id = _join(_plan(), PERIODS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(subscriberPk, keccak256(abi.encode(CANCEL_TYPEHASH, id, deadline)));
        assertEq(subscriber.balance, 0);

        vm.expectEmit(true, true, false, true, address(subs));
        emit SubscriptionCancelled(id, subscriber);
        vm.prank(relayer);
        subs.cancelWithSignature(id, deadline, signature);

        assertFalse(_sub(id).active);
    }

    function test_CancelWithSignature_ByMerchant() public {
        uint256 id = _join(_plan(), PERIODS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(merchantPk, keccak256(abi.encode(CANCEL_TYPEHASH, id, deadline)));

        vm.prank(relayer);
        subs.cancelWithSignature(id, deadline, signature);

        assertFalse(_sub(id).active);
    }

    function test_RevertWhen_CancelSignedBySomeoneElse() public {
        uint256 id = _join(_plan(), PERIODS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(attackerPk, keccak256(abi.encode(CANCEL_TYPEHASH, id, deadline)));

        vm.expectRevert(Subscriptions.InvalidSignature.selector);
        subs.cancelWithSignature(id, deadline, signature);
    }

    function test_RevertWhen_CancelSignatureExpired() public {
        uint256 id = _join(_plan(), PERIODS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(subscriberPk, keccak256(abi.encode(CANCEL_TYPEHASH, id, deadline)));
        vm.warp(deadline + 1);

        vm.expectRevert(Subscriptions.SignatureExpired.selector);
        subs.cancelWithSignature(id, deadline, signature);
    }

    function test_RevertWhen_CancellingSubscriptionThatWasNeverCreated() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(subscriberPk, keccak256(abi.encode(CANCEL_TYPEHASH, 99, deadline)));

        vm.expectRevert(Subscriptions.InvalidSignature.selector);
        subs.cancelWithSignature(99, deadline, signature);
    }

    function test_SubscribeAgainAfterCancelling() public {
        uint256 planId = _plan();
        uint256 first = _join(planId, PERIODS);
        vm.prank(subscriber);
        subs.cancel(first);

        Subscriptions.SubscribeRequest memory request = _request(planId, PERIODS);
        request.salt = keccak256("join-2");
        bytes memory signature = _signSubscribe(subscriberPk, request);
        vm.prank(relayer);
        uint256 second = subs.subscribeFor(request, signature, _permit(subscriberPk, AMOUNT * PERIODS));

        assertEq(second, first + 1);
        assertTrue(_sub(second).active);
        assertEq(subs.subscriptionOf(planId, subscriber), second);
    }
}
