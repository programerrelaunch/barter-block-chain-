// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IExchangeRegistry {
    struct Exchange {
        uint32 id;
        address operatorWallet;
        bool active;
        uint16 inNetworkFeeBps;
        string name;
    }

    function exchanges(uint32 id) external view returns (Exchange memory);
    function memberHomeExchange(address member) external view returns (uint32);
    function isSameExchange(address a, address b) external view returns (bool);
}
