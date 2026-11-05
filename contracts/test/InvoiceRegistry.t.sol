// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { InvoiceRegistry } from "../src/InvoiceRegistry.sol";
import { IUSDT } from "../src/IUSDT.sol";

/// Runs against the REAL test USDT in a pinned fork, not a mock, so the signature construction,
/// the EIP-712 domain and the msg.sender == to guard are all proven against the deployed token.
contract InvoiceRegistryTest is Test {
    IUSDT constant USDT = IUSDT(0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7);
    uint256 constant PIN = 12304888;
    uint256 constant AMOUNT = 120e6;
    uint256 constant START_BALANCE = 500e6;
    uint256 constant OTHER_AMOUNT = 50e6;

    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    InvoiceRegistry registry;

    uint256 customerPk = 0xA11CE;
    address customer;
    address merchant = makeAddr("merchant");
    address relayer = makeAddr("relayer");
    address stranger = makeAddr("stranger");
    address otherMerchant = makeAddr("otherMerchant");
    uint256 otherCustomerPk = 0xB0B;
    address otherCustomer;

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

    function setUp() public {
        vm.createSelectFork("https://rpc.testnet.whitechain.io", PIN);
        registry = new InvoiceRegistry(USDT);
        customer = vm.addr(customerPk);
        otherCustomer = vm.addr(otherCustomerPk);
        deal(address(USDT), customer, START_BALANCE);
    }

    function _create() internal returns (uint256) {
        vm.prank(merchant);
        return registry.create(AMOUNT, uint64(block.timestamp + 7 days), keccak256("order-1"));
    }

    function _createOther(uint256 amount) internal returns (uint256) {
        vm.prank(otherMerchant);
        return registry.create(amount, 0, keccak256("order-2"));
    }

    function _parties(uint256 id) internal view returns (address invoiceMerchant, address payer) {
        (invoiceMerchant, payer,,,,,,) = registry.invoices(id);
    }

    function _status(uint256 id) internal view returns (InvoiceRegistry.Status status) {
        (,,,,,, status,) = registry.invoices(id);
    }

    function _payDirect(uint256 id) internal {
        vm.startPrank(customer);
        USDT.approve(address(registry), AMOUNT);
        registry.pay(id);
        vm.stopPrank();
    }

    function _sign(uint256 pk, uint256 id, address payer, uint256 value, uint256 validBefore)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 nonce = registry.authorizationNonce(id, payer);
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_TYPEHASH, payer, address(registry), value, 0, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", USDT.DOMAIN_SEPARATOR(), structHash));
        return vm.sign(pk, digest);
    }

    function _payGasless(uint256 id) internal {
        _payGaslessAs(customerPk, customer, id, AMOUNT);
    }

    function _payGaslessAs(uint256 pk, address payer, uint256 id, uint256 value) internal {
        uint256 validBefore = block.timestamp + 1800;
        (uint8 v, bytes32 r, bytes32 s) = _sign(pk, id, payer, value, validBefore);
        vm.prank(relayer);
        registry.payWithAuthorization(id, payer, 0, validBefore, v, r, s);
    }

    function _approveRefunds() internal {
        vm.prank(merchant);
        USDT.approve(address(registry), type(uint256).max);
    }

    // create

    function test_CreateStoresInvoice() public {
        uint64 dueAt = uint64(block.timestamp + 7 days);
        bytes32 ref = keccak256("order-1");

        vm.expectEmit(address(registry));
        emit InvoiceCreated(1, merchant, AMOUNT, dueAt, ref);
        uint256 id = _create();

        (
            address storedMerchant,
            address payer,
            uint256 amount,
            uint256 refunded,
            uint64 storedDueAt,
            uint64 paidAt,
            InvoiceRegistry.Status status,
            bytes32 storedRef
        ) = registry.invoices(id);
        assertEq(id, 1);
        assertEq(registry.nextId(), 2);
        assertEq(storedMerchant, merchant);
        assertEq(payer, address(0));
        assertEq(amount, AMOUNT);
        assertEq(refunded, 0);
        assertEq(storedDueAt, dueAt);
        assertEq(paidAt, 0);
        assertEq(uint8(status), uint8(InvoiceRegistry.Status.Open));
        assertEq(storedRef, ref);
    }

    function test_CreateRejectsZeroAmount() public {
        vm.expectRevert(InvoiceRegistry.ZeroAmount.selector);
        registry.create(0, 0, bytes32(0));
    }

    // direct path

    function test_PayDirect() public {
        uint256 id = _create();
        vm.prank(customer);
        USDT.approve(address(registry), AMOUNT);

        vm.expectEmit(address(registry));
        emit InvoicePaid(id, merchant, customer, AMOUNT, false);
        vm.prank(customer);
        registry.pay(id);

        (, address payer,,,, uint64 paidAt, InvoiceRegistry.Status status,) = registry.invoices(id);
        assertEq(uint8(status), uint8(InvoiceRegistry.Status.Paid));
        assertEq(payer, customer);
        assertEq(paidAt, block.timestamp);
        assertEq(USDT.balanceOf(merchant), AMOUNT);
        assertEq(USDT.balanceOf(customer), START_BALANCE - AMOUNT);
        assertEq(USDT.balanceOf(address(registry)), 0, "registry must not hold funds");
    }

    function test_PayTwiceReverts() public {
        uint256 id = _create();
        _payDirect(id);

        vm.expectRevert(InvoiceRegistry.InvoiceNotOpen.selector);
        vm.prank(customer);
        registry.pay(id);
    }

    function test_PayNonexistentInvoiceReverts() public {
        vm.expectRevert(InvoiceRegistry.InvoiceNotFound.selector);
        vm.prank(customer);
        registry.pay(999);
    }

    function _assertUnpaid(uint256 id) internal view {
        (, address payer,,,, uint64 paidAt, InvoiceRegistry.Status status,) = registry.invoices(id);
        assertEq(uint8(status), uint8(InvoiceRegistry.Status.Open), "status must stay Open");
        assertEq(payer, address(0), "payer must stay empty");
        assertEq(paidAt, 0, "paidAt must stay empty");
        assertEq(USDT.balanceOf(merchant), 0, "merchant must not be paid");
    }

    /// _markPaid runs before the transfer, so a failed transfer must undo it.
    function test_PayWithoutApprovalLeavesInvoiceUnpaid() public {
        uint256 id = _create();

        vm.expectRevert(bytes("ERC20: transfer amount exceeds allowance"));
        vm.prank(customer);
        registry.pay(id);

        _assertUnpaid(id);
        assertEq(USDT.balanceOf(customer), START_BALANCE);
    }

    function test_PayWithoutEnoughUSDTLeavesInvoiceUnpaid() public {
        uint256 id = _create();
        deal(address(USDT), customer, AMOUNT - 1);
        vm.prank(customer);
        USDT.approve(address(registry), AMOUNT);

        vm.expectRevert(bytes("ERC20: transfer amount exceeds balance"));
        vm.prank(customer);
        registry.pay(id);

        _assertUnpaid(id);
        assertEq(USDT.balanceOf(customer), AMOUNT - 1);
    }

    function test_FailedPaymentCanBeRetried() public {
        uint256 id = _create();

        vm.expectRevert(bytes("ERC20: transfer amount exceeds allowance"));
        vm.prank(customer);
        registry.pay(id);

        _payDirect(id);
        assertEq(uint8(_status(id)), uint8(InvoiceRegistry.Status.Paid));
        assertEq(USDT.balanceOf(merchant), AMOUNT);
    }

    // gasless path

    function test_PayGasless() public {
        uint256 id = _create();
        assertEq(customer.balance, 0, "customer holds no WBT");
        assertEq(USDT.balanceOf(relayer), 0, "relayer holds no USDT");

        vm.expectEmit(address(registry));
        emit InvoicePaid(id, merchant, customer, AMOUNT, true);
        _payGasless(id);

        (, address payer,,,,, InvoiceRegistry.Status status,) = registry.invoices(id);
        assertEq(uint8(status), uint8(InvoiceRegistry.Status.Paid));
        assertEq(payer, customer);
        assertEq(USDT.balanceOf(merchant), AMOUNT);
        assertEq(USDT.balanceOf(customer), START_BALANCE - AMOUNT);
        assertEq(USDT.balanceOf(address(registry)), 0, "registry must not hold funds");
        assertTrue(USDT.authorizationState(customer, registry.authorizationNonce(id, customer)));
    }

    function test_GaslessReplayReverts() public {
        uint256 id = _create();
        uint256 validBefore = block.timestamp + 1800;
        (uint8 v, bytes32 r, bytes32 s) = _sign(customerPk, id, customer, AMOUNT, validBefore);

        vm.prank(relayer);
        registry.payWithAuthorization(id, customer, 0, validBefore, v, r, s);

        vm.expectRevert(InvoiceRegistry.InvoiceNotOpen.selector);
        vm.prank(relayer);
        registry.payWithAuthorization(id, customer, 0, validBefore, v, r, s);

        // Replayed at the token too: the nonce is spent, even with the registry as caller.
        bytes32 nonce = registry.authorizationNonce(id, customer);
        vm.expectRevert(bytes("TetherToken: auth invalid"));
        vm.prank(address(registry));
        USDT.receiveWithAuthorization(customer, address(registry), AMOUNT, 0, validBefore, nonce, v, r, s);
    }

    function test_SignatureForAnotherInvoiceReverts() public {
        uint256 signedFor = _create();
        uint256 other = _create();
        uint256 validBefore = block.timestamp + 1800;
        (uint8 v, bytes32 r, bytes32 s) = _sign(customerPk, signedFor, customer, AMOUNT, validBefore);

        vm.expectRevert(bytes("TetherToken: invalid signature"));
        vm.prank(relayer);
        registry.payWithAuthorization(other, customer, 0, validBefore, v, r, s);

        assertEq(uint8(_status(other)), uint8(InvoiceRegistry.Status.Open));
        assertEq(USDT.balanceOf(customer), START_BALANCE);
    }

    function test_SignatureForLowerAmountReverts() public {
        uint256 id = _create();
        uint256 validBefore = block.timestamp + 1800;
        (uint8 v, bytes32 r, bytes32 s) = _sign(customerPk, id, customer, AMOUNT - 1, validBefore);

        vm.expectRevert(bytes("TetherToken: invalid signature"));
        vm.prank(relayer);
        registry.payWithAuthorization(id, customer, 0, validBefore, v, r, s);
    }

    function test_SignatureFromAnotherKeyReverts() public {
        uint256 id = _create();
        uint256 validBefore = block.timestamp + 1800;
        (uint8 v, bytes32 r, bytes32 s) = _sign(0xBAD, id, customer, AMOUNT, validBefore);

        vm.expectRevert(bytes("TetherToken: invalid signature"));
        vm.prank(relayer);
        registry.payWithAuthorization(id, customer, 0, validBefore, v, r, s);
    }

    function test_ExpiredAuthorizationReverts() public {
        uint256 id = _create();
        uint256 validBefore = block.timestamp + 1800;
        (uint8 v, bytes32 r, bytes32 s) = _sign(customerPk, id, customer, AMOUNT, validBefore);

        vm.warp(validBefore + 1);
        vm.expectRevert(bytes("TetherToken: auth expired"));
        vm.prank(relayer);
        registry.payWithAuthorization(id, customer, 0, validBefore, v, r, s);
    }

    /// The signature names the registry as `to`, so nobody else can spend it at the token and
    /// move the funds without marking the invoice paid.
    function test_OnlyRegistryCanConsumeSignature() public {
        uint256 id = _create();
        uint256 validBefore = block.timestamp + 1800;
        (uint8 v, bytes32 r, bytes32 s) = _sign(customerPk, id, customer, AMOUNT, validBefore);
        bytes32 nonce = registry.authorizationNonce(id, customer);

        vm.expectRevert(bytes("TetherToken: to != msg.sender"));
        vm.prank(stranger);
        USDT.receiveWithAuthorization(customer, address(registry), AMOUNT, 0, validBefore, nonce, v, r, s);

        assertEq(USDT.balanceOf(customer), START_BALANCE);
        assertEq(uint8(_status(id)), uint8(InvoiceRegistry.Status.Open));
    }

    function test_GaslessNonexistentInvoiceReverts() public {
        uint256 validBefore = block.timestamp + 1800;
        (uint8 v, bytes32 r, bytes32 s) = _sign(customerPk, 999, customer, 0, validBefore);

        vm.expectRevert(InvoiceRegistry.InvoiceNotFound.selector);
        vm.prank(relayer);
        registry.payWithAuthorization(999, customer, 0, validBefore, v, r, s);
    }

    function test_GaslessWithoutEnoughUSDTLeavesInvoiceUnpaid() public {
        uint256 id = _create();
        deal(address(USDT), customer, AMOUNT - 1);
        uint256 validBefore = block.timestamp + 1800;
        (uint8 v, bytes32 r, bytes32 s) = _sign(customerPk, id, customer, AMOUNT, validBefore);

        vm.expectRevert(bytes("ERC20: transfer amount exceeds balance"));
        vm.prank(relayer);
        registry.payWithAuthorization(id, customer, 0, validBefore, v, r, s);

        _assertUnpaid(id);
        assertFalse(USDT.authorizationState(customer, registry.authorizationNonce(id, customer)));
    }

    /// Must stay byte-identical to the SDK. This literal came from viem's encodeAbiParameters and
    /// from cast, not from Solidity; keep the same literal in the SDK's test.
    function test_AuthorizationNonceMatchesTypeScript() public view {
        assertEq(
            registry.authorizationNonce(1, 0x1111111111111111111111111111111111111111),
            0x5a14309ab5ce5f0148bb975d4b433e9929c8e3bafbff10d93f108474b10d0ddf
        );
    }

    // refunds

    function test_RefundPartialThenFull() public {
        uint256 id = _create();
        _payGasless(id);
        _approveRefunds();

        vm.expectEmit(address(registry));
        emit InvoiceRefunded(id, merchant, customer, 20e6, 20e6);
        vm.prank(merchant);
        registry.refund(id, 20e6);

        assertEq(uint8(_status(id)), uint8(InvoiceRegistry.Status.Refunded));
        assertEq(USDT.balanceOf(customer), START_BALANCE - AMOUNT + 20e6);

        vm.prank(merchant);
        registry.refund(id, 100e6);

        (,,, uint256 refunded,,,,) = registry.invoices(id);
        assertEq(refunded, AMOUNT);
        assertEq(USDT.balanceOf(customer), START_BALANCE);
        assertEq(USDT.balanceOf(merchant), 0);
        assertEq(USDT.balanceOf(address(registry)), 0, "registry must not hold funds");
    }

    function test_OverRefundReverts() public {
        uint256 id = _create();
        _payDirect(id);
        _approveRefunds();

        vm.prank(merchant);
        registry.refund(id, 100e6);

        vm.expectRevert(InvoiceRegistry.RefundTooLarge.selector);
        vm.prank(merchant);
        registry.refund(id, 20e6 + 1);
    }

    function test_RefundOnlyByMerchant() public {
        uint256 id = _create();
        _payDirect(id);

        vm.expectRevert(InvoiceRegistry.NotMerchant.selector);
        vm.prank(stranger);
        registry.refund(id, 1e6);
    }

    function test_RefundBeforePaymentReverts() public {
        uint256 id = _create();

        vm.expectRevert(InvoiceRegistry.NotRefundable.selector);
        vm.prank(merchant);
        registry.refund(id, 1e6);
    }

    function test_ZeroRefundReverts() public {
        uint256 id = _create();
        _payDirect(id);

        vm.expectRevert(InvoiceRegistry.ZeroAmount.selector);
        vm.prank(merchant);
        registry.refund(id, 0);
    }

    function test_RefundWithoutApprovalReverts() public {
        uint256 id = _create();
        _payDirect(id);

        vm.expectRevert(bytes("ERC20: transfer amount exceeds allowance"));
        vm.prank(merchant);
        registry.refund(id, 1e6);
    }

    // cancel

    function test_Cancel() public {
        uint256 id = _create();

        vm.expectEmit(address(registry));
        emit InvoiceCancelled(id, merchant);
        vm.prank(merchant);
        registry.cancel(id);

        assertEq(uint8(_status(id)), uint8(InvoiceRegistry.Status.Cancelled));

        vm.expectRevert(InvoiceRegistry.InvoiceNotOpen.selector);
        vm.prank(customer);
        registry.pay(id);
    }

    function test_CancelOnlyByMerchant() public {
        uint256 id = _create();

        vm.expectRevert(InvoiceRegistry.NotMerchant.selector);
        vm.prank(stranger);
        registry.cancel(id);
    }

    function test_CancelAfterPaymentReverts() public {
        uint256 id = _create();
        _payDirect(id);

        vm.expectRevert(InvoiceRegistry.InvoiceNotOpen.selector);
        vm.prank(merchant);
        registry.cancel(id);
    }

    // multiple merchants

    function test_TwoMerchantsWithDifferentCustomers() public {
        deal(address(USDT), otherCustomer, START_BALANCE);
        uint256 id = _create();
        uint256 otherId = _createOther(OTHER_AMOUNT);

        // One relayer serves both merchants.
        _payGasless(id);
        vm.expectEmit(address(registry));
        emit InvoicePaid(otherId, otherMerchant, otherCustomer, OTHER_AMOUNT, true);
        _payGaslessAs(otherCustomerPk, otherCustomer, otherId, OTHER_AMOUNT);

        (address storedMerchant, address payer) = _parties(id);
        (address otherStoredMerchant, address otherPayer) = _parties(otherId);
        assertEq(storedMerchant, merchant);
        assertEq(payer, customer);
        assertEq(otherStoredMerchant, otherMerchant);
        assertEq(otherPayer, otherCustomer);

        assertEq(USDT.balanceOf(merchant), AMOUNT);
        assertEq(USDT.balanceOf(otherMerchant), OTHER_AMOUNT);
        assertEq(USDT.balanceOf(customer), START_BALANCE - AMOUNT);
        assertEq(USDT.balanceOf(otherCustomer), START_BALANCE - OTHER_AMOUNT);

        // A refund comes from that invoice's merchant and goes to that invoice's customer.
        vm.startPrank(otherMerchant);
        USDT.approve(address(registry), OTHER_AMOUNT);
        vm.expectEmit(address(registry));
        emit InvoiceRefunded(otherId, otherMerchant, otherCustomer, OTHER_AMOUNT, OTHER_AMOUNT);
        registry.refund(otherId, OTHER_AMOUNT);
        vm.stopPrank();

        assertEq(USDT.balanceOf(otherCustomer), START_BALANCE);
        assertEq(USDT.balanceOf(otherMerchant), 0);
        assertEq(USDT.balanceOf(customer), START_BALANCE - AMOUNT);
        assertEq(USDT.balanceOf(merchant), AMOUNT);
        assertEq(USDT.balanceOf(address(registry)), 0, "registry must not hold funds");
    }

    function test_MerchantCannotTouchAnotherMerchantsInvoice() public {
        uint256 id = _create();
        _payDirect(id);
        uint256 openId = _create();

        vm.expectRevert(InvoiceRegistry.NotMerchant.selector);
        vm.prank(otherMerchant);
        registry.refund(id, 1e6);

        vm.expectRevert(InvoiceRegistry.NotMerchant.selector);
        vm.prank(otherMerchant);
        registry.cancel(openId);
    }

    function test_SignatureCannotPayAnotherMerchantsInvoice() public {
        uint256 id = _create();
        uint256 otherId = _createOther(AMOUNT);

        uint256 validBefore = block.timestamp + 1800;
        (uint8 v, bytes32 r, bytes32 s) = _sign(customerPk, id, customer, AMOUNT, validBefore);

        vm.expectRevert(bytes("TetherToken: invalid signature"));
        vm.prank(relayer);
        registry.payWithAuthorization(otherId, customer, 0, validBefore, v, r, s);

        assertEq(USDT.balanceOf(otherMerchant), 0);
        assertEq(USDT.balanceOf(customer), START_BALANCE);
    }
}
