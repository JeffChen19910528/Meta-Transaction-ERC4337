const ethers = require('ethers');
const axios = require('axios');
const fs = require('fs');

async function main() {
    const RPC_URL = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const deployInfo = JSON.parse(fs.readFileSync('deploy.json'));

    const ENTRY_POINT_ADDRESS = deployInfo.entryPoint;
    const COUNTER_ADDRESS = deployInfo.counter;
    const SIMPLE_WALLET_ADDRESS = deployInfo.wallet;

    const counterIface = new ethers.Interface(["function increase()", "function decrease()"]);
    const walletIface = new ethers.Interface(["function execute(address target, bytes data)"]);

    const increaseData = counterIface.encodeFunctionData("increase");
    const decreaseData = counterIface.encodeFunctionData("decrease");

    const walletCallData = {
        increase: walletIface.encodeFunctionData("execute", [COUNTER_ADDRESS, increaseData]),
        decrease: walletIface.encodeFunctionData("execute", [COUNTER_ADDRESS, decreaseData])
    };

    const nonceStart = await provider.getTransactionCount(SIMPLE_WALLET_ADDRESS);

    const actions = [
        { action: "increase", fee: 10_000_000_000 },
        { action: "decrease", fee: 9_000_000_000 },
        { action: "decrease", fee: 8_000_000_000 },
        { action: "decrease", fee: 7_000_000_000 },
        { action: "decrease", fee: 8_000_000_000 }
    ];

    const baseUserOp = {
        sender: SIMPLE_WALLET_ADDRESS,
        initCode: "0x",
        callGasLimit: ethers.toBeHex(150000),
        verificationGasLimit: ethers.toBeHex(150000),
        preVerificationGas: ethers.toBeHex(20000),
        maxPriorityFeePerGas: ethers.toBeHex(1e9),
        paymasterAndData: "0x",
        signature: "0x"
    };

    // ✅ 模擬 meta_tx_id（可用 timestamp，也可使用 uuid）
    const meta_tx_id = Date.now(); // or use a random number

    for (let i = 0; i < actions.length; i++) {
        const { action, fee } = actions[i];
        const userOp = {
            ...baseUserOp,
            nonce: ethers.toBeHex(nonceStart + i),
            callData: walletCallData[action],
            maxFeePerGas: ethers.toBeHex(fee),

            // ✅ 加入 Meta-TX 相關欄位
            meta_tx_id: meta_tx_id,
            meta_tx_order_id: i,
            userOpsCount: actions.length
        };

        console.log(`📤 傳送 UserOp #${i} (${action}) fee=${fee} → meta_tx_order_id=${i}`);
        await axios.post("http://localhost:3000/", {
            jsonrpc: "2.0",
            id: i + 1,
            method: "eth_sendUserOperation",
            params: [userOp, ENTRY_POINT_ADDRESS]
        });
    }

    console.log("✅ 所有 UserOperation (Meta-TX) 已送出");
}

main().catch(console.error);
