// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal WETH-like token for router native tests.
contract MockWETH is ERC20 {
    constructor() ERC20("Wrapped Native", "WETH") {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 wad) external {
        _burn(msg.sender, wad);
        (bool ok,) = msg.sender.call{value: wad}("");
        require(ok, "withdraw failed");
    }

    receive() external payable {
        _mint(msg.sender, msg.value);
    }
}
