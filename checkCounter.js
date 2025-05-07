const ethers = require('ethers');
const fs = require('fs');

async function main() {
    const RPC_URL = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    const deployInfo = JSON.parse(fs.readFileSync('deploy.json'));
    const COUNTER_ADDRESS = deployInfo.counter;
    const ENTRY_POINT_ADDRESS = deployInfo.entryPoint;

    const counterABI = [
        "function number() view returns (uint256)"
    ];

    const entryPointABI = [
        "event UserOpHandled(address indexed sender, bool success, string reason)",
        "event DebugMetaOrder(address sender, uint256 meta_tx_order_id, uint256 meta_tx_id)"
    ];

    const counter = new ethers.Contract(COUNTER_ADDRESS, counterABI, provider);
    const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointABI, provider);

    const value = await counter.number();
    console.log("📈 Counter 現在的數值是:", value.toString());

    const latest = await provider.getBlockNumber();
    const startBlock = Math.max(0, latest - 1000);

    console.log("\n🔍 UserOpHandled 事件:");
    const userOpLogs = await entryPoint.queryFilter("UserOpHandled", startBlock, latest);
    if (userOpLogs.length === 0) {
        console.log("⚠️ 沒有找到 UserOpHandled 事件");
    } else {
        for (const log of userOpLogs) {
            const { sender, success, reason } = log.args;
            console.log(`📣 sender=${sender}, 成功=${success}, 原因=${reason}`);
        }
    }

    console.log("\n🔍 DebugMetaOrder 事件（執行順序 + meta_tx_id）:");
    const orderLogs = await entryPoint.queryFilter("DebugMetaOrder", startBlock, latest);
    if (orderLogs.length === 0) {
        console.log("⚠️ 沒有找到 DebugMetaOrder 事件");
    } else {
        for (const log of orderLogs) {
            const { sender, meta_tx_order_id, meta_tx_id } = log.args;
            console.log(`🔢 sender=${sender}, meta_tx_order_id=${meta_tx_order_id.toString()}, meta_tx_id=${meta_tx_id.toString()}`);
        }
    }
}

main().catch(console.error);
