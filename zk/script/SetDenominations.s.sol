// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Owner-only: set Private-mode denomination tables on one or more ShieldedPools.
// Tables must match web/lib/denominations.ts + zk/circuits/src/withdraw_denom.nr.
//
// Single pool:
//   source .env
//   export POOL_ADDRESS=0x...
//   export DENOM_KIND=stables6   # stables6 | stables18 | native18 | copm18
//   forge script script/SetDenominations.s.sol:SetDenominations --rpc-url "$CELO_RPC" --broadcast
//
// Many pools (kind per address):
//   export POOL_CONFIGS=0xUsdcPool:stables6,0xWethPool:native18,0xCopmPool:copm18
//   forge script script/SetDenominations.s.sol:SetDenominations --rpc-url "$RPC" --broadcast
//
// Env:
//   PRIVATE_KEY          (must be pool.owner())
//   POOL_ADDRESS         (optional if POOL_CONFIGS set)
//   DENOM_KIND           (required with POOL_ADDRESS)
//   POOL_CONFIGS         (optional; csv of pool:kind)

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../contract/ShieldedPool.sol";

contract SetDenominations is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address caller = vm.addr(pk);

        string memory configs = vm.envOr("POOL_CONFIGS", string(""));
        if (bytes(configs).length == 0) {
            address pool = vm.envAddress("POOL_ADDRESS");
            string memory kind = vm.envString("DENOM_KIND");
            configs = string.concat(vm.toString(pool), ":", kind);
        }

        string[] memory parts = _splitCsv(configs);

        vm.startBroadcast(pk);
        for (uint256 i = 0; i < parts.length; i++) {
            (address pool, string memory kind) = _parsePair(parts[i]);
            require(pool != address(0), "bad pool");
            ShieldedPool sp = ShieldedPool(pool);
            address owner = sp.owner();
            require(owner == caller, "PRIVATE_KEY is not pool owner");

            uint256[] memory amounts = _amountsForKind(kind);
            sp.setDenominations(amounts);

            console2.log("---");
            console2.log("pool", pool);
            console2.log("kind", kind);
            console2.log("count", amounts.length);
            console2.log("id0", amounts[0]);
            if (amounts.length > 10) {
                console2.log("id10", amounts[10]);
            }
        }
        vm.stopBroadcast();
    }

    function _amountsForKind(string memory kind) internal pure returns (uint256[] memory d) {
        bytes32 k = keccak256(bytes(kind));
        if (k == keccak256("stables6")) {
            // USDC / USDT / USDG - human 50..50k + id10=10, 6 decimals
            d = new uint256[](11);
            d[0] = 50e6;
            d[1] = 100e6;
            d[2] = 250e6;
            d[3] = 500e6;
            d[4] = 1_000e6;
            d[5] = 2_500e6;
            d[6] = 5_000e6;
            d[7] = 10_000e6;
            d[8] = 25_000e6;
            d[9] = 50_000e6;
            d[10] = 10e6;
            return d;
        }
        if (k == keccak256("stables18")) {
            // USDe - same human ladder, 18 decimals
            d = new uint256[](11);
            d[0] = 50 ether;
            d[1] = 100 ether;
            d[2] = 250 ether;
            d[3] = 500 ether;
            d[4] = 1_000 ether;
            d[5] = 2_500 ether;
            d[6] = 5_000 ether;
            d[7] = 10_000 ether;
            d[8] = 25_000 ether;
            d[9] = 50_000 ether;
            d[10] = 10 ether;
            return d;
        }
        if (k == keccak256("native18")) {
            // CELO / WMON / WETH - 0.1, 0.5, 1, 5, ... + id10=10
            d = new uint256[](11);
            d[0] = 0.1 ether;
            d[1] = 0.5 ether;
            d[2] = 1 ether;
            d[3] = 5 ether;
            d[4] = 25 ether;
            d[5] = 50 ether;
            d[6] = 100 ether;
            d[7] = 250 ether;
            d[8] = 500 ether;
            d[9] = 1_000 ether;
            d[10] = 10 ether;
            return d;
        }
        if (k == keccak256("copm18")) {
            // COPm thousands only (no id10=10)
            d = new uint256[](10);
            d[0] = 10_000 ether;
            d[1] = 25_000 ether;
            d[2] = 50_000 ether;
            d[3] = 100_000 ether;
            d[4] = 250_000 ether;
            d[5] = 500_000 ether;
            d[6] = 1_000_000 ether;
            d[7] = 2_500_000 ether;
            d[8] = 5_000_000 ether;
            d[9] = 10_000_000 ether;
            return d;
        }
        revert(string.concat("unknown DENOM_KIND: ", kind));
    }

    function _parsePair(string memory pair) internal pure returns (address pool, string memory kind) {
        bytes memory b = bytes(pair);
        uint256 colon = type(uint256).max;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ":") {
                colon = i;
                break;
            }
        }
        require(colon != type(uint256).max && colon > 0 && colon + 1 < b.length, "bad pool:kind");
        bytes memory addrBytes = new bytes(colon);
        for (uint256 i = 0; i < colon; i++) {
            addrBytes[i] = b[i];
        }
        bytes memory kindBytes = new bytes(b.length - colon - 1);
        for (uint256 i = 0; i < kindBytes.length; i++) {
            kindBytes[i] = b[colon + 1 + i];
        }
        pool = vm.parseAddress(string(addrBytes));
        kind = string(kindBytes);
    }

    function _splitCsv(string memory csv) internal pure returns (string[] memory) {
        bytes memory b = bytes(csv);
        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ",") count++;
        }
        string[] memory parts = new string[](count);
        uint256 start = 0;
        uint256 idx = 0;
        for (uint256 i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == ",") {
                bytes memory slice = new bytes(i - start);
                for (uint256 j = start; j < i; j++) {
                    slice[j - start] = b[j];
                }
                parts[idx++] = string(slice);
                start = i + 1;
            }
        }
        return parts;
    }
}
