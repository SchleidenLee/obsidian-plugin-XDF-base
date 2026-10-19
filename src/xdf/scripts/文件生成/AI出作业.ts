/**
 * 两段式脚本：AI 出作业
 * 释放到 00.SYSTEM/xdf_base/scripts/文件生成/AI出作业.js
 *
 * collect 只读 / execute 唯一写盘 / entry 为 QuickAdd 入口
 */

export const PANEL_HOMEWORK_AI_SCRIPT = String.raw`/**
 * XDF 脚本 · AI 出作业
 *
 * 释放路径：00.SYSTEM/xdf_base/scripts/文件生成/AI出作业.js
 * collect：只读扫描 + ctx.ask 取输入
 * execute：只从 params 取输入，唯一写盘处
 * entry  ：QuickAdd 原生入口（载入共享 runtime，顺序跑 collect → execute）
 */
const RUNTIME_PATH = "00.SYSTEM/xdf_base/utils/XdfRuntime.js";
const HOMEWORK_TYPE_OPTIONS = ["入门测", "作业"];
const HOMEWORK_TYPE_LABELS = ["入门测 (15-20分钟)", "作业 (30+分钟)"];
const VOCAB_LEVELS = ["不掺入", "A1", "A2", "B1", "B2", "C1"];

function loadRuntime() {
    return app.vault.adapter.read(RUNTIME_PATH).then(function (code) {
        const mod = { exports: {} };
        new Function("module", "exports", "app", code)(mod, mod.exports, app);
        return mod.exports;
    });
}

function getApi(ctx) {
    const plugins = ctx.app.plugins.plugins;
    const p = plugins["xdf-base"] || plugins.quickadd;
    return (p && p.api) || null;
}

const MOD = {
    meta: { title: "AI 出作业" },

    // 第一阶段：只收集，不写盘
    collect: async (ctx) => {
        const api = getApi(ctx);

        // 检查 AI 是否启用
        if (!api || !api.ai) {
            ctx.notice("⚠️ AI 功能未启用，请在 XDF Base 设置里检查");
            return {};
        }

        // 1. 收集配置
        const homeworkType = await ctx.ask({
            id: "homeworkType",
            label: "作业类型",
            type: "suggester",
            options: HOMEWORK_TYPE_OPTIONS,
            displayOptions: HOMEWORK_TYPE_LABELS
        });
        if (!homeworkType) return {};

        const vocabLevel = await ctx.ask({
            id: "vocabLevel",
            label: "词汇等级",
            type: "suggester",
            options: VOCAB_LEVELS,
            displayOptions: VOCAB_LEVELS
        });
        if (!vocabLevel) return { homeworkType: homeworkType };

        const ratio = await ctx.ask({
            id: "ratio",
            label: "掺入比例（0-100）",
            type: "text",
            placeholder: "20"
        });

        const extraPoints = await ctx.ask({
            id: "extraPoints",
            label: "补充考察点（可空）",
            type: "text"
        });

        // 2. 只读检查当前笔记（真正读取在 execute）
        const file = ctx.app.workspace.getActiveFile();
        if (!file) {
            ctx.notice("⚠️ 请先打开一个笔记");
        }

        return {
            homeworkType: homeworkType,
            vocabLevel: vocabLevel,
            ratio: ratio,
            extraPoints: extraPoints
        };
    },

    // 第二阶段：只干活，禁 ask
    execute: async (params, ctx) => {
        try {
            const api = getApi(ctx);

            // 检查 AI 是否启用
            if (!api || !api.ai) {
                ctx.notice("⚠️ AI 功能未启用，请在 XDF Base 设置里检查");
                return;
            }

            // 1. 收集配置
            const homeworkType = params.homeworkType;
            if (!homeworkType) return;

            const vocabLevel = params.vocabLevel;
            if (!vocabLevel) return;

            const ratio = params.ratio;
            const extraPoints = params.extraPoints;

            // 2. 读当前笔记
            const file = ctx.app.workspace.getActiveFile();
            if (!file) {
                ctx.notice("⚠️ 请先打开一个笔记");
                return;
            }
            const noteContent = await ctx.app.vault.read(file);

            // 3. 构造 prompt
            // 注意：ai.prompt 的第一个参数是字符串（作为 user 消息），
            // system 角色走 settings.systemPrompt，不能传 messages 数组
            const systemPrompt = "你是一位经验丰富的英语教师，擅长根据课堂笔记出题。";
            const prompt = "# 课堂笔记\n" + noteContent + "\n\n# 作业类型\n" + homeworkType + "\n\n# 词汇等级\n" + vocabLevel + "\n\n# 掺入比例\n" + ratio + "%\n\n# 补充考察点\n" + extraPoints + "\n\n请按 markdown 格式输出作业题单。完整的三阶段流水线实现待后续填充。\n";

            // 4. 调 AI（模型在 XDF-Base 设置里统一配置，脚本不关心）
            const result = await api.ai.prompt(prompt, undefined, {
                systemPrompt,
                modelOptions: { temperature: 0.7 }
            });

            if (!result || !result.output) {
                ctx.notice("❌ AI 调用失败");
                return;
            }

            // 5. 覆盖当前文件
            await ctx.app.vault.modify(file, result.output);
            ctx.notice("✅ 作业已生成");

        } catch (err) {
            console.error("HomeworkAI Error:", err);
            ctx.notice("❌ 出题失败：" + err.message);
        }
    }
};

// QuickAdd 原生入口：同一份 collect / execute，换 native asker 顺序跑
MOD.entry = async function () {
    const R = await loadRuntime();
    return R.run(MOD);
};

module.exports = MOD;
`;
