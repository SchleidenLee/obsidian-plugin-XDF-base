/**
 * 两段式脚本：一对一建档
 * 释放到 00.SYSTEM/xdf_base/scripts/档案管理/一对一建档.js
 *
 * collect：只读扫描 + ctx.ask 取输入
 * execute：只从 params 取输入，唯一写盘处
 * entry  ：QuickAdd 原生入口（载入共享 runtime，顺序跑 collect → execute）
 */

export const PANEL_ARCHIVE_1ON1_CREATE_SCRIPT = String.raw`/**
 * XDF 脚本 · 一对一建档
 * 释放路径：00.SYSTEM/xdf_base/scripts/档案管理/一对一建档.js
 *
 * collect：只读扫描 + ctx.ask 取输入（不写盘）
 * execute：只从 params 取输入，唯一写盘处（禁止 ctx.ask / confirm）
 * entry  ：QuickAdd 原生入口（载入共享 runtime，顺序跑 collect → execute）
 */
const UTILS_PATH = "00.SYSTEM/xdf_base/utils/ArchiveUtils.js";
const RUNTIME_PATH = "00.SYSTEM/xdf_base/utils/XdfRuntime.js";

function loadUtils(ctx) {
    return ctx.app.vault.adapter.read(UTILS_PATH).then(function (code) {
        const mod = { exports: {} };
        new Function("module", "exports", "app", code)(mod, mod.exports, ctx.app);
        return mod.exports;
    });
}

function loadRuntime() {
    return app.vault.adapter.read(RUNTIME_PATH).then(function (code) {
        const mod = { exports: {} };
        new Function("module", "exports", "app", code)(mod, mod.exports, app);
        return mod.exports;
    });
}

// 复刻 ArchiveUtils.getAllFolders（只读扫描）
function getAllFolders(ctx) {
    return ctx.app.vault.getAllLoadedFiles()
        .filter(function (f) { return f.children; })
        .map(function (f) { return f.path; })
        .filter(function (p) { return p !== ""; })
        .sort();
}

// 复刻 ArchiveUtils.pickTargetFolder 所读的 folderStructure（只读）
function readFolderStructure(ctx) {
    var plugins = ctx.app.plugins.plugins;
    var xdfPlugin = plugins["xdf-base"] || plugins.quickadd;
    var fs = (xdfPlugin && xdfPlugin.settings && xdfPlugin.settings.folderStructure) || {};
    return {
        active: fs.active || "Current Class",
        archived: fs.archived || "Archived"
    };
}

// 复刻 ArchiveUtils.pickTargetFolder 的返回值解析（不弹窗）
function resolveTargetFolder(ctx, picked, pickedFull) {
    if (!picked) return null;
    if (picked === "其他...") {
        if (!pickedFull) return null;
        return pickedFull === "(根目录)" ? "" : pickedFull;
    }
    var fs = readFolderStructure(ctx);
    if (picked === fs.active + " (默认)") return fs.active;
    return picked;
}

// 复刻 ArchiveUtils.pickStartingDate 的日期归一化（不弹窗）
function normalizeStartingDate(U, d) {
    if (!d) return "";
    if (d instanceof Date) return U.formatDateStr(d);
    var s = String(d);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return U.formatDateStr(parsed);
    return s.substring(0, 10);
}

const MOD = {
    meta: { title: "一对一建档" },

    // 第一阶段：只收集，不写盘
    collect: async (ctx) => {
        const U = await loadUtils(ctx);

        const studentName = await ctx.ask({
            id: "studentName",
            label: "请输入学员姓名",
            type: "text"
        });
        if (!studentName && ctx.mode === "native") throw new Error("学员姓名不能为空");

        const startingDate = await ctx.ask({
            id: "startingDate",
            label: "请选择首课日期",
            type: "date",
            dateFormat: "YYYY-MM-DD"
        });
        if (!startingDate && ctx.mode === "native") throw new Error("首课日期不能为空");

        const scheduleType = await ctx.ask({
            id: "scheduleType",
            label: "请选择上课频率",
            type: "dropdown",
            options: U.SCHEDULE_TYPES,
            displayOptions: U.SCHEDULE_TYPES,
            defaultValue: U.SCHEDULE_TYPES[0]
        });
        if (!scheduleType && ctx.mode === "native") throw new Error("未选择上课频率");

        const courseType = await ctx.ask({
            id: "courseType",
            label: "请选择课程体系",
            type: "dropdown",
            options: U.COURSE_TYPES,
            displayOptions: U.COURSE_TYPES,
            defaultValue: U.COURSE_TYPES[0]
        });
        if (!courseType && ctx.mode === "native") throw new Error("必须选择课程体系");

        let subject = null;
        if (U.isIELTSCourse(courseType)) {
            subject = await ctx.ask({
                id: "subject",
                label: "请选择科目（雅思课程）",
                type: "dropdown",
                options: U.IELTS_SUBJECTS,
                displayOptions: U.IELTS_SUBJECTS,
                defaultValue: U.IELTS_SUBJECTS[0]
            });
            if (!subject && ctx.mode === "native") throw new Error("未选择科目");
        }

        // 复刻 pickTargetFolder：先给快捷项，选「其他...」再列全部文件夹
        var fs = readFolderStructure(ctx);
        var quickOptions = [
            fs.active + " (默认)",
            fs.archived,
            "其他..."
        ];
        const targetFolder = await ctx.ask({
            id: "targetFolder",
            label: "请选择学员档案存放位置",
            type: "suggester",
            options: quickOptions,
            displayOptions: quickOptions,
            defaultValue: quickOptions[0]
        });
        if (!targetFolder && ctx.mode === "native") throw new Error("未选择存放位置");

        let targetFolderCustom = null;
        if (targetFolder === "其他...") {
            var fullOptions = ["(根目录)"].concat(getAllFolders(ctx));
            targetFolderCustom = await ctx.ask({
                id: "targetFolderCustom",
                label: "请选择学员档案存放位置",
                type: "suggester",
                options: fullOptions,
                displayOptions: fullOptions,
                defaultValue: fullOptions[0]
            });
            if (!targetFolderCustom && ctx.mode === "native") throw new Error("未选择存放位置");
        }

        // 复刻 ensureFolderWithConfirm：只读判断文件夹是否已存在，命中才追加「继续/取消」
        const basePath = resolveTargetFolder(ctx, targetFolder, targetFolderCustom);
        let folderConfirm = "yes";
        if (studentName && basePath !== null) {
            const studentFolderPath = U.joinPath(basePath, studentName);
            if (ctx.app.vault.getAbstractFileByPath(studentFolderPath)) {
                folderConfirm = (await ctx.ask({
                    id: "folderConfirm",
                    label: "文件夹 \"" + studentFolderPath + "\" 已存在，是否继续写入档案页？",
                    description: "(点击取消则停止)",
                    type: "dropdown",
                    options: ["yes", "no"],
                    displayOptions: ["继续", "取消"],
                    defaultValue: "yes"
                })) || "yes";
            }
        }

        return {
            studentName: studentName,
            startingDate: startingDate,
            scheduleType: scheduleType,
            courseType: courseType,
            subject: subject,
            targetFolder: targetFolder,
            targetFolderCustom: targetFolderCustom,
            folderConfirm: folderConfirm
        };
    },

    // 第二阶段：只干活，禁 ask / confirm
    execute: async (params, ctx) => {
        const U = await loadUtils(ctx);
        try {
            const studentName = String(params.studentName || "");
            if (!studentName) throw new Error("学员姓名不能为空");

            const startingDate = normalizeStartingDate(U, params.startingDate);
            if (!startingDate) throw new Error("首课日期不能为空");

            const scheduleType = String(params.scheduleType || "").split(" ")[0];
            if (!scheduleType) throw new Error("未选择上课频率");

            const courseType = String(params.courseType || "");
            if (!courseType) throw new Error("必须选择课程体系");

            let subject = null;
            if (U.isIELTSCourse(courseType)) {
                subject = String(params.subject || "");
                if (!subject) throw new Error("未选择科目");
            }

            const basePath = resolveTargetFolder(ctx, params.targetFolder, params.targetFolderCustom);
            if (basePath === null) throw new Error("未选择存放位置");

            const studentFolderPath = U.joinPath(basePath, studentName);
            const archiveFilePath = U.joinPath(studentFolderPath, studentName + ".md");

            // 复刻 ensureFolderWithConfirm：不存在则建夹；已存在按 collect 的答案继续或取消
            const existing = ctx.app.vault.getAbstractFileByPath(studentFolderPath);
            if (!existing) {
                await ctx.app.vault.createFolder(studentFolderPath);
            } else if (params.folderConfirm !== "yes") {
                throw new Error("用户取消操作");
            }

            const frontmatter = U.buildFrontmatter(U.buildArchiveFrontmatterFields({
                kind: "vip",
                startingDate: startingDate,
                scheduleType: scheduleType,
                courseType: courseType,
                subject: subject
            }));
            const body = U.buildArchiveBody({
                kind: "vip",
                archiveName: studentName,
                courseType: courseType
            });
            const action = await U.writeOrUpdateFile(archiveFilePath, frontmatter + body);
            ctx.notice("✅ 档案已" + (action === "created" ? "创建" : "更新") + "：" + archiveFilePath);

            await U.openFile(archiveFilePath);
        } catch (err) {
            console.error("One-on-One Archive Error:", err);
            ctx.notice("❌ 建档失败：" + err.message);
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
