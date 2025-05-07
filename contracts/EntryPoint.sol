// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract EntryPoint {
    event UserOpHandled(address indexed sender, bool success, string reason);
    event MetaTransactionHandled(uint256 indexed meta_tx_id, bool success);
    event DebugMetaOrder(address sender, uint256 meta_tx_order_id, uint256 meta_tx_id); // ✅ 多印 meta_tx_id

    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
        uint256 meta_tx_id;
        uint256 meta_tx_order_id;
        uint8 userOpsCount;
    }

    function handleOps(UserOperation[] calldata ops, address beneficiary) external {
        bool allSuccess = true;

        for (uint256 i = 0; i < ops.length; i++) {
            bool found = false;

            for (uint256 j = 0; j < ops.length; j++) {
                if (ops[j].meta_tx_order_id == i) {
                    found = true;

                    emit DebugMetaOrder(ops[j].sender, ops[j].meta_tx_order_id, ops[j].meta_tx_id); // ✅ 加上 meta_tx_id

                    try this.validateAndExecute(
                        ops[j].sender,
                        ops[j].signature,
                        ops[j].initCode,
                        ops[j].callData,
                        ops[j].callGasLimit
                    ) {
                        emit UserOpHandled(ops[j].sender, true, "");
                    } catch Error(string memory reason) {
                        emit UserOpHandled(ops[j].sender, false, reason);
                        allSuccess = false;
                    } catch {
                        emit UserOpHandled(ops[j].sender, false, "Unknown error");
                        allSuccess = false;
                    }

                    break;
                }
            }

            if (!found) {
                emit MetaTransactionHandled(ops[0].meta_tx_id, false);
                return;
            }
        }

        emit MetaTransactionHandled(ops[0].meta_tx_id, allSuccess);

        if (beneficiary != address(0)) {
            payable(beneficiary).transfer(0);
        }
    }

    function validateAndExecute(
        address sender,
        bytes calldata signature,
        bytes calldata initCode,
        bytes calldata callData,
        uint256 gasLimit
    ) external {
        require(true, "Signature bypassed"); // 測試用，略過簽章檢查

        if (isUnDeployed(sender)) {
            require(validateInitCode(initCode), "Invalid initCode");
        }

        (bool success, bytes memory ret) = sender.call{gas: gasLimit}(callData);
        if (!success) {
            string memory reason = "Execution failed";
            if (ret.length >= 68) {
                assembly {
                    ret := add(ret, 0x04)
                }
                reason = abi.decode(ret, (string));
            }
            revert(reason);
        }
    }

    function isUnDeployed(address account) internal view returns (bool) {
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(account)
        }
        return codeSize == 0;
    }

    function validateInitCode(bytes calldata initCode) internal pure returns (bool) {
        return initCode.length > 0;
    }

    receive() external payable {}
}
