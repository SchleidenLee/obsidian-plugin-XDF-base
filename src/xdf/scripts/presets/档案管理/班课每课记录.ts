/**
 * 两段式脚本：班课每课记录
 * 释放到 00.SYSTEM/xdf_base/scripts/presets/档案管理/班课每课记录.js
 *
 * 复刻 lesson-class-record.ts：选档案 → 学员表 → 课次/课型/班型 → 时间 → 7 文件包 → 档案回填。
 * collect 只读扫描 + ctx.ask 取输入；execute 唯一写盘；entry 为 QuickAdd 入口。
 */

export const PANEL_LESSON_CLASS_RECORD_SCRIPT = String.raw`/**
 * XDF 脚本 · 班课每课记录
 * 释放路径：00.SYSTEM/xdf_base/scripts/presets/档案管理/班课每课记录.js
 *
 * collect：只读扫描 + ctx.ask 取输入（不写盘）
 * execute：只从 params 取输入，唯一写盘处（禁止 ctx.ask / confirm）
 * entry  ：QuickAdd 原生入口（载入共享 runtime，顺序跑 collect → execute）
 */
const UTILS_PATH = "00.SYSTEM/xdf_base/scripts/assets/ArchiveUtils.js";
const RUNTIME_PATH = "00.SYSTEM/xdf_base/scripts/assets/XdfRuntime.js";

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

// 复刻 ArchiveUtils.pickArchiveByKind 的只读候选扫描（不弹窗）
function scanArchives(ctx, U, kindTag) {
    const files = ctx.app.vault.getMarkdownFiles();
    const candidates = [];
    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.path.indexOf(".trash") !== -1) continue;
        if (!U.fileHasTags(f, [U.TAGS.ARCHIVE, kindTag])) continue;
        const cache = ctx.app.metadataCache.getFileCache(f);
        if (cache && cache.frontmatter && cache.frontmatter.status === "archived") continue;
        candidates.push(f);
    }
    return candidates;
}

const MOD = {
    meta: { title: "班课每课记录" },

    // 第一阶段：只收集，不写盘
    collect: async (ctx) => {
        const U = await loadUtils(ctx);

        const candidates = scanArchives(ctx, U, U.TAGS.CLASS);
        if (candidates.length === 0) {
            ctx.notice("未找到 " + U.TAGS.CLASS + " 档案，请先建档");
            return {};
        }

        const paths = candidates.map(function (f) { return f.path; });
        const labels = candidates.map(function (f) { return f.basename; });

        let archivePath = await ctx.ask({
            id: "archive",
            label: "请选择班级档案",
            type: "suggester",
            options: paths,
            displayOptions: labels,
            defaultValue: paths[0]
        });
        if (!archivePath) return {};
        if (paths.indexOf(archivePath) === -1) archivePath = paths[0];

        const chosen = candidates.find(function (f) { return f.path === archivePath; }) || candidates[0];
        await ctx.app.vault.read(chosen);

        // 复刻 pickLessonTime：先选时间获取方式，手动时再取日期 + 时段
        const slots = U.CLASS_TIME_SLOTS;
        let timeMode = await ctx.ask({
            id: "timeMode",
            label: "请选择课程时间获取方式",
            type: "suggester",
            options: U.TIME_MODE_OPTIONS,
            displayOptions: U.TIME_MODE_OPTIONS,
            defaultValue: U.TIME_MODE_OPTIONS[0]
        });
        if (!timeMode) timeMode = U.TIME_MODE_OPTIONS[0];

        let lessonDate = "";
        let timeSlot = "";
        if (timeMode !== U.TIME_MODE_OPTIONS[0]) {
            lessonDate = await ctx.ask({
                id: "date",
                label: "请选择课程日期",
                type: "date",
                dateFormat: "YYYY-MM-DD"
            });
            if (!lessonDate && ctx.mode === "native") throw new Error("未选择日期");

            timeSlot = await ctx.ask({
                id: "slot",
                label: "请选择课程时间",
                type: "suggester",
                options: slots,
                displayOptions: slots,
                defaultValue: slots[0]
            });
            if (!timeSlot && ctx.mode === "native") throw new Error("必须选择时间");
            if (!timeSlot) timeSlot = slots[0];
        }

        return {
            archive: chosen.path,
            timeMode: timeMode,
            date: lessonDate,
            slot: timeSlot
        };
    },

    // 第二阶段：只干活，禁 ask / confirm
    execute: async (params, ctx) => {
        const U = await loadUtils(ctx);
        try {
            const archivePath = String(params.archive || "");
            if (!archivePath) {
                // 复刻 pickArchiveByKind：无候选时提示；用户主动取消则静默返回
                if (scanArchives(ctx, U, U.TAGS.CLASS).length === 0) {
                    ctx.notice("未找到 " + U.TAGS.CLASS + " 档案，请先建档");
                }
                return;
            }

            const archiveFile = ctx.app.vault.getAbstractFileByPath(archivePath);
            if (!archiveFile) throw new Error("找不到档案：" + archivePath);

            const content = await ctx.app.vault.read(archiveFile);
            const parsed = U.parseArchiveMeta(archiveFile, content);
            const subject = parsed.meta.subject || null;
            const courseType = U.lastCourseType(parsed, "班课");
            const scheduleType = parsed.meta.schedule_type || "full-time";

            // 复刻 pickLessonTime 的返回值
            const slots = U.CLASS_TIME_SLOTS;
            let date;
            if (!params.timeMode || params.timeMode === U.TIME_MODE_OPTIONS[0]) {
                date = U.getNearestSlotDate(slots);
            } else {
                if (!params.date) throw new Error("未选择日期");
                if (!params.slot) throw new Error("必须选择时间");
                date = new Date(String(params.date) + "T" + String(params.slot) + ":00");
            }
            const iso = U.formatISO(date);
            const dateStr = U.formatDateStr(date);
            const month = date.getMonth() + 1;
            const day = date.getDate();

            const parentFolder = archiveFile.parent.path;
            const lessonNumber = U.getNextLessonNumber(parentFolder);
            const needSendFeedback = scheduleType === "weekend" || lessonNumber % 2 === 0;
            const students = U.parseStudentsFromArchive(archiveFile, content);

            const pkg = await U.writeLessonPackage({
                kind: "class",
                archiveName: archiveFile.basename,
                parentFolder: parentFolder,
                lessonNumber: lessonNumber,
                isoDate: iso,
                month: month,
                day: day,
                courseType: courseType,
                subject: subject,
                needSendFeedback: needSendFeedback,
                overwrite: false,
                students: students
            });

            await U.updateArchiveAfterLesson({
                archiveFile: archiveFile,
                link: U.buildIndexLink("class", pkg.folderName, lessonNumber, dateStr),
                lessonNumber: lessonNumber,
                dateStr: dateStr,
                isNewCourseType: false,
                courseType: courseType,
                indexHeader: U.INDEX_HEADER
            });

            await U.openFile(pkg.folderPath + "/" + pkg.names.nav + ".md", true);
            ctx.notice("✅ Lesson " + lessonNumber + " 创建完成");
        } catch (err) {
            ctx.notice("❌ " + err.message);
            console.error(err);
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
