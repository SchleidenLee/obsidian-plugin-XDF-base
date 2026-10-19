/**
 * 脚本释放器
 *
 * 每次启动都把内置脚本释放到 00.SYSTEM/xdf_base/（无条件覆盖）
 *
 * 设计原则：
 * - 释放目录：00.SYSTEM/xdf_base/（非点目录：QuickAdd 的
 *   getUserScript 走 vault 索引，点目录拿不到 TFile）
 * - 目录即分组：scripts/<分组>/<脚本名>.js，与源码目录一一对应
 * - 无条件覆盖：内置脚本升级随插件启动自动送达，老师不会修改预设脚本
 * - 只动清单内的文件：用户自建脚本不在 SCRIPTS / ASSETS 里，不会被动
 * - 自愈：用户删了再补回
 * - 迁移清理：旧版扁平脚本与 panel-scripts/ 一次性删除
 */

import { TFile, type App } from "obsidian";
import { SCRIPTS, ASSETS } from "./index";

const SYSTEM_DIR = "00.SYSTEM/xdf_base";

/** 需要释放的全部文件：可运行脚本 + 共享资产 */
const ALL_FILES = [...SCRIPTS, ...ASSETS];

/**
 * 旧版释放路径（相对 SYSTEM_DIR），迁移时删除。
 *
 * 旧版布局：
 *   scripts/<扁平中文名>.js  +  panel-scripts/<英文名>.js
 * 新版布局：
 *   scripts/<分组>/<中文名>.js
 */
const LEGACY_PATHS = [
    "scripts/一对一建档.js",
    "scripts/班课建档.js",
    "scripts/一对一每课记录.js",
    "scripts/班课每课记录.js",
    "scripts/HomeworkAI.js",
    "scripts/WordListAI.js",
    "scripts/周例会建档.js",
    "scripts/周例会记录.js",
    "scripts/例会添加页面.js",
    "panel-scripts/new-note.js",
    "panel-scripts/append-to-note.js",
    "panel-scripts/archive-1on1-create.js",
    "panel-scripts/archive-class-create.js",
    "panel-scripts/lesson-1on1-record.js",
    "panel-scripts/lesson-class-record.js",
    "panel-scripts/homework-ai.js",
    "panel-scripts/wordlist-ai.js",
    "panel-scripts/meeting-setup.js",
    "panel-scripts/meeting-record.js",
    "panel-scripts/meeting-add-page.js"
];

/** 清理后需要尝试删除的空目录（相对 SYSTEM_DIR） */
const LEGACY_DIRS = ["panel-scripts"];

export class ScriptReleaser {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * 释放所有内置脚本（idempotent，每次启动全量覆盖）
     */
    async releaseAll(): Promise<ReleaseReport> {
        const report: ReleaseReport = {
            created: [],
            updated: [],
            removed: [],
            failed: []
        };

        await this.ensureDir(SYSTEM_DIR);

        // 1. 全量覆盖当前清单
        for (const file of ALL_FILES) {
            try {
                const fullPath = `${SYSTEM_DIR}/${file.path}`;
                const action = await this.releaseOne(fullPath, file.content);
                if (action === "created") {
                    report.created.push(fullPath);
                } else {
                    report.updated.push(fullPath);
                }
            } catch (err) {
                report.failed.push({
                    path: file.path,
                    error: String(err)
                });
            }
        }

        // 2. 清理旧布局
        try {
            report.removed.push(...(await this.pruneLegacy()));
        } catch (err) {
            report.failed.push({
                path: LEGACY_PATHS.join(", "),
                error: String(err)
            });
        }

        return report;
    }

    /**
     * 删除旧版扁平脚本与 panel-scripts/ 目录
     * @returns 实际删除的路径（相对 vault）
     */
    private async pruneLegacy(): Promise<string[]> {
        const removed: string[] = [];

        for (const rel of LEGACY_PATHS) {
            const fullPath = `${SYSTEM_DIR}/${rel}`;
            if (!(await this.app.vault.adapter.exists(fullPath))) continue;
            try {
                await this.app.vault.adapter.remove(fullPath);
                removed.push(fullPath);
            } catch {
                // 索引滞后或已被占用：下次启动再试，不阻塞释放
            }
        }

        for (const rel of LEGACY_DIRS) {
            const fullPath = `${SYSTEM_DIR}/${rel}`;
            if (!(await this.app.vault.adapter.exists(fullPath))) continue;
            try {
                // 非递归：目录里还有用户自己的脚本时保留
                await this.app.vault.adapter.rmdir(fullPath, false);
            } catch {
                // 目录非空（用户放了自己的脚本）时保留
            }
        }

        return removed;
    }

    /**
     * 释放单个脚本：不存在则创建，已存在则覆盖
     * @returns "created" | "updated"
     */
    private async releaseOne(path: string, content: string): Promise<"created" | "updated"> {
        // 确保父目录（多级逐层创建）
        const dir = path.substring(0, path.lastIndexOf("/"));
        if (dir) await this.ensureDir(dir);

        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            // TFile 已存在 → 覆盖
            await this.app.vault.modify(file, content);
            return "updated";
        }

        if (await this.app.vault.adapter.exists(path)) {
            // vault 索引未命中但磁盘存在（如启动早期）→ 直接写
            await this.app.vault.adapter.write(path, content);
            return "updated";
        }

        await this.app.vault.create(path, content);
        return "created";
    }

    /**
     * 确保目录存在（逐级创建）
     */
    private async ensureDir(path: string): Promise<void> {
        if (await this.app.vault.adapter.exists(path)) return;

        const parent = path.substring(0, path.lastIndexOf("/"));
        if (parent) await this.ensureDir(parent);

        await this.app.vault.adapter.mkdir(path);
    }

    /**
     * 获取释放状态
     */
    async getStatus(): Promise<ReleaseStatus> {
        const status: ReleaseStatus = {
            systemDir: SYSTEM_DIR,
            installed: [],
            missing: []
        };

        for (const file of ALL_FILES) {
            const fullPath = `${SYSTEM_DIR}/${file.path}`;
            if (await this.app.vault.adapter.exists(fullPath)) {
                status.installed.push(fullPath);
            } else {
                status.missing.push(fullPath);
            }
        }

        return status;
    }
}

export interface ReleaseReport {
    created: string[];
    updated: string[];
    removed: string[];
    failed: Array<{ path: string; error: string }>;
}

export interface ReleaseStatus {
    systemDir: string;
    installed: string[];
    missing: string[];
}
