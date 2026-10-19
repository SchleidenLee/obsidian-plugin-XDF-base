/**
 * 两段式脚本：词表工具
 * 释放到 00.SYSTEM/xdf_base/scripts/文件生成/词表工具.js
 *
 * collect 只读 / execute 唯一写盘 / entry 为 QuickAdd 入口
 */

export const PANEL_WORDLIST_AI_SCRIPT = String.raw`/**
 * XDF 脚本 · 词表工具
 *
 * 释放路径：00.SYSTEM/xdf_base/scripts/文件生成/词表工具.js
 * 流程：读当前笔记 → AI 提取词条（JSON）→ JS 打乱 → 排 6 列 md 表格 → 覆盖笔记
 * 模式：整理词表（单词|词性|汉意）/ 生成默写表（词性、汉意留空）
 * 短语不填词性。
 * collect：只读扫描 + ctx.ask 取输入
 * execute：只从 params 取输入，唯一写盘处
 * entry  ：QuickAdd 原生入口（载入共享 runtime，顺序跑 collect → execute）
 */
const RUNTIME_PATH = "00.SYSTEM/xdf_base/utils/XdfRuntime.js";
const MODE_OPTIONS = ["dictation-false", "dictation-true"];
const MODE_LABELS = ["整理词表", "生成默写表"];

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
    meta: { title: "词表工具" },

    // 第一阶段：只收集，不写盘
    collect: async (ctx) => {
        const api = getApi(ctx);

        if (!api || !api.ai) {
            ctx.notice("⚠️ AI 功能未启用");
            return {};
        }

        // 1. 选模式
        const mode = await ctx.ask({
            id: "mode",
            label: "词表工具：选择生成模式",
            type: "suggester",
            options: MODE_OPTIONS,
            displayOptions: MODE_LABELS
        });
        if (!mode) return {};

        // 2. 只读检查当前笔记（真正读取在 execute）
        const file = ctx.app.workspace.getActiveFile();
        if (!file) {
            ctx.notice("⚠️ 请先打开一个笔记");
            return { mode: mode };
        }
        const noteContent = await ctx.app.vault.read(file);
        if (!noteContent.trim()) {
            ctx.notice("⚠️ 当前笔记是空的");
            return { mode: mode };
        }

        return { mode: mode };
    },

    // 第二阶段：只干活，禁 ask
    execute: async (params, ctx) => {
        try {
            const api = getApi(ctx);

            if (!api || !api.ai) {
                ctx.notice("⚠️ AI 功能未启用");
                return;
            }

            // 1. 选模式
            const mode = params.mode;
            if (!mode) return;
            const isDictation = mode === "dictation-true";

            // 2. 读当前笔记
            const file = ctx.app.workspace.getActiveFile();
            if (!file) {
                ctx.notice("⚠️ 请先打开一个笔记");
                return;
            }
            const noteContent = await ctx.app.vault.read(file);
            if (!noteContent.trim()) {
                ctx.notice("⚠️ 当前笔记是空的");
                return;
            }

            // 3. AI 提取词条 JSON
            ctx.notice("⏳ 正在提取词条…");
            const systemPrompt = "你是一位英语教师助手，擅长从课堂笔记中提取英语单词和短语。只输出 JSON，不要输出任何其他文字。";
            const prompt = "# 素材\n" + noteContent + "\n\n# 任务\n提取素材中所有值得学习的英语单词和短语，输出一个 JSON 数组，每个元素格式：\n" +
                '[{"word":"单词或短语","pos":"词性（如 n. / v. / adj.），短语留空字符串","meaning":"中文释义"}]\n' +
                "要求：\n- 只输出 JSON 数组，不要 markdown 代码块标记，不要解释\n- 按素材中出现顺序列出，不要去重不同义项\n- 短语的 pos 必须是空字符串\n";

            const result = await api.ai.prompt(prompt, undefined, {
                systemPrompt,
                modelOptions: { temperature: 0.2 }
            });

            if (!result || !result.output) {
                ctx.notice("❌ AI 调用失败");
                return;
            }

            // 4. 解析 JSON（容忍代码块包裹、前后杂文字）
            let entries;
            try {
                let text = result.output.trim();
                // 剥离代码块围栏（反引号用 charCode 构造，避免与模板字面量冲突）
                const BT = String.fromCharCode(96);
                const fenceStart = text.indexOf(BT);
                if (fenceStart !== -1) {
                    const firstNL = text.indexOf("\n", fenceStart);
                    const fenceEnd = text.lastIndexOf(BT);
                    if (firstNL !== -1 && fenceEnd > firstNL) text = text.slice(firstNL + 1, fenceEnd).trim();
                }
                const start = text.indexOf("[");
                const end = text.lastIndexOf("]");
                if (start === -1 || end === -1) throw new Error("未找到 JSON 数组");
                entries = JSON.parse(text.slice(start, end + 1));
            } catch (parseErr) {
                ctx.notice("❌ AI 返回内容无法解析为词条 JSON：" + parseErr.message);
                return;
            }

            if (!Array.isArray(entries) || entries.length === 0) {
                ctx.notice("❌ 未提取到任何单词或短语");
                return;
            }

            // 5. 打乱顺序（Fisher-Yates）
            for (let i = entries.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [entries[i], entries[j]] = [entries[j], entries[i]];
            }

            // 6. 排 6 列表格：|单词|词性|汉意|单词|词性|汉意|，每行两条
            const cell = (e) => {
                if (!e) return ["", "", ""];
                if (isDictation) return [e.word || "", "", ""];
                return [e.word || "", e.pos || "", e.meaning || ""];
            };
            const lines = ["| 单词 | 词性 | 汉意 | 单词 | 词性 | 汉意 |", "| --- | --- | --- | --- | --- | --- |"];
            for (let i = 0; i < entries.length; i += 2) {
                const a = cell(entries[i]);
                const b = cell(entries[i + 1]);
                lines.push("| " + a.join(" | ") + " | " + b.join(" | ") + " |");
            }

            // 7. 覆盖当前笔记
            await ctx.app.vault.modify(file, lines.join("\n") + "\n");
            ctx.notice("✅ 已生成" + (isDictation ? "默写表" : "词表") + "（" + entries.length + " 个词条）");

        } catch (err) {
            console.error("WordListAI Error:", err);
            ctx.notice("❌ 生成失败：" + err.message);
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
