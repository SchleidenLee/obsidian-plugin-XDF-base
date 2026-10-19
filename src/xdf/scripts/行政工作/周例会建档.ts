/**
 * 两段式脚本：周例会建档
 * 释放到 00.SYSTEM/xdf_base/scripts/行政工作/周例会建档.js
 *
 * collect 只读 / execute 唯一写盘 / entry 为 QuickAdd 入口
 */

export const PANEL_MEETING_SETUP_SCRIPT = String.raw`/**
 * XDF 脚本 · 周例会建档
 *
 * 释放路径：00.SYSTEM/xdf_base/scripts/行政工作/周例会建档.js
 *
 * 创建半年度导航页 + 同步创建「总结会」（每学期第一次会议）
 * 财年规则：每年 7 月开始新财年（FY27 = 2026-07 ~ 2027-06）
 *   - Section 1 = 秋季（7~12月）；Section 2 = 春季（1~6月）
 *
 * collect：只读扫描 + ctx.ask 取输入
 * execute：只从 params 取输入，唯一写盘处
 * entry  ：QuickAdd 原生入口（载入共享 runtime，顺序跑 collect → execute）
 */
const RUNTIME_PATH = "00.SYSTEM/xdf_base/utils/XdfRuntime.js";

function loadRuntime() {
    return app.vault.adapter.read(RUNTIME_PATH).then(function (code) {
        const mod = { exports: {} };
        new Function("module", "exports", "app", code)(mod, mod.exports, app);
        return mod.exports;
    });
}

function rootPath(ctx) {
    const fs = ctx.app.plugins.plugins["xdf-base"].settings.folderStructure;
    return ((fs && fs.admin) || "Admin") + "/周例会";
}

function deriveFiscalYear(d) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return m >= 7 ? y + 1 : y;
}
function fyLabel(year) {
    return "FY" + String(year % 100).padStart(2, "0");
}
function parseFy(fyStr) {
    return { startYear: 2000 + Number(fyStr.slice(2)) };
}
function fmtDate(d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function nextThursday() {
    const d = new Date();
    const delta = (4 - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + delta);
    return d;
}

const MOD = {
    meta: { title: "周例会建档" },

    // 第一阶段：只收集，不写盘
    collect: async (ctx) => {
        const ROOT = rootPath(ctx);

        // ---------- 输入 ----------
        const now = new Date();
        const defaultFy = fyLabel(deriveFiscalYear(now));
        const defaultSeason = now.getMonth() + 1 >= 7 ? "秋季" : "春季";

        const fy = await ctx.ask({
            id: "fy",
            label: "财年（每年7月开始新财年）",
            type: "text",
            placeholder: defaultFy,
            defaultValue: defaultFy
        });
        if (!fy) return {};

        const season = await ctx.ask({
            id: "season",
            label: "选择半年周期（默认 " + defaultSeason + "）",
            type: "suggester",
            options: ["秋季", "春季"],
            displayOptions: ["秋季（7~12月）= Section 1", "春季（1~6月）= Section 2"]
        });
        if (!season) return { fy: fy };

        // ---------- 路径（只读预判，写盘在 execute） ----------
        const { startYear } = parseFy(fy);
        const calendarYear = season === "秋季" ? startYear : startYear + 1;
        const seasonFolderName = calendarYear + season;
        const seasonFolder = ROOT + "/" + fy + "/" + seasonFolderName;
        const navPath = seasonFolder + "/" + seasonFolderName + ".md";

        // 导航页已存在：原脚本「提示 + 直接返回」，不再问总结会日期
        if (ctx.app.vault.getAbstractFileByPath(navPath)) {
            return { fy: fy, season: season };
        }

        const summaryDate = await ctx.ask({
            id: "summaryDate",
            label: "总结会日期（默认下个周四）",
            type: "date",
            dateFormat: "YYYY-MM-DD",
            defaultValue: fmtDate(nextThursday())
        });

        return { fy: fy, season: season, summaryDate: summaryDate || "" };
    },

    // 第二阶段：只干活，禁 ask
    execute: async (params, ctx) => {
        const ROOT = rootPath(ctx);

        const fy = params.fy;
        if (!fy) return;

        const season = params.season;
        if (!season) return;

        // ---------- 路径 ----------
        const { startYear } = parseFy(fy);
        const section = season === "秋季" ? 1 : 2;
        const calendarYear = season === "秋季" ? startYear : startYear + 1;
        const seasonFolderName = calendarYear + season;
        const seasonFolder = ROOT + "/" + fy + "/" + seasonFolderName;
        const navPath = seasonFolder + "/" + seasonFolderName + ".md";

        try {
            for (const dir of [ROOT, ROOT + "/" + fy, seasonFolder]) {
                if (!ctx.app.vault.getAbstractFileByPath(dir)) await ctx.app.vault.createFolder(dir);
            }
        } catch (e) {
            ctx.notice("❌ 创建文件夹失败：" + e);
            return;
        }

        if (ctx.app.vault.getAbstractFileByPath(navPath)) {
            ctx.notice("⚠️ 导航页已存在：" + navPath);
            return;
        }

        const content = [
            "---",
            "fiscal_year: " + fy,
            "section: " + section,
            "starting_date: " + (season === "秋季" ? startYear + "-07-01" : (startYear + 1) + "-01-01"),
            "ending_date: " + (season === "秋季" ? startYear + "-12-31" : (startYear + 1) + "-06-30"),
            "tags:",
            '  - "#行政"',
            '  - "#周例会"',
            "---",
            "",
            "## 📌 本学期任务与侧重点",
            "",
            "",
            "## 📚 会议索引",
            "",
        ].join("\n");

        try {
            await ctx.app.vault.create(navPath, content);
            ctx.notice("✅ 周例会导航页已创建：" + navPath);
        } catch (err) {
            ctx.notice("❌ 创建失败：" + err);
        }

        // ---------- 同步创建「总结会」 ----------
        const summaryDate = params.summaryDate;
        if (!summaryDate) return;

        const summaryFolderName = summaryDate + " 总结会";
        const summaryFolderPath = seasonFolder + "/" + summaryFolderName;
        const summaryHomePath = summaryFolderPath + "/" + summaryFolderName + ".md";

        if (ctx.app.vault.getAbstractFileByPath(summaryHomePath)) {
            ctx.notice("⚠️ 总结会已存在：" + summaryFolderName);
            return;
        }

        try {
            await ctx.app.vault.createFolder(summaryFolderPath);
        } catch (e) {
            ctx.notice("❌ 创建总结会文件夹失败：" + e);
            return;
        }

        // 首页
        const summaryHome = [
            "---",
            "date: " + summaryDate,
            "meeting_number: 1",
            "fiscal_year: " + fy,
            "section: " + section,
            "tags:",
            '  - "#行政"',
            '  - "#周例会"',
            '  - "#总结会"',
            "---",
            "",
            "## 📂 本次会议文件",
            "",
            "- [[会议记录|📋 会议记录]]",
            "- [[教研笔记|🔬 教研笔记]]",
            "",
            "## ✅ 待办",
            "",
            "- [ ] 发送周报到钉钉",
            "",
            "## 📝 备注",
            "",
        ].join("\n");
        await ctx.app.vault.create(summaryHomePath, summaryHome);

        // 会议记录
        const summaryRecord = [
            "---",
            "date: " + summaryDate,
            "meeting_number: 1",
            "tags:",
            '  - "#行政"',
            '  - "#周例会"',
            '  - "#总结会"',
            "---",
            "",
            "## 本周工作",
            "",
            "",
            "## 学生情况",
            "",
            "",
            "## 问题与协调",
            "",
            "",
            "## 下周计划",
            "",
        ].join("\n");
        await ctx.app.vault.create(summaryFolderPath + "/会议记录.md", summaryRecord);

        // 教研笔记
        const summaryResearch = [
            "---",
            "date: " + summaryDate,
            "meeting_number: 1",
            "tags:",
            '  - "#教研"',
            '  - "#周例会"',
            '  - "#总结会"',
            "---",
            "",
            "## 主题",
            "",
            "",
            "## 内容纪要",
            "",
            "",
            "## 要点总结",
            "",
        ].join("\n");
        await ctx.app.vault.create(summaryFolderPath + "/教研笔记.md", summaryResearch);

        // 导航页追加索引
        const summaryIndexLine = "- [[" + seasonFolderName + "/" + summaryFolderName + "|📅 总结会 · " + summaryDate.slice(5) + "]]";
        await ctx.app.vault.process(navPath, (text) => {
            if (text.includes(summaryIndexLine)) return text;
            return text.trimEnd() + "\n" + summaryIndexLine + "\n";
        });

        ctx.notice("✅ 导航页 + 总结会已创建：" + summaryFolderName);
    }
};

// QuickAdd 原生入口：同一份 collect / execute，换 native asker 顺序跑
MOD.entry = async function () {
    const R = await loadRuntime();
    return R.run(MOD);
};

module.exports = MOD;
`;
