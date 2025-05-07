// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleWallet {
    address public owner;
    address public entryPoint;

    uint256 public nonce;

    constructor(address _owner, address _entryPoint) {
        owner = _owner;
        entryPoint = _entryPoint;
    }

    function validateUserOp(
        bytes calldata, 
        bytes32, 
        uint256 userOpNonce
    ) external returns (uint256 validUntil, uint256 validAfter) {
        require(msg.sender == entryPoint, "Caller not EntryPoint");
        require(userOpNonce == nonce, "Invalid nonce");
        nonce++;
        return (type(uint256).max, 0);
    }

    function execute(address target, bytes calldata data) external {
        require(msg.sender == owner || msg.sender == entryPoint, "Not authorized");
        (bool success, ) = target.call(data);
        require(success, "Call failed");
    }

    function deposit() external payable {}

    receive() external payable {}
}
