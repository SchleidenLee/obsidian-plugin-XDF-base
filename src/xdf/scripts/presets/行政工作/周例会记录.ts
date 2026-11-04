/**
 * 两段式脚本：周例会记录
 * 释放到 00.SYSTEM/xdf_base/scripts/presets/行政工作/周例会记录.js
 *
 * collect 只读 / execute 唯一写盘 / entry 为 QuickAdd 入口
 */

export const PANEL_MEETING_RECORD_SCRIPT = String.raw`/**
 * XDF 脚本 · 周例会记录
 *
 * collect：只读扫描半年度导航页 + ctx.ask 取输入
 * execute：只从 params 取输入，唯一写盘处
 * entry  ：QuickAdd 原生入口（载入共享 runtime，顺序跑 collect → execute）
 */
const RUNTIME_PATH = "00.SYSTEM/xdf_base/scripts/assets/XdfRuntime.js";
const UTILS_PATH = "00.SYSTEM/xdf_base/scripts/assets/ArchiveUtils.js";

function loadRuntime() {
    return app.vault.adapter.read(RUNTIME_PATH).then(function (code) {
        const mod = { exports: {} };
        new Function("module", "exports", "app", code)(mod, mod.exports, app);
        return mod.exports;
    });
}

function loadUtils(ctx) {
    return ctx.app.vault.adapter.read(UTILS_PATH).then(function (code) {
        const mod = { exports: {} };
        new Function("module", "exports", "app", code)(mod, mod.exports, ctx.app);
        return mod.exports;
    });
}

function nextThursday() {
    const d = new Date();
    const delta = (4 - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + delta);
    return d;
}

function fmtDate(d) {
    const p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

const MOD = {
    meta: { title: "周例会记录" },

    // 第一阶段：只收集
    collect: async (ctx) => {
        const fs = ctx.app.plugins.plugins["xdf-base"].settings.folderStructure;
        const ROOT = ((fs && fs.admin) || "Admin") + "/周例会";

        // ---------- 选择半年度导航页（只读扫描，与原脚本一致） ----------
        const navCandidates = ctx.app.vault
            .getMarkdownFiles()
            .filter(function (f) { return f.path.startsWith(ROOT + "/"); })
            .filter(function (f) {
                const parts = f.path.split("/");
                if (parts.length !== 5) return false;
                const folder = parts[3];
                const stem = parts[4].replace(/\.md$/, "");
                return folder === stem && /(秋季|春季)$/.test(stem);
            })
            .sort()
            .reverse();

        if (navCandidates.length === 0) {
            ctx.notice("⚠️ 没有任何半年度导航页，请先运行「周例会建档」");
            return {};
        }

        const navPaths = navCandidates.map(function (f) { return f.path; });
        const navLabels = navCandidates.map(function (f) {
            const parts = f.path.split("/");
            return parts[2] + " / " + parts[3];
        });

        const nav = await ctx.ask({
            id: "nav",
            label: "选择半年度",
            type: "suggester",
            options: navPaths,
            displayOptions: navLabels
        });
        if (!nav) return { nav: "" };

        // ---------- 会议日期 ----------
        const date = await ctx.ask({
            id: "date",
            label: "会议日期（周四）",
            type: "date",
            dateFormat: "YYYY-MM-DD",
            defaultValue: fmtDate(nextThursday())
        });

        return { nav: nav, date: date || "" };
    },

    // 第二阶段：只干活
    execute: async (params, ctx) => {
        // params 无 nav 键 = collect 扫描不到候选（原脚本同名提示后中止）
        if (params.nav === undefined) {
            ctx.notice("⚠️ 没有任何半年度导航页，请先运行「周例会建档」");
            return;
        }

        const navPath = String(params.nav || "");
        if (!navPath) return;

        const navFile = ctx.app.vault.getAbstractFileByPath(navPath);
        if (!navFile || !navFile.parent || !navFile.parent.parent) {
            ctx.notice("⚠️ 没有任何半年度导航页，请先运行「周例会建档」");
            return;
        }

        const dateStr = String(params.date || "");
        if (!dateStr) return;

        // frontmatter 用带时间的 ISO（15:30 例会时间，+08:00 本地）；文件夹名只带日期
        const dtISO = dateStr + "T15:30:00+08:00";

        const U = await loadUtils(ctx);

        const seasonFolder = navFile.parent.path;
        const seasonFolderName = navFile.parent.name;
        const fy = navFile.parent.parent.name;
        const season = seasonFolderName.endsWith("秋季") ? "秋季" : "春季";
        const section = season === "秋季" ? 1 : 2;

        const m = Number(dateStr.slice(5, 7));
        const calYear = Number(dateStr.slice(0, 4));
        const expectedFolder = calYear + (m >= 7 ? "秋季" : "春季");
        if (expectedFolder !== seasonFolderName) {
            ctx.notice("⚠️ 所选日期属于「" + expectedFolder + "」，但当前导航页是「" + seasonFolderName + "」，请确认");
        }

        // ---------- 第几次例会 ----------
        const seasonTFolder = ctx.app.vault.getAbstractFileByPath(seasonFolder);
        const existing = (seasonTFolder ? seasonTFolder.children : []).filter(function (c) {
            return /第(\d+)次例会$/.test(c.name);
        });
        const numbers = existing
            .map(function (c) { return Number(c.name.match(/第(\d+)次例会/)[1]); })
            .sort(function (a, b) { return b - a; });
        const meetingNumber = (numbers[0] || 0) + 1;

        // ---------- 生成三件套 ----------
        const folderName = dateStr + " 第" + meetingNumber + "次例会";
        const folderPath = seasonFolder + "/" + folderName;
        const homePath = folderPath + "/" + folderName + ".md";

        try {
            if (!ctx.app.vault.getAbstractFileByPath(folderPath)) {
                await ctx.app.vault.createFolder(folderPath);
            }
        } catch (e) {
            ctx.notice("❌ 创建文件夹失败：" + e);
            return;
        }

        if (ctx.app.vault.getAbstractFileByPath(homePath)) {
            ctx.notice("⚠️ 例会已存在：" + folderName);
            return;
        }

        // 首页（frontmatter 留代码；正文走模板）
        const tplVars = { fy: fy, seasonFolderName: seasonFolderName, date: dateStr, n: meetingNumber };
        const homeBody = U.loadTemplate(
            "行政工作/周例会/{fy}/{seasonFolderName}/{date} 第{n}次例会/首页.md", tplVars);
        const homeContent = [
            "---",
            "date: " + dtISO,
            "meeting_number: " + meetingNumber,
            "fiscal_year: " + fy,
            "section: " + section,
            "tags:",
            '  - "#行政"',
            '  - "#周例会"',
            "---",
            "",
            homeBody
        ].join("\n");
        await ctx.app.vault.create(homePath, homeContent);

        // 会议记录（frontmatter 留代码；正文走模板）
        const recordBody = U.loadTemplate(
            "行政工作/周例会/{fy}/{seasonFolderName}/{date} 第{n}次例会/会议记录.md", tplVars);
        const recordContent = [
            "---",
            "date: " + dtISO,
            "meeting_number: " + meetingNumber,
            "tags:",
            '  - "#行政"',
            '  - "#周例会"',
            "---",
            "",
            recordBody
        ].join("\n");
        await ctx.app.vault.create(folderPath + "/会议记录.md", recordContent);

        // 教研笔记（frontmatter 留代码；正文走模板）
        const researchBody = U.loadTemplate(
            "行政工作/周例会/{fy}/{seasonFolderName}/{date} 第{n}次例会/教研笔记.md", tplVars);
        const researchContent = [
            "---",
            "date: " + dtISO,
            "meeting_number: " + meetingNumber,
            "tags:",
            '  - "#教研"',
            '  - "#周例会"',
            "---",
            "",
            researchBody
        ].join("\n");
        await ctx.app.vault.create(folderPath + "/教研笔记.md", researchContent);

        // 导航页追加索引
        const indexLine = "- [[" + seasonFolderName + "/" + folderName + "|📅 第" + meetingNumber + "次例会 · " + dateStr.slice(5) + "]]";
        await ctx.app.vault.process(navFile, function (text) {
            if (text.includes(indexLine)) return text;
            return text.trimEnd() + "\n" + indexLine + "\n";
        });

        ctx.notice("✅ 例会已创建：" + folderName + "（含首页/会议记录/教研笔记）");
    }
};

// QuickAdd 原生入口：同一份 collect / execute，换 native asker 顺序跑
MOD.entry = async function () {
    const R = await loadRuntime();
    return R.run(MOD);
};

module.exports = MOD;
`;
