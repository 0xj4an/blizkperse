// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Deploy multi-pool + router:
//   1) forge script script/DeployDepositVerifier.s.sol:DeployDepositVerifier --rpc-url "$RPC_URL" --broadcast
//   2) export DEPOSIT_VERIFIER_ADDRESS=0x...
//   3) source .env && forge script script/Deploy.s.sol:DeployMultiPool --rpc-url "$RPC_URL" --broadcast
// Env:
//   PRIVATE_KEY
//   TOKEN_ADDRESSES=0xUSDC,0xUSDT,...   (comma-separated ERC-20s)
//   WRAPPED_NATIVE=0xWMON               (optional; address(0) on Celo — CELO is already ERC-20)
//   DEPOSIT_VERIFIER_ADDRESS            (required — deploy via DeployDepositVerifier first)

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../contract/Verifier.sol";
import "../contract/WithdrawVerifier.sol";
import "../contract/ShieldedPool.sol";
import "../contract/PoolRouter.sol";

contract DeployMultiPool is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address wrappedNative = vm.envOr("WRAPPED_NATIVE", address(0));
        address depositVerifier = vm.envAddress("DEPOSIT_VERIFIER_ADDRESS");
        require(depositVerifier != address(0), "DEPOSIT_VERIFIER_ADDRESS=0");
        string memory tokensCsv = vm.envString("TOKEN_ADDRESSES");

        vm.startBroadcast(pk);

        HonkVerifier transferVerifier = new HonkVerifier();
        WithdrawHonkVerifier withdrawVerifier = new WithdrawHonkVerifier();

        PoolRouter router = new PoolRouter(wrappedNative);

        bytes32 genesisRoot = bytes32(0);
        string[] memory parts = _splitCsv(tokensCsv);
        for (uint256 i = 0; i < parts.length; i++) {
            address token = vm.parseAddress(parts[i]);
            ShieldedPool pool = new ShieldedPool(
                token,
                address(transferVerifier),
                genesisRoot,
                address(withdrawVerifier),
                depositVerifier
            );
            pool.setRouter(address(router));
            router.setPool(token, address(pool));
            console2.log("token", token);
            console2.log("pool", address(pool));
        }

        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("HonkVerifier", address(transferVerifier));
        console2.log("WithdrawVerifier", address(withdrawVerifier));
        console2.log("DepositVerifier", depositVerifier);
        console2.log("PoolRouter", address(router));
        console2.log("wrappedNative", wrappedNative);
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

/// @notice Legacy single-pool deploy (USDC_ADDRESS). Requires DEPOSIT_VERIFIER_ADDRESS.
contract DeployPool is Script {
    function run() external returns (address verifierAddr, address withdrawVerifierAddr, address poolAddr) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address depositVerifier = vm.envAddress("DEPOSIT_VERIFIER_ADDRESS");
        require(depositVerifier != address(0), "DEPOSIT_VERIFIER_ADDRESS=0");

        vm.startBroadcast(pk);

        HonkVerifier verifier = new HonkVerifier();
        WithdrawHonkVerifier withdrawVerifier = new WithdrawHonkVerifier();
        bytes32 genesisRoot = bytes32(0);
        ShieldedPool pool =
            new ShieldedPool(usdc, address(verifier), genesisRoot, address(withdrawVerifier), depositVerifier);

        PoolRouter router = new PoolRouter(address(0));
        pool.setRouter(address(router));
        router.setPool(usdc, address(pool));

        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("stablecoin", usdc);
        console2.log("HonkVerifier", address(verifier));
        console2.log("WithdrawVerifier", address(withdrawVerifier));
        console2.log("DepositVerifier", depositVerifier);
        console2.log("ShieldedPool", address(pool));
        console2.log("PoolRouter", address(router));

        return (address(verifier), address(withdrawVerifier), address(pool));
    }
}
