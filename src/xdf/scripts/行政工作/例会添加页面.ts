/**
 * 两段式脚本：例会添加页面
 * 释放到 00.SYSTEM/xdf_base/scripts/行政工作/例会添加页面.js
 *
 * collect 只读 / execute 唯一写盘 / entry 为 QuickAdd 入口
 */

export const PANEL_MEETING_ADD_PAGE_SCRIPT = String.raw`/**
 * XDF 脚本 · 例会添加页面
 *
 * collect：只读扫描例会首页 + ctx.ask 取输入
 * execute ：只从 params 取输入，唯一写盘处
 * entry   ：QuickAdd 原生入口（载入共享 runtime，顺序跑 collect → execute）
 */
const RUNTIME_PATH = "00.SYSTEM/xdf_base/utils/XdfRuntime.js";

function loadRuntime() {
    return app.vault.adapter.read(RUNTIME_PATH).then(function (code) {
        const mod = { exports: {} };
        new Function("module", "exports", "app", code)(mod, mod.exports, app);
        return mod.exports;
    });
}

const PAGES = {
    赛课: ["🏆", ["参赛人", "课题", "评分记录", "结果与点评"]],
    展课: ["📢", ["展示人", "课程与班次", "观摩反馈"]],
    述职: ["📊", ["述职人", "考核周期", "内容纪要", "结果"]],
    分享: ["💡", ["分享人", "主题", "纪要"]],
    总结汇报: ["📈", ["汇报范围", "数据汇总", "纪要"]],
};

const MOD = {
    meta: { title: "例会添加页面" },

    // 第一阶段：只收集
    collect: async (ctx) => {
        const fs = ctx.app.plugins.plugins["xdf-base"].settings.folderStructure;
        const ROOT = ((fs && fs.admin) || "Admin") + "/周例会";

        // ---------- 选择例会（只读扫描，与原脚本一致） ----------
        const meetingFiles = ctx.app.vault
            .getMarkdownFiles()
            .filter(function (f) { return f.path.startsWith(ROOT + "/"); })
            .filter(function (f) {
                const parts = f.path.split("/");
                if (parts.length !== 6) return false;
                const folder = parts[4];
                const stem = parts[5].replace(/\.md$/, "");
                return folder === stem && /第\d+次例会$/.test(folder);
            })
            .sort()
            .reverse();

        if (meetingFiles.length === 0) {
            ctx.notice("⚠️ 没有任何例会，请先运行「周例会记录」");
            return {};
        }

        const meetingPaths = meetingFiles.map(function (f) { return f.path; });
        const meetingLabels = meetingFiles.map(function (f) {
            const parts = f.path.split("/");
            return parts[2] + " / " + parts[3] + " / " + parts[4];
        });

        const meeting = await ctx.ask({
            id: "meeting",
            label: "选择例会",
            type: "suggester",
            options: meetingPaths,
            displayOptions: meetingLabels
        });
        if (!meeting) return { meeting: "" };

        // ---------- 选择页面类型 ----------
        const type = await ctx.ask({
            id: "pageType",
            label: "页面类型",
            type: "suggester",
            options: Object.keys(PAGES),
            displayOptions: Object.keys(PAGES)
        });

        return { meeting: meeting, pageType: type || "" };
    },

    // 第二阶段：只干活
    execute: async (params, ctx) => {
        // params 无 meeting 键 = collect 扫描不到候选（原脚本同名提示后中止）
        if (params.meeting === undefined) {
            ctx.notice("⚠️ 没有任何例会，请先运行「周例会记录」");
            return;
        }

        const homePath = String(params.meeting || "");
        if (!homePath) return;

        const homeFile = ctx.app.vault.getAbstractFileByPath(homePath);
        if (!homeFile || !homeFile.parent) {
            ctx.notice("⚠️ 没有任何例会，请先运行「周例会记录」");
            return;
        }

        const type = String(params.pageType || "");
        if (!type) return;

        const meetingFolder = homeFile.parent;
        const meetingName = meetingFolder.name;
        const dateStr = meetingName.slice(0, 10);
        const meetingNumber = Number(meetingName.match(/第(\d+)次例会/)[1]);

        const pageInfo = PAGES[type];
        const emoji = pageInfo[0];
        const sections = pageInfo[1];

        // ---------- 生成页面 ----------
        const pagePath = meetingFolder.path + "/" + type + ".md";
        if (ctx.app.vault.getAbstractFileByPath(pagePath)) {
            ctx.notice("⚠️ 页面已存在：" + meetingName + "/" + type + ".md");
            return;
        }

        const content = [
            "---",
            "date: " + dateStr,
            "meeting_number: " + meetingNumber,
            "type: " + type,
            "tags:",
            '  - "#行政"',
            '  - "#周例会"',
            "---",
            "",
            ...sections.flatMap(function (s) { return ["## " + s, "", ""]; }),
        ].join("\n");
        await ctx.app.vault.create(pagePath, content);

        // ---------- 首页文件清单追加链接 ----------
        const linkLine = "- [[" + type + "|" + emoji + " " + type + "]]";
        await ctx.app.vault.process(homeFile, function (text) {
            if (text.includes(linkLine)) return text;
            const idx = text.indexOf("## ✅ 待办");
            if (idx === -1) return text.trimEnd() + "\n" + linkLine + "\n";
            return text.slice(0, idx) + linkLine + "\n\n" + text.slice(idx);
        });

        ctx.notice("✅ 已添加：" + meetingName + "/" + type + ".md");
    }
};

// QuickAdd 原生入口：同一份 collect / execute，换 native asker 顺序跑
MOD.entry = async function () {
    const R = await loadRuntime();
    return R.run(MOD);
};

module.exports = MOD;
`;
