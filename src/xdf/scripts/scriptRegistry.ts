/**
 * XDF 内置脚本/资产清单（装配层）
 *
 * 约定：**源码目录即释放路径**（统一映射，业务/资产无特殊分支）。
 *   src/xdf/scripts/presets/<分组>/<名>.ts → 00.SYSTEM/xdf_base/scripts/presets/<分组>/<名>.js
 *   src/xdf/scripts/assets/<名>.ts         → 00.SYSTEM/xdf_base/scripts/assets/<名>.js
 *
 * - 脚本 id = 文件名（去 .ts）= 释放文件名 = 面板 id = QuickAdd 菜单名
 * - 分组 = presets/ 下的文件夹名；成员/清单由构建期 scripts/auto-manifest.mjs
 *   自动扫描生成（manifest.generated.ts），新增脚本把 .ts 放进分组文件夹重新构建即可，无需登记
 * - esbuild 不支持 import.meta.glob，清单必须在打包期生成
 */

import { GENERATED_SCRIPTS, GENERATED_ASSETS } from "./manifest.generated";

/** 分组展示顺序（只决定顺序，不决定成员；未列出的分组排在最后按名称排序） */
export const GROUP_ORDER = ["档案管理", "文件生成", "行政工作", "通用"];

/** manifest.generated.ts 中单条脚本数据（由 auto-manifest.mjs 生成的形状） */
export interface GeneratedScript {
    /** 分组 = presets/ 下的文件夹名 */
    group: string;
    /** 脚本名 = 文件名（不含 .ts），同时是 id / 面板 id / QuickAdd 菜单名 */
    name: string;
    /** 源文件内唯一的导出名（XXX_SCRIPT） */
    exportName: string;
    content: string;
}

/** manifest.generated.ts 中单条资产数据 */
export interface GeneratedAsset {
    name: string;
    exportName: string;
    content: string;
}

export interface XdfScript {
    /** 脚本 id（= 文件名），同时是面板 id 与 QuickAdd 菜单名 */
    id: string;
    /** 释放路径（相对 00.SYSTEM/xdf_base/）：scripts/presets/<分组>/<id>.js */
    path: string;
    /** 所属分组（presets/ 下的文件夹名） */
    group: string;
    /** 脚本内容 */
    content: string;
}

export interface XdfAsset {
    /** 资产 id（= 文件名） */
    id: string;
    /** 释放路径（相对 00.SYSTEM/xdf_base/）：scripts/assets/<id>.js */
    path: string;
    content: string;
}

export const SCRIPTS: XdfScript[] = GENERATED_SCRIPTS.map((s) => ({
    id: s.name,
    path: `scripts/presets/${s.group}/${s.name}.js`,
    group: s.group,
    content: s.content
}));

export const ASSETS: XdfAsset[] = GENERATED_ASSETS.map((a) => ({
    id: a.name,
    path: `scripts/assets/${a.name}.js`,
    content: a.content
}));

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
