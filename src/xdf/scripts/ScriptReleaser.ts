/**
 * 脚本释放器
 *
 * 每次启动都把内置脚本释放到 00.SYSTEM/xdf_base/（无条件覆盖）
 *
 * 设计原则：
 * - 释放目录：00.SYSTEM/xdf_base/（非点目录：QuickAdd 的
 *   getUserScript 走 vault 索引，点目录拿不到 TFile）
 * - 布局：scripts/presets/<分组>/<脚本名>.js 与 assets/<资产名>.js（源码目录即释放路径）
 * - 无条件覆盖：内置脚本升级随插件启动自动送达，老师不会修改预设脚本
 * - 只动清单内的文件：用户自建脚本不在 SCRIPTS / ASSETS 里，不会被动
 * - 自愈：用户删了再补回
 * - 旧释放文件不自动迁移，由用户手动清理
 */

import { TFile, type App } from "obsidian";
import { SCRIPTS, ASSETS } from "./scriptRegistry";

const SYSTEM_DIR = "00.SYSTEM/xdf_base";

/** 需要释放的全部文件：可运行脚本 + 共享资产 */
const ALL_FILES = [...SCRIPTS, ...ASSETS];

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

        return report;
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
