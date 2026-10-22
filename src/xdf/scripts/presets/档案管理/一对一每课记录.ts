/**
 * 两段式脚本：一对一每课记录
 * 释放到 00.SYSTEM/xdf_base/scripts/presets/档案管理/一对一每课记录.js
 *
 * 复刻 lesson-1on1-record.ts：选档案 → 课型继承 → 时间 → 7 文件包 → 档案回填。
 * collect 只读扫描 + ctx.ask 取输入；execute 唯一写盘；entry 为 QuickAdd 入口。
 */

export const PANEL_LESSON_1ON1_RECORD_SCRIPT = String.raw`/**
 * XDF 脚本 · 一对一每课记录
 * 释放路径：00.SYSTEM/xdf_base/scripts/presets/档案管理/一对一每课记录.js
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
    meta: { title: "一对一每课记录" },

    // 第一阶段：只收集，不写盘
    collect: async (ctx) => {
        const U = await loadUtils(ctx);

        const candidates = scanArchives(ctx, U, U.TAGS.VIP);
        if (candidates.length === 0) {
            ctx.notice("未找到 " + U.TAGS.VIP + " 档案，请先建档");
            return {};
        }

        const paths = candidates.map(function (f) { return f.path; });
        const labels = candidates.map(function (f) { return f.basename; });

        let archivePath = await ctx.ask({
            id: "archive",
            label: "请选择学员档案",
            type: "suggester",
            options: paths,
            displayOptions: labels,
            defaultValue: paths[0]
        });
        if (!archivePath) return {};
        if (paths.indexOf(archivePath) === -1) archivePath = paths[0];

        const chosen = candidates.find(function (f) { return f.path === archivePath; }) || candidates[0];
        const content = await ctx.app.vault.read(chosen);
        const parsed = U.parseArchiveMeta(chosen, content);
        const prevType = U.lastCourseType(parsed);

        // 复刻 pickCourseTypeWithDefault：有默认课型时首项为「默认 (X)」
        let courseType;
        if (!prevType) {
            courseType = await ctx.ask({
                id: "courseType",
                label: "请选择课程体系",
                type: "suggester",
                options: U.COURSE_TYPES,
                displayOptions: U.COURSE_TYPES,
                defaultValue: U.COURSE_TYPES[0]
            });
            if (!courseType && ctx.mode === "native") throw new Error("必须选择课程体系");
            if (!courseType) courseType = U.COURSE_TYPES[0];
        } else {
            const otherOptions = U.COURSE_TYPES.filter(function (opt) { return opt !== prevType; });
            const tagOptions = ["默认 (" + prevType + ")"].concat(otherOptions);
            courseType = await ctx.ask({
                id: "courseType",
                label: "请选择本节课所属的课程体系",
                type: "suggester",
                options: tagOptions,
                displayOptions: tagOptions,
                defaultValue: tagOptions[0]
            });
            if (!courseType && ctx.mode === "native") throw new Error("未选择课程体系");
            if (tagOptions.indexOf(courseType) === -1) courseType = tagOptions[0];
        }

        // 复刻 pickLessonTime：先选时间获取方式，手动时再取日期 + 时段
        const slots = U.LESSON_TIME_SLOTS;
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

        // 复刻 writeLessonPackage 的 ensureFolderWithConfirm：只读判断，命中才追加覆盖选项
        const parentFolder = chosen.parent.path;
        const lessonNumber = U.getNextLessonNumber(parentFolder);
        const folderPath = U.joinPath(parentFolder, U.buildLessonFolderName(chosen.basename, lessonNumber));
        let overwrite = "yes";
        if (ctx.app.vault.getAbstractFileByPath(folderPath)) {
            overwrite = (await ctx.ask({
                id: "overwrite",
                label: "课程文件夹 \"" + folderPath + "\" 已存在，是否覆盖内部文件？",
                type: "dropdown",
                options: ["yes", "no"],
                displayOptions: ["覆盖内部文件", "取消"],
                defaultValue: "yes"
            })) || "yes";
        }

        return {
            archive: chosen.path,
            courseType: courseType,
            timeMode: timeMode,
            date: lessonDate,
            slot: timeSlot,
            overwrite: overwrite
        };
    },

    // 第二阶段：只干活，禁 ask / confirm
    execute: async (params, ctx) => {
        const U = await loadUtils(ctx);
        try {
            const archivePath = String(params.archive || "");
            if (!archivePath) {
                // 复刻 pickArchiveByKind：无候选时提示；用户主动取消则静默返回
                if (scanArchives(ctx, U, U.TAGS.VIP).length === 0) {
                    ctx.notice("未找到 " + U.TAGS.VIP + " 档案，请先建档");
                }
                return;
            }

            const archiveFile = ctx.app.vault.getAbstractFileByPath(archivePath);
            if (!archiveFile) throw new Error("找不到档案：" + archivePath);

            const content = await ctx.app.vault.read(archiveFile);
            const parsed = U.parseArchiveMeta(archiveFile, content);
            const subject = parsed.meta.subject || null;
            const prevType = U.lastCourseType(parsed);

            // 复刻 pickCourseTypeWithDefault 的返回值：默认项继承旧课型且不算新课型
            const selected = String(params.courseType || "");
            let courseType;
            let isNew;
            if (!prevType) {
                if (!selected) throw new Error("必须选择课程体系");
                courseType = selected;
                isNew = true;
            } else if (selected === "默认 (" + prevType + ")") {
                courseType = prevType;
                isNew = false;
            } else {
                if (!selected) throw new Error("未选择课程体系");
                courseType = selected;
                isNew = true;
            }

            // 复刻 pickLessonTime 的返回值
            const slots = U.LESSON_TIME_SLOTS;
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
            const folderPath = U.joinPath(parentFolder, U.buildLessonFolderName(archiveFile.basename, lessonNumber));

            // 复刻 ensureFolderWithConfirm 分支：取消 → 原「用户取消操作」；覆盖 → 先删再重建
            const existing = ctx.app.vault.getAbstractFileByPath(folderPath);
            if (existing) {
                if (params.overwrite === "no") {
                    ctx.notice("❌ 生成失败：用户取消操作");
                    return;
                }
                await ctx.app.vault.delete(existing, true);
            }

            const pkg = await U.writeLessonPackage({
                kind: "vip",
                archiveName: archiveFile.basename,
                parentFolder: parentFolder,
                lessonNumber: lessonNumber,
                isoDate: iso,
                month: month,
                day: day,
                courseType: courseType,
                subject: subject,
                needSendFeedback: true,
                overwrite: true
            });

            await U.updateArchiveAfterLesson({
                archiveFile: archiveFile,
                link: U.buildIndexLink("vip", pkg.folderName, lessonNumber, dateStr),
                lessonNumber: lessonNumber,
                dateStr: dateStr,
                isNewCourseType: isNew,
                courseType: courseType,
                indexHeader: "### 🏷️ " + courseType
            });

            await U.openFile(pkg.folderPath + "/" + pkg.names.nav + ".md");
            ctx.notice("✅ 第 " + lessonNumber + " 课记录包生成成功！");
        } catch (err) {
            console.error("One-on-One Lesson Record Error:", err);
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
