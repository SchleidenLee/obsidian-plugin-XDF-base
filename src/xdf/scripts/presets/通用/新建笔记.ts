/**
 * 两段式脚本：新建笔记
 * 释放到 00.SYSTEM/xdf_base/scripts/presets/通用/新建笔记.js
 *
 * 解耦要点：不依赖全局 app / Notice，一切经 ctx 通道。
 */

export const PANEL_NEW_NOTE_SCRIPT = String.raw`/**
 * XDF 脚本 · 新建笔记
 *
 * collect：只读扫描目录 + 经 ctx.ask 取输入
 * execute：只从 params 取输入，唯一写盘处
 * entry  ：QuickAdd 原生入口（载入共享 runtime，顺序跑 collect → execute）
 */
const RUNTIME_PATH = "00.SYSTEM/xdf_base/scripts/assets/XdfRuntime.js";

function loadRuntime() {
    return app.vault.adapter.read(RUNTIME_PATH).then(function (code) {
        const mod = { exports: {} };
        new Function("module", "exports", "app", code)(mod, mod.exports, app);
        return mod.exports;
    });
}

const MOD = {
    meta: { title: "新建笔记" },

    // 第一阶段：只收集
    collect: async (ctx) => {
        const folders = ctx.app.vault.getAllLoadedFiles()
            .filter(function (f) { return f.children; })
            .map(function (f) { return f.path; })
            .filter(function (p) { return p !== ""; })
            .sort();
        const folderOptions = ["(根目录)"].concat(folders);

        const folder = await ctx.ask({
            id: "folder",
            label: "存放位置",
            type: "suggester",
            options: folderOptions,
            defaultValue: "(根目录)"
        });

        const title = await ctx.ask({
            id: "title",
            label: "笔记标题",
            type: "text",
            placeholder: "输入标题（不含 .md）"
        });

        return {
            folder: !folder || folder === "(根目录)" ? "" : folder,
            title: (title || "").trim()
        };
    },

    // 第二阶段：只干活
    execute: async (params, ctx) => {
        const title = String(params.title || "").trim();
        if (!title) {
            ctx.notice("❌ 请先填写笔记标题");
            return;
        }

        const dir = params.folder || "";
        if (dir && !ctx.app.vault.getAbstractFileByPath(dir)) {
            await ctx.app.vault.createFolder(dir);
        }

        const path = dir ? dir + "/" + title + ".md" : title + ".md";
        if (ctx.app.vault.getAbstractFileByPath(path)) {
            ctx.notice("❌ 已存在同名笔记：" + path);
            return;
        }

        const file = await ctx.app.vault.create(path, "");
        await ctx.app.workspace.getLeaf(false).openFile(file);
        ctx.notice("✅ 已创建笔记：" + path);
    }
};

// QuickAdd 原生入口：同一份 collect / execute，换 native asker 顺序跑
MOD.entry = async function () {
    const R = await loadRuntime();
    return R.run(MOD);
};

module.exports = MOD;
`;
