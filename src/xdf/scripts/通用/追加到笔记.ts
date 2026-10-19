/**
 * 两段式脚本：追加到笔记
 * 释放到 00.SYSTEM/xdf_base/scripts/通用/追加到笔记.js
 */

export const PANEL_APPEND_TO_NOTE_SCRIPT = String.raw`/**
 * XDF 脚本 · 追加到笔记
 *
 * entry：QuickAdd 原生入口（载入共享 runtime，顺序跑 collect → execute）
 */
const RUNTIME_PATH = "00.SYSTEM/xdf_base/utils/XdfRuntime.js";

function loadRuntime() {
    return app.vault.adapter.read(RUNTIME_PATH).then(function (code) {
        const mod = { exports: {} };
        new Function("module", "exports", "app", code)(mod, mod.exports, app);
        return mod.exports;
    });
}

const MOD = {
    meta: { title: "追加到笔记" },

    // 第一阶段：只收集
    collect: async (ctx) => {
        const targets = ctx.app.vault.getMarkdownFiles()
            .filter(function (f) { return f.path.indexOf(".trash") === -1; })
            .map(function (f) { return f.path; })
            .sort();

        const target = await ctx.ask({
            id: "target",
            label: "目标笔记",
            type: "suggester",
            options: targets,
            description: targets.length ? "共 " + targets.length + " 篇 Markdown" : "vault 中没有 Markdown 文件"
        });

        const content = await ctx.ask({
            id: "content",
            label: "追加内容",
            type: "textarea",
            placeholder: "将追加到笔记末尾"
        });

        return {
            target: target || "",
            content: content || ""
        };
    },

    // 第二阶段：只干活
    execute: async (params, ctx) => {
        const path = String(params.target || "");
        const content = String(params.content || "");
        if (!path) {
            ctx.notice("❌ 未选择目标笔记");
            return;
        }
        if (!content.trim()) {
            ctx.notice("❌ 追加内容为空");
            return;
        }

        const file = ctx.app.vault.getAbstractFileByPath(path);
        if (!file) {
            ctx.notice("❌ 找不到笔记：" + path);
            return;
        }

        const now = new Date();
        const pad = function (n) { return String(n).padStart(2, "0"); };
        const stamp = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate())
            + " " + pad(now.getHours()) + ":" + pad(now.getMinutes());

        await ctx.app.vault.append(file, "\n\n<!-- 追加于 " + stamp + " -->\n" + content + "\n");
        ctx.notice("✅ 已追加到：" + path);
    }
};

// QuickAdd 原生入口：同一份 collect / execute，换 native asker 顺序跑
MOD.entry = async function () {
    const R = await loadRuntime();
    return R.run(MOD);
};

module.exports = MOD;
`;
