/**
 * 两段式脚本：班课建档
 * 释放到 00.SYSTEM/xdf_base/scripts/档案管理/班课建档.js
 *
 * collect：只读扫描 + ctx.ask 取输入
 * execute：只从 params 取输入，唯一写盘处
 * entry  ：QuickAdd 原生入口（载入共享 runtime，顺序跑 collect → execute）
 */

export const PANEL_ARCHIVE_CLASS_CREATE_SCRIPT = String.raw`/**
 * XDF 脚本 · 班课建档
 * 释放路径：00.SYSTEM/xdf_base/scripts/档案管理/班课建档.js
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
    meta: { title: "班课建档" },

    // 第一阶段：只收集，不写盘
    collect: async (ctx) => {
        const U = await loadUtils(ctx);

        const className = await ctx.ask({
            id: "className",
            label: "请输入班级名称（如：G3-01班）",
            type: "text"
        });
        if (!className && ctx.mode === "native") throw new Error("班级名称不能为空");

        const startingDate = await ctx.ask({
            id: "startingDate",
            label: "请选择首课日期",
            type: "date",
            dateFormat: "YYYY-MM-DD"
        });
        if (!startingDate && ctx.mode === "native") throw new Error("首课日期不能为空");

        const scheduleType = await ctx.ask({
            id: "scheduleType",
            label: "请选择班级类型",
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

        const studentListInput = await ctx.ask({
            id: "studentList",
            label: "请输入学员名单（用空格分隔）\n例如：张三 李四",
            type: "text",
            placeholder: "张三 李四"
        });
        if (!studentListInput && ctx.mode === "native") throw new Error("学员名单不能为空");

        // 复刻 pickTargetFolder：先给快捷项，选「其他...」再列全部文件夹
        var fs = readFolderStructure(ctx);
        var quickOptions = [
            fs.active + " (默认)",
            fs.archived,
            "其他..."
        ];
        const targetFolder = await ctx.ask({
            id: "targetFolder",
            label: "请选择存放班级文件夹的位置",
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
                label: "请选择存放班级文件夹的位置",
                type: "suggester",
                options: fullOptions,
                displayOptions: fullOptions,
                defaultValue: fullOptions[0]
            });
            if (!targetFolderCustom && ctx.mode === "native") throw new Error("未选择存放位置");
        }

        return {
            className: className,
            startingDate: startingDate,
            scheduleType: scheduleType,
            courseType: courseType,
            subject: subject,
            studentList: studentListInput,
            targetFolder: targetFolder,
            targetFolderCustom: targetFolderCustom
        };
    },

    // 第二阶段：只干活，禁 ask / confirm
    execute: async (params, ctx) => {
        const U = await loadUtils(ctx);
        try {
            const className = String(params.className || "");
            if (!className) throw new Error("班级名称不能为空");

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

            const studentListInput = String(params.studentList || "");
            if (!studentListInput) throw new Error("学员名单不能为空");
            const students = studentListInput.split(/\s+/).map(function (s) { return s.trim(); }).filter(Boolean);

            const basePath = resolveTargetFolder(ctx, params.targetFolder, params.targetFolderCustom);
            if (basePath === null) throw new Error("未选择存放位置");

            const classFolderPath = U.joinPath(basePath, className);
            const created = await U.ensureFolder(classFolderPath);
            ctx.notice(created
                ? "📁 班级文件夹 \"" + className + "\" 已创建"
                : "📁 班级文件夹 \"" + className + "\" 已存在");

            const frontmatter = U.buildFrontmatter(U.buildArchiveFrontmatterFields({
                kind: "class",
                startingDate: startingDate,
                scheduleType: scheduleType,
                courseType: courseType,
                subject: subject,
                studentCount: students.length
            }));
            const body = U.buildArchiveBody({
                kind: "class",
                students: students
            });
            const archiveFilePath = U.joinPath(classFolderPath, className + ".md");
            const action = await U.writeIfNotExists(archiveFilePath, frontmatter + body);
            if (action === "created") ctx.notice("📄 班级主页已创建");

            await U.openFile(archiveFilePath, true);
            ctx.notice("✅ 班级 \"" + className + "\" 创建完成！");
        } catch (err) {
            ctx.notice("❌ 运行失败：" + err.message);
            console.error("Class Archive Error:", err);
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
