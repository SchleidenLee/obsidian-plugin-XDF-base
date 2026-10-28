/**
 * 数据库 API 导出
 *
 * 暴露给外部插件 / QuickAdd 脚本的**只读** db API 入口：
 *   app.plugins.plugins["xdf-base"].api.db.query(...)
 *   app.plugins.plugins["xdf-base"].api.db.status()
 *   app.plugins.plugins["xdf-base"].api.db.isSyncEnabled()
 *
 * 契约（2026-10-28 定）：DB 是 vault 的只读镜像，写只发生在 md 文件、
 * 由内部 Sync/Builder 经 DBConnection.exec() 回灌。本门面不提供任何
 * 写入口；query 运行在引擎级 query_only=ON 下，夹带写的语句
 * （如 WITH ... DELETE RETURNING）由 SQLite 直接拒绝。
 */

import type { App } from "obsidian";
import { DBConnection } from "./Connection";
import { DBSync } from "./Sync";

export interface XdfDBApi {
    /** 只读查询 SQL（SELECT），返回对象数组；写语句被引擎拒绝 */
    query: <T = Record<string, any>>(sql: string, params?: any[]) => T[];
    /** 获取数据库状态 */
    status: () => {
        path: string;
        isOpen: boolean;
        isDirty: boolean;
        tableCount: number;
        tables: string[];
    };
    /** 是否正在监听 */
    isSyncEnabled: () => boolean;
}

/**
 * 创建暴露给外部的只读 db API。
 * 写操作（exec/rebuild/开关同步）刻意不暴露——见文件头契约。
 */
export function createDBApi(app: App, db: DBConnection, sync: DBSync): XdfDBApi {
    return {
        query: (sql, params) => db.query(sql, params),
        status: () => db.getStatus(),
        isSyncEnabled: () => sync["enabled"]  // 访问 private 字段
    };
}

export { DBConnection, DBSync };
export { DBWriter, collectVaultFiles, rebuildDatabase } from "./Builder";
