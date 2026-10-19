/**
 * Choice 预设管理（目录驱动分组）
 *
 * 预设 Choice 以「文件夹（Multi Choice）」形式写入 data.json，
 * 文件夹成员完全由 src/xdf/scripts/<分组>/ 决定，不再在代码里硬编码。
 *
 * 每次启动同步（与脚本释放同一覆盖语义）：
 * - 分组文件夹 id 已存在 → 原位重建 children
 * - 存在用户手动建的同名 Multi → 接管（换成预设 id + 重建 children，保留折叠状态和位置）
 * - 已退役的旧条目（xdf-base-* / xdf-panel-*，含旧扁平散落脚本）→ 移除
 * - 已不存在分组的旧文件夹（xdf-group-*）→ 移除
 * - 用户自己创建的 Choice → 完全不动
 */

import { SCRIPTS, groupScripts, type XdfScript } from "./scripts";

const SYSTEM_DIR = "00.SYSTEM/xdf_base";

/** 分组文件夹 id 前缀 */
const FOLDER_PREFIX = "xdf-group-";

/** 脚本单 choice id 前缀（id 后接中文脚本名） */
const CHOICE_PREFIX = "xdf-script-";

/**
 * 已退役的 id 前缀：
 * - xdf-base-*：旧版预设脚本条目 / 旧版固定分组文件夹 / 工具库文件夹
 * - xdf-panel-*：旧版面板脚本条目 / 旧版「面板脚本」文件夹
 */
const RETIRED_ID_PREFIXES = ["xdf-base-", "xdf-panel-"];

interface ScriptFolder {
    id: string;
    name: string;
    scripts: XdfScript[];
}

/** 按源码目录构建分组（每次同步时动态计算） */
function buildFolders(): ScriptFolder[] {
    return groupScripts().map(({ group, scripts }) => ({
        id: `${FOLDER_PREFIX}${group}`,
        name: group,
        scripts
    }));
}

/** 把脚本转成 QuickAdd 的 Macro Choice（内含 UserScript 命令） */
function scriptToChoice(script: XdfScript): any {
    return {
        id: `${CHOICE_PREFIX}${script.id}`,
        name: script.id,
        type: "Macro",
        command: true,
        runOnStartup: false,
        macro: {
            name: script.id,
            id: `xdf-macro-${script.id}`,
            commands: [
                {
                    name: script.id,
                    type: "UserScript",
                    path: `${SYSTEM_DIR}/${script.path}`,
                    settings: {}
                }
            ]
        }
    };
}

/** 构建一个分组文件夹（Multi Choice，children 全量重建） */
function folderToChoice(folder: ScriptFolder, collapsed = false): any {
    return {
        id: folder.id,
        name: folder.name,
        type: "Multi",
        command: false,
        collapsed,
        choices: folder.scripts.map(scriptToChoice)
    };
}

function isRetired(c: any): boolean {
    return (
        typeof c?.id === "string" &&
        RETIRED_ID_PREFIXES.some((p) => c.id.startsWith(p))
    );
}

/** 递归移除列表（含嵌套 Multi children）中的已退役条目 */
function stripRetired(list: any[]): void {
    for (let i = list.length - 1; i >= 0; i--) {
        const c = list[i];
        if (!c) continue;
        if (isRetired(c)) {
            list.splice(i, 1);
            continue;
        }
        if (c.type === "Multi" && Array.isArray(c.choices)) {
            stripRetired(c.choices);
        }
    }
}

/**
 * 同步预设 Choice 文件夹（idempotent，每次启动调用）
 *
 * @param currentChoices 当前 settings.choices（顶层列表）
 */
export function syncPresetChoices(currentChoices: any[] = []): {
    updated: boolean;
    choices: any[];
    added: string[];
    replaced: string[];
} {
    const added: string[] = [];
    const replaced: string[] = [];
    let removedCount = 0;
    const folders = buildFolders();
    const work = [...currentChoices];

    // 1. 记录接管位置：分组文件夹 id 精确匹配，或同名 choice
    //    （用户手动建的 Multi 文件夹 / 旧布局残留在同位置）
    const takeoverIndex = new Map<string, number>();
    work.forEach((c, i) => {
        if (!c) return;
        const folder = folders.find((f) => f.id === c.id || f.name === c.name);
        if (folder && !takeoverIndex.has(folder.id)) {
            takeoverIndex.set(folder.id, i);
        }
    });

    // 2. 退役清理：旧前缀条目、已不存在分组的旧文件夹
    const currentFolderIds = new Set(folders.map((f) => f.id));
    const takeoverSlots = new Set(takeoverIndex.values());
    work.forEach((c, i) => {
        if (!c || takeoverSlots.has(i)) return;
        const staleGroupFolder =
            typeof c.id === "string" &&
            c.id.startsWith(FOLDER_PREFIX) &&
            !currentFolderIds.has(c.id);
        if (isRetired(c) || staleGroupFolder) {
            work[i] = null;
            removedCount++;
        }
    });

    // 3. 嵌套在用户文件夹里的已退役条目直接移除
    for (const c of work) {
        if (c && c.type === "Multi" && Array.isArray(c.choices)) {
            stripRetired(c.choices);
        }
    }

    // 4. 重建文件夹：有接管位 → 原位覆盖；否则追加到末尾
    for (const folder of folders) {
        const rebuilt = folderToChoice(folder);
        const idx = takeoverIndex.get(folder.id);
        if (idx === undefined) {
            work.push(rebuilt);
            added.push(folder.id);
        } else {
            const existing = work[idx];
            rebuilt.collapsed = existing?.collapsed ?? false;
            work[idx] = rebuilt;
            replaced.push(folder.id);
        }
    }

    return {
        updated: added.length > 0 || replaced.length > 0 || removedCount > 0,
        choices: work.filter((c) => c !== null),
        added,
        replaced
    };
}

/** 全部预设脚本 id（供外部识别，不含文件夹） */
export function getPresetScriptIds(): string[] {
    return SCRIPTS.map((s) => `${CHOICE_PREFIX}${s.id}`);
}
