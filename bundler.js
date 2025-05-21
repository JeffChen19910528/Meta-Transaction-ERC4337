// bundler.js with revert reason decoding and improved logging
const express = require('express');
const ethers = require('ethers');
const bodyParser = require('body-parser');
const fs = require('fs');

// === 讀取部署資訊 ===
const deployInfo = JSON.parse(fs.readFileSync('deploy.json'));
const ENTRY_POINT_ADDRESS = deployInfo.entryPoint;
const COUNTER_ADDRESS = deployInfo.counter;

const RPC_URL = "http://localhost:8545";
const PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const PORT = 3000;

// === ABI 定義 ===
const counterABI = [
    "function increase()",
    "function decrease()",
    "event NumberChanged(string action, uint256 newValue)"
];
const walletABI = ["function execute(address target, bytes data)"];
const entryPointABI = [
    `function handleOps(
        tuple(
            address sender,
            uint256 nonce,
            bytes initCode,
            bytes callData,
            uint256 callGasLimit,
            uint256 verificationGasLimit,
            uint256 preVerificationGas,
            uint256 maxFeePerGas,
            uint256 maxPriorityFeePerGas,
            bytes paymasterAndData,
            bytes signature,
            uint256 meta_tx_id,
            uint256 meta_tx_order_id,
            uint8 userOpsCount
        )[] ops,
        address beneficiary
    )`,
    "event UserOpHandled(address indexed sender, bool success, string reason)",
    "event MetaTransactionHandled(uint256 indexed meta_tx_id, bool success)"
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const counterInterface = new ethers.Interface(counterABI);
const walletInterface = new ethers.Interface(walletABI);
const entryPointInterface = new ethers.Interface(entryPointABI);

const app = express();
app.use(bodyParser.json());

let pendingUserOps = [];
let isHandling = false;

console.log("\uD83D\uDEE0\uFE0F Bundler 啟動中，使用 EntryPoint 地址:", ENTRY_POINT_ADDRESS);

app.post('/', async (req, res) => {
    const { method, params } = req.body;
    if (method !== 'eth_sendUserOperation') {
        return res.status(400).send({ error: 'Only eth_sendUserOperation is supported' });
    }

    const [userOp, entryPointAddr] = params;
    if (entryPointAddr.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase()) {
        console.error(`❌ EntryPoint mismatch！收到: ${entryPointAddr} 期待: ${ENTRY_POINT_ADDRESS}`);
        return res.status(400).send({ error: 'EntryPoint address mismatch' });
    }

    console.log("✅ 收到 UserOperation");
    pendingUserOps.push(userOp);
    res.send({ result: "UserOperation queued" });
});

function decodeRevertReason(error) {
    try {
        const hexData = error?.error?.data?.data ?? error?.error?.data;
        if (hexData && hexData.startsWith("0x08c379a0")) {
            const reasonHex = "0x" + hexData.slice(10);
            const reasonBytes = Buffer.from(reasonHex.slice(2), "hex");
            const reason = ethers.utils.defaultAbiCoder.decode(["string"], reasonBytes);
            return reason[0];
        }
    } catch (e) {
        return "Unable to decode revert reason";
    }
    return "Unknown error format";
}

setInterval(async () => {
    if (pendingUserOps.length === 0 || isHandling) return;
    isHandling = true;

    try {
        pendingUserOps.sort((a, b) => {
            const aFee = BigInt(a.maxFeePerGas);
            const bFee = BigInt(b.maxFeePerGas);
            return aFee > bFee ? -1 : aFee < bFee ? 1 : 0;
        });

        console.log("\uD83D\uDCDC 正在處理 UserOperations (按 maxFeePerGas 排序):");
        pendingUserOps.forEach((op, idx) => {
            try {
                const decoded = walletInterface.decodeFunctionData("execute", op.callData);
                const target = decoded.target;
                const innerData = decoded.data;
                let label = "unknown";
                if (target.toLowerCase() === COUNTER_ADDRESS.toLowerCase()) {
                    const parsed = counterInterface.parseTransaction({ data: innerData });
                    label = parsed.name;
                }
                console.log(`  #${idx} - nonce: ${parseInt(op.nonce)}, 呼叫: ${label}, maxFeePerGas: ${BigInt(op.maxFeePerGas)}`);
            } catch {
                console.log(`  #${idx} - nonce: ${parseInt(op.nonce)}, callData 無法解譯`);
            }
        });

        const userOpsArray = pendingUserOps.map(op => [
            op.sender,
            op.nonce,
            op.initCode,
            op.callData,
            op.callGasLimit,
            op.verificationGasLimit,
            op.preVerificationGas,
            op.maxFeePerGas,
            op.maxPriorityFeePerGas,
            op.paymasterAndData,
            op.signature,
            op.meta_tx_id,
            op.meta_tx_order_id,
            op.userOpsCount
        ]);

        const calldata = entryPointInterface.encodeFunctionData("handleOps", [userOpsArray, wallet.address]);

        const tx = await wallet.sendTransaction({
            to: ENTRY_POINT_ADDRESS,
            data: calldata,
            gasLimit: 3_000_000n
        });

        console.log(`📤 批次送出 ${pendingUserOps.length} 筆 UserOperation! txHash: ${tx.hash}`);
        const receipt = await tx.wait();

        for (const log of receipt.logs) {
            try {
                const parsed = counterInterface.parseLog(log);
                console.log(`📊 [Counter 事件] ${parsed.args.action}: ${parsed.args.newValue.toString()}`);
            } catch {}
            try {
                const parsed = entryPointInterface.parseLog(log);
                if (parsed.name === "UserOpHandled") {
                    console.log(`📣 [UserOpHandled] sender=${parsed.args.sender} 成功=${parsed.args.success} 原因=${parsed.args.reason}`);
                }
            } catch {}
        }

    } catch (err) {
        const reason = decodeRevertReason(err);
        console.warn(`⛔ 所有操作回滾，錯誤原因: ${reason}`);
    } finally {
        console.log(`🧹 清空 pendingUserOps (${pendingUserOps.length} 筆)`);
        pendingUserOps = [];
        isHandling = false;
    }
}, 3000);

app.listen(PORT, () => {
    console.log(`🚀 Bundler server listening at http://localhost:${PORT}`);
});