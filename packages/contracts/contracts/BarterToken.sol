// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IExchangeRegistry} from "./interfaces/IExchangeRegistry.sol";

/**
 * @title BarterToken (BRT)
 * @notice Trade-credit token pegged 1:1 to USD with 2 decimals.
 *         Fees live in TradeSettlement — this token stays dumb.
 */
contract BarterToken is ERC20, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");

    IExchangeRegistry public exchangeRegistry;

    mapping(address => bool) public frozen;

    event Minted(address indexed to, uint256 amount, address indexed minter);
    event Burned(address indexed from, uint256 amount, address indexed burner);
    event Frozen(address indexed account, address indexed by);
    event Unfrozen(address indexed account, address indexed by);
    event ExchangeRegistryUpdated(address indexed registry);

    error AccountFrozen(address account);
    error ExchangeSuspended(uint32 exchangeId);
    error UnauthorizedFreeze();
    error ZeroAddress();
    error ZeroAmount();

    constructor(address admin, address registry_) ERC20("Barter Trade Credit", "BRT") {
        if (admin == address(0) || registry_ == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        exchangeRegistry = IExchangeRegistry(registry_);
    }

    function decimals() public pure override returns (uint8) {
        return 2;
    }

    function setExchangeRegistry(address registry_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (registry_ == address(0)) revert ZeroAddress();
        exchangeRegistry = IExchangeRegistry(registry_);
        emit ExchangeRegistryUpdated(registry_);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _mint(to, amount);
        emit Minted(to, amount, msg.sender);
    }

    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) whenNotPaused {
        if (from == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _burn(from, amount);
        emit Burned(from, amount, msg.sender);
    }

    function freeze(address account) external whenNotPaused {
        if (account == address(0)) revert ZeroAddress();
        if (!_canFreeze(account, msg.sender)) revert UnauthorizedFreeze();
        frozen[account] = true;
        emit Frozen(account, msg.sender);
    }

    function unfreeze(address account) external whenNotPaused {
        if (account == address(0)) revert ZeroAddress();
        if (!_canFreeze(account, msg.sender)) revert UnauthorizedFreeze();
        frozen[account] = false;
        emit Unfrozen(account, msg.sender);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _canFreeze(address account, address caller) internal view returns (bool) {
        if (hasRole(DEFAULT_ADMIN_ROLE, caller) || hasRole(FREEZER_ROLE, caller)) {
            return true;
        }
        uint32 home = exchangeRegistry.memberHomeExchange(account);
        if (home == 0) return false;
        IExchangeRegistry.Exchange memory ex = exchangeRegistry.exchanges(home);
        return ex.operatorWallet == caller;
    }

    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        if (from != address(0) && frozen[from]) revert AccountFrozen(from);
        if (to != address(0) && frozen[to]) revert AccountFrozen(to);

        if (from != address(0)) {
            uint32 fromEx = exchangeRegistry.memberHomeExchange(from);
            if (fromEx != 0) {
                IExchangeRegistry.Exchange memory ex = exchangeRegistry.exchanges(fromEx);
                if (!ex.active) revert ExchangeSuspended(fromEx);
            }
        }
        if (to != address(0)) {
            uint32 toEx = exchangeRegistry.memberHomeExchange(to);
            if (toEx != 0) {
                IExchangeRegistry.Exchange memory ex = exchangeRegistry.exchanges(toEx);
                if (!ex.active) revert ExchangeSuspended(toEx);
            }
        }

        super._update(from, to, value);
    }
}
