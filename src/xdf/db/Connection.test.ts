/**
 * Connection 只读硬闸测试（query_only 引擎级）
 * 场景：exec 临时开锁可写；query 默认锁死，夹带写的语句被引擎拒绝
 * 运行环境：WSL（vitest.xdf.config.mts）
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

// Connection.ts 里 wasm 经 esbuild binary loader 内联；vitest 下没有该 loader，
// mock 成 undefined 让 sql.js 回退到从 node_modules 读取 wasm 文件。
vi.mock("sql.js/dist/sql-wasm.wasm", () => ({ default: undefined }));

import { DBConnection } from "./Connection";

function fakeApp() {
    const files = new Map<string, Uint8Array>();
    const app: any = {
        vault: {
            adapter: {
                exists: async (p: string) => files.has(p),
                mkdir: async (p: string) => {
                    void p;
                },
                readBinary: async (p: string) => files.get(p)!.buffer as ArrayBuffer,
                writeBinary: async (p: string, data: ArrayBuffer) => {
                    files.set(p, new Uint8Array(data));
                },
            },
        },
    };
    return app;
}

describe("DBConnection 只读硬闸", () => {
    let db: DBConnection;

    beforeAll(async () => {
        db = new DBConnection(fakeApp(), "test/x.db");
        await db.initialize();
    });

    it("exec 内部开锁窗口：建表 + 插入成功", () => {
        db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
        db.exec("INSERT INTO t (v) VALUES (?)", ["hello"]);
        expect(db.query("SELECT v FROM t")).toEqual([{ v: "hello" }]);
    });

    it("query 走默认只读态：裸 DELETE 被引擎拒绝", () => {
        expect(() => db.query("DELETE FROM t WHERE v = 'hello'")).toThrow(/readonly/i);
    });

    it("query 拒绝 CTE-DML（WITH ... DELETE RETURNING 花活）", () => {
        // 当前 sql.js 内置 SQLite 不支持该语法（语法层直接拒绝）；
        // 即便未来版本支持，query_only=ON 也会在引擎层拒绝写。两种都是"被拒"。
        expect(() => db.query("WITH d AS (DELETE FROM t RETURNING v) SELECT v FROM d")).toThrow();
    });

    it("query 被拒后锁没漏：exec 依然可写", () => {
        db.exec("INSERT INTO t (v) VALUES ('world')");
        expect(db.query<{ v: string }>("SELECT v FROM t WHERE v = 'world'")).toHaveLength(1);
    });

    it("exec 抛错后锁也回得上：后续 query 仍只读", () => {
        expect(() => db.exec("INSERT INTO no_such_table VALUES (1)")).toThrow();
        expect(() => db.query("INSERT INTO t (v) VALUES ('x')")).toThrow(/readonly/i);
    });
});
