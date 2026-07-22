// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IExchangeRegistry} from "./interfaces/IExchangeRegistry.sol";

/**
 * @title TradeSettlement
 * @notice Executes barter trades and routes seller-side fees.
 *         In-network: fee → seller's operator
 *         Cross-network: 10% → seller's operator, 5% → platform treasury
 */
contract TradeSettlement is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    IERC20 public immutable token;
    IExchangeRegistry public immutable registry;

    address public treasury;
    uint16 public platformFeeBps = 500; // 5% of gross on cross-network
    uint16 public constant CROSS_NETWORK_FEE_BPS = 1500;
    uint16 public constant OPERATOR_CROSS_FEE_BPS = 1000;
    uint16 public constant MAX_PLATFORM_FEE_BPS = 1000;

    mapping(bytes32 => bool) public usedTradeRefs;

    event TradeSettled(
        address indexed buyer,
        address indexed seller,
        uint256 grossAmount,
        uint256 fee,
        uint32 buyerExchange,
        uint32 sellerExchange,
        bytes32 indexed tradeRef
    );
    event PlatformFeeBpsUpdated(uint16 feeBps);
    event TreasuryUpdated(address indexed treasury);

    error ZeroAddress();
    error ZeroAmount();
    error TradeRefUsed(bytes32 tradeRef);
    error UnregisteredMember(address member);
    error ExchangeInactive(uint32 exchangeId);
    error FeeTooHigh(uint16 feeBps);

    constructor(address admin, address token_, address registry_, address treasury_) {
        if (admin == address(0) || token_ == address(0) || registry_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        token = IERC20(token_);
        registry = IExchangeRegistry(registry_);
        treasury = treasury_;
    }

    function settleTrade(
        address buyer,
        address seller,
        uint256 grossAmount,
        bytes32 tradeRef
    ) external onlyRole(SETTLER_ROLE) nonReentrant {
        if (buyer == address(0) || seller == address(0)) revert ZeroAddress();
        if (grossAmount == 0) revert ZeroAmount();
        if (usedTradeRefs[tradeRef]) revert TradeRefUsed(tradeRef);

        uint32 buyerEx = registry.memberHomeExchange(buyer);
        uint32 sellerEx = registry.memberHomeExchange(seller);
        if (buyerEx == 0) revert UnregisteredMember(buyer);
        if (sellerEx == 0) revert UnregisteredMember(seller);

        IExchangeRegistry.Exchange memory buyerExchange = registry.exchanges(buyerEx);
        IExchangeRegistry.Exchange memory sellerExchange = registry.exchanges(sellerEx);
        if (!buyerExchange.active) revert ExchangeInactive(buyerEx);
        if (!sellerExchange.active) revert ExchangeInactive(sellerEx);

        usedTradeRefs[tradeRef] = true;

        uint256 fee;
        if (buyerEx == sellerEx) {
            fee = (grossAmount * sellerExchange.inNetworkFeeBps) / 10_000;
            token.safeTransferFrom(buyer, seller, grossAmount);
            if (fee > 0) {
                token.safeTransferFrom(seller, sellerExchange.operatorWallet, fee);
            }
        } else {
            fee = (grossAmount * CROSS_NETWORK_FEE_BPS) / 10_000;
            uint256 operatorFee = (grossAmount * OPERATOR_CROSS_FEE_BPS) / 10_000;
            uint256 platformFee = (grossAmount * platformFeeBps) / 10_000;
            // Ensure split adds up if platform fee is configured below 500
            if (operatorFee + platformFee != fee) {
                platformFee = fee - operatorFee;
            }
            token.safeTransferFrom(buyer, seller, grossAmount);
            if (operatorFee > 0) {
                token.safeTransferFrom(seller, sellerExchange.operatorWallet, operatorFee);
            }
            if (platformFee > 0) {
                token.safeTransferFrom(seller, treasury, platformFee);
            }
        }

        emit TradeSettled(buyer, seller, grossAmount, fee, buyerEx, sellerEx, tradeRef);
    }

    function setPlatformFeeBps(uint16 feeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feeBps > MAX_PLATFORM_FEE_BPS) revert FeeTooHigh(feeBps);
        platformFeeBps = feeBps;
        emit PlatformFeeBpsUpdated(feeBps);
    }

    function setTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function emergencyWithdraw(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
    }
}
