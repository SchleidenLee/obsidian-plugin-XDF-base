/**
 * XDF Base 内置脚本清单
 *
 * 约定：**源码目录即分组**。
 *   src/xdf/scripts/<分组>/<脚本名>.ts  →  00.SYSTEM/xdf_base/scripts/<分组>/<脚本名>.js
 *
 * - 脚本 id / 面板 id / 释放文件名 / QuickAdd 菜单名 全部等于 `<脚本名>`（中文，四者一致）
 * - 分组由 path 第一段推导，不再在代码里硬编码成员；新增脚本只需在此登记一行
 * - esbuild 不支持 import.meta.glob，故清单必须手写
 */

import { ARCHIVE_UTILS_SCRIPT } from "./lib/archive-utils";
import { XDF_RUNTIME_SCRIPT } from "./runtime/xdf-runtime";
import { PANEL_ARCHIVE_1ON1_CREATE_SCRIPT } from "./档案管理/一对一建档";
import { PANEL_ARCHIVE_CLASS_CREATE_SCRIPT } from "./档案管理/班课建档";
import { PANEL_LESSON_1ON1_RECORD_SCRIPT } from "./档案管理/一对一每课记录";
import { PANEL_LESSON_CLASS_RECORD_SCRIPT } from "./档案管理/班课每课记录";
import { PANEL_WORDLIST_AI_SCRIPT } from "./文件生成/词表工具";
import { PANEL_HOMEWORK_AI_SCRIPT } from "./文件生成/AI出作业";
import { PANEL_MEETING_SETUP_SCRIPT } from "./行政工作/周例会建档";
import { PANEL_MEETING_RECORD_SCRIPT } from "./行政工作/周例会记录";
import { PANEL_MEETING_ADD_PAGE_SCRIPT } from "./行政工作/例会添加页面";
import { PANEL_NEW_NOTE_SCRIPT } from "./通用/新建笔记";
import { PANEL_APPEND_TO_NOTE_SCRIPT } from "./通用/追加到笔记";

/**
 * 分组展示顺序。
 * 只决定顺序，不决定成员：成员完全由 scripts/ 下的文件夹决定。
 * 未列出的分组排在最后，按名称排序。
 */
export const GROUP_ORDER = ["档案管理", "文件生成", "行政工作", "通用"];

export interface XdfScript {
    /** 脚本 id === 文件名（不含 .js），同时也是面板 id 与 QuickAdd 菜单名 */
    id: string;
    /** 释放到 00.SYSTEM/xdf_base/ 的相对路径：scripts/<分组>/<id>.js */
    path: string;
    /** 所属分组（scripts/ 下的文件夹名） */
    group: string;
    /** 脚本内容 */
    content: string;
}

/**
 * 登记一个脚本
 * @param relativePath 相对 scripts/ 的路径，如 "档案管理/一对一建档.js"
 */
function defineScript(relativePath: string, content: string): XdfScript {
    const parts = relativePath.split("/");
    const fileName = parts[parts.length - 1];
    return {
        id: fileName.replace(/\.js$/i, ""),
        path: `scripts/${relativePath}`,
        group: parts[0],
        content
    };
}

/**
 * 全部可运行脚本（两段式：collect / execute，另带 QuickAdd 用的 entry）
 *
 * 加脚本：把 .ts 放进对应分组文件夹，然后在这里加一行。
 * 换分组：移动 .ts 文件 + 改这一行的路径。
 */
export const SCRIPTS: XdfScript[] = [
    defineScript("档案管理/一对一建档.js", PANEL_ARCHIVE_1ON1_CREATE_SCRIPT),
    defineScript("档案管理/班课建档.js", PANEL_ARCHIVE_CLASS_CREATE_SCRIPT),
    defineScript("档案管理/一对一每课记录.js", PANEL_LESSON_1ON1_RECORD_SCRIPT),
    defineScript("档案管理/班课每课记录.js", PANEL_LESSON_CLASS_RECORD_SCRIPT),
    defineScript("文件生成/AI出作业.js", PANEL_HOMEWORK_AI_SCRIPT),
    defineScript("文件生成/词表工具.js", PANEL_WORDLIST_AI_SCRIPT),
    defineScript("行政工作/周例会建档.js", PANEL_MEETING_SETUP_SCRIPT),
    defineScript("行政工作/周例会记录.js", PANEL_MEETING_RECORD_SCRIPT),
    defineScript("行政工作/例会添加页面.js", PANEL_MEETING_ADD_PAGE_SCRIPT),
    defineScript("通用/新建笔记.js", PANEL_NEW_NOTE_SCRIPT),
    defineScript("通用/追加到笔记.js", PANEL_APPEND_TO_NOTE_SCRIPT)
];

/**
 * 共享资产（不是可运行脚本）
 *
 * 释放到 00.SYSTEM/xdf_base/utils/，由脚本按固定路径加载；
 * 不进 QuickAdd 菜单，也不出现在面板列表里。
 */
export interface XdfAsset {
    id: string;
    path: string;
    content: string;
}

export const ASSETS: XdfAsset[] = [
    {
        id: "ArchiveUtils",
        path: "utils/ArchiveUtils.js",
        content: ARCHIVE_UTILS_SCRIPT
    },
    {
        id: "XdfRuntime",
        path: "utils/XdfRuntime.js",
        content: XDF_RUNTIME_SCRIPT
    }
];

/** 分组排序权重（未登记的分组排在最后） */
export function groupRank(group: string): number {
    const idx = GROUP_ORDER.indexOf(group);
    return idx === -1 ? GROUP_ORDER.length : idx;
}

/** 按分组归并脚本（分组有序，组内按 id 排序） */
export function groupScripts(
    scripts: XdfScript[] = SCRIPTS
): Array<{ group: string; scripts: XdfScript[] }> {
    const map = new Map<string, XdfScript[]>();
    for (const s of scripts) {
        const list = map.get(s.group);
        if (list) list.push(s);
        else map.set(s.group, [s]);
    }

    return [...map.keys()]
        .sort((a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b, "zh-CN"))
        .map((group) => ({
            group,
            scripts: map
                .get(group)!
                .slice()
                .sort((a, b) => a.id.localeCompare(b.id, "zh-CN"))
        }));
}
