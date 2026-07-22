// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IExchangeRegistry} from "./interfaces/IExchangeRegistry.sol";

/**
 * @title ExchangeRegistry
 * @notice Maps exchanges (networks) and members. Cross-network detection lives here.
 */
contract ExchangeRegistry is AccessControl, IExchangeRegistry {
    uint16 public constant MAX_FEE_BPS = 2000;

    mapping(uint32 => Exchange) private _exchanges;
    mapping(address => uint32) public memberHomeExchange;
    uint32 public nextExchangeId = 1;

    event ExchangeRegistered(uint32 indexed id, address indexed operatorWallet, string name, uint16 feeBps);
    event ExchangeActiveSet(uint32 indexed id, bool active);
    event InNetworkFeeSet(uint32 indexed id, uint16 feeBps);
    event MemberRegistered(address indexed member, uint32 indexed exchangeId);
    event MemberTransferred(address indexed member, uint32 indexed fromExchange, uint32 indexed toExchange);

    error ZeroAddress();
    error ExchangeNotFound(uint32 id);
    error Unauthorized();
    error AlreadyRegistered(address member);
    error FeeTooHigh(uint16 feeBps);
    error InvalidFee();

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function exchanges(uint32 id) external view returns (Exchange memory) {
        return _exchanges[id];
    }

    function registerExchange(
        address operatorWallet,
        string calldata name,
        uint16 inNetworkFeeBps
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint32 id) {
        if (operatorWallet == address(0)) revert ZeroAddress();
        if (inNetworkFeeBps == 0 || inNetworkFeeBps > MAX_FEE_BPS) revert InvalidFee();

        id = nextExchangeId++;
        _exchanges[id] = Exchange({
            id: id,
            operatorWallet: operatorWallet,
            active: true,
            inNetworkFeeBps: inNetworkFeeBps,
            name: name
        });
        emit ExchangeRegistered(id, operatorWallet, name, inNetworkFeeBps);
    }

    function setExchangeActive(uint32 id, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_exchanges[id].id == 0) revert ExchangeNotFound(id);
        _exchanges[id].active = active;
        emit ExchangeActiveSet(id, active);
    }

    function setInNetworkFee(uint32 id, uint16 feeBps) external {
        Exchange storage ex = _exchanges[id];
        if (ex.id == 0) revert ExchangeNotFound(id);
        if (msg.sender != ex.operatorWallet && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert Unauthorized();
        }
        if (feeBps == 0 || feeBps > MAX_FEE_BPS) revert FeeTooHigh(feeBps);
        ex.inNetworkFeeBps = feeBps;
        emit InNetworkFeeSet(id, feeBps);
    }

    function registerMember(address member, uint32 exchangeId) external {
        if (member == address(0)) revert ZeroAddress();
        Exchange storage ex = _exchanges[exchangeId];
        if (ex.id == 0) revert ExchangeNotFound(exchangeId);
        if (msg.sender != ex.operatorWallet && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert Unauthorized();
        }
        if (memberHomeExchange[member] != 0) revert AlreadyRegistered(member);
        memberHomeExchange[member] = exchangeId;
        emit MemberRegistered(member, exchangeId);
    }

    function transferMember(address member, uint32 toExchangeId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (member == address(0)) revert ZeroAddress();
        uint32 fromId = memberHomeExchange[member];
        if (_exchanges[toExchangeId].id == 0) revert ExchangeNotFound(toExchangeId);
        memberHomeExchange[member] = toExchangeId;
        emit MemberTransferred(member, fromId, toExchangeId);
    }

    function isSameExchange(address a, address b) external view returns (bool) {
        uint32 aEx = memberHomeExchange[a];
        uint32 bEx = memberHomeExchange[b];
        return aEx != 0 && aEx == bEx;
    }
}
