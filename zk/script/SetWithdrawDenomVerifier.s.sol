// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Wire WithdrawDenomVerifier onto one or more ShieldedPools (Private claim path).
//
//   export WITHDRAW_DENOM_VERIFIER_ADDRESS=0x...
//   # either explicit pools:
//   export POOL_ADDRESSES=0xPoolUsdc,0xPoolEurc
//   # or resolve via router + tokens:
//   export POOL_ROUTER_ADDRESS=0x...
//   export TOKEN_ADDRESSES=0xUsdc,0xEurc
//   forge script script/SetWithdrawDenomVerifier.s.sol:SetWithdrawDenomVerifier --rpc-url "$RPC" --broadcast

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../contract/ShieldedPool.sol";
import "../contract/PoolRouter.sol";

contract SetWithdrawDenomVerifier is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address verifier = vm.envAddress("WITHDRAW_DENOM_VERIFIER_ADDRESS");
        require(verifier != address(0), "WITHDRAW_DENOM_VERIFIER_ADDRESS=0");

        address[] memory pools = _resolvePools();
        require(pools.length > 0, "no pools");

        vm.startBroadcast(pk);
        for (uint256 i = 0; i < pools.length; i++) {
            ShieldedPool(pools[i]).setWithdrawDenomVerifier(verifier);
            console2.log("setWithdrawDenomVerifier", pools[i], verifier);
        }
        vm.stopBroadcast();
    }

    function _resolvePools() internal view returns (address[] memory pools) {
        string memory rawPools = vm.envOr("POOL_ADDRESSES", string(""));
        if (bytes(rawPools).length > 0) {
            return _parseAddresses(rawPools);
        }

        address router = vm.envAddress("POOL_ROUTER_ADDRESS");
        string memory rawTokens = vm.envString("TOKEN_ADDRESSES");
        require(router != address(0), "POOL_ROUTER_ADDRESS=0");
        require(bytes(rawTokens).length > 0, "TOKEN_ADDRESSES or POOL_ADDRESSES required");

        address[] memory tokens = _parseAddresses(rawTokens);
        pools = new address[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            address p = PoolRouter(payable(router)).poolOf(tokens[i]);
            require(p != address(0), "token not listed on router");
            pools[i] = p;
        }
    }

    function _parseAddresses(string memory csv) internal pure returns (address[] memory out) {
        bytes memory b = bytes(csv);
        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ",") count++;
        }
        out = new address[](count);
        uint256 start = 0;
        uint256 idx = 0;
        for (uint256 i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == ",") {
                bytes memory slice = new bytes(i - start);
                for (uint256 j = 0; j < slice.length; j++) {
                    slice[j] = b[start + j];
                }
                out[idx++] = _toAddress(string(slice));
                start = i + 1;
            }
        }
    }

    function _toAddress(string memory s) internal pure returns (address) {
        bytes memory b = bytes(s);
        // trim spaces
        uint256 start = 0;
        uint256 end = b.length;
        while (start < end && b[start] == 0x20) start++;
        while (end > start && b[end - 1] == 0x20) end--;
        require(end - start == 42, "bad address len");
        require(b[start] == "0" && (b[start + 1] == "x" || b[start + 1] == "X"), "bad 0x");
        uint160 result = 0;
        for (uint256 i = start + 2; i < end; i++) {
            uint8 c = uint8(b[i]);
            uint8 v;
            if (c >= 48 && c <= 57) v = c - 48;
            else if (c >= 65 && c <= 70) v = c - 55;
            else if (c >= 97 && c <= 102) v = c - 87;
            else revert("bad hex");
            result = (result << 4) | v;
        }
        return address(result);
    }
}
