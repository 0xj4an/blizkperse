pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "../circuits/target/Verifier.sol";
import "../contract/Starter.sol";

contract StarterScript is Script {
    Starter public starter;
    HonkVerifier public verifier;

    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("LOCALHOST_PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        verifier = new HonkVerifier();
        starter = new Starter(verifier);
    }
}
