/**
 * ⚠️ 由 scripts/auto-manifest.mjs 构建期生成，请勿手改（手改会被下次构建覆盖）。
 *
 * 生成规则（统一释放映射：src/xdf/scripts/<相对路径>/<名>.ts → 00.SYSTEM/xdf_base/scripts/<相对路径>/<名>.js）：
 *   src/xdf/scripts/presets/<分组>/<名>.ts → GENERATED_SCRIPTS（释放 scripts/presets/<分组>/<名>.js）
 *   src/xdf/scripts/assets/<名>.ts         → GENERATED_ASSETS（释放 scripts/assets/<名>.js）
 * 加/删/改脚本：对 presets/、assets/ 里的源文件做增删挪，重新构建即可，无需登记。
 */

import type { GeneratedScript, GeneratedAsset } from "./scriptRegistry";

import { PANEL_HOMEWORK_AI_SCRIPT } from "./presets/文件生成/AI出作业";
import { PANEL_WORDLIST_AI_SCRIPT } from "./presets/文件生成/词表工具";
import { PANEL_ARCHIVE_1ON1_CREATE_SCRIPT } from "./presets/档案管理/一对一建档";
import { PANEL_LESSON_1ON1_RECORD_SCRIPT } from "./presets/档案管理/一对一每课记录";
import { PANEL_ARCHIVE_CLASS_CREATE_SCRIPT } from "./presets/档案管理/班课建档";
import { PANEL_LESSON_CLASS_RECORD_SCRIPT } from "./presets/档案管理/班课每课记录";
import { PANEL_MEETING_ADD_PAGE_SCRIPT } from "./presets/行政工作/例会添加页面";
import { PANEL_MEETING_SETUP_SCRIPT } from "./presets/行政工作/周例会建档";
import { PANEL_MEETING_RECORD_SCRIPT } from "./presets/行政工作/周例会记录";
import { PANEL_NEW_NOTE_SCRIPT } from "./presets/通用/新建笔记";
import { PANEL_APPEND_TO_NOTE_SCRIPT } from "./presets/通用/追加到笔记";
import { ARCHIVE_UTILS_SCRIPT } from "./assets/ArchiveUtils";
import { XDF_RUNTIME_SCRIPT } from "./assets/XdfRuntime";

export const GENERATED_SCRIPTS: GeneratedScript[] = [
	{ group: "文件生成", name: "AI出作业", exportName: "PANEL_HOMEWORK_AI_SCRIPT", content: PANEL_HOMEWORK_AI_SCRIPT },
	{ group: "文件生成", name: "词表工具", exportName: "PANEL_WORDLIST_AI_SCRIPT", content: PANEL_WORDLIST_AI_SCRIPT },
	{ group: "档案管理", name: "一对一建档", exportName: "PANEL_ARCHIVE_1ON1_CREATE_SCRIPT", content: PANEL_ARCHIVE_1ON1_CREATE_SCRIPT },
	{ group: "档案管理", name: "一对一每课记录", exportName: "PANEL_LESSON_1ON1_RECORD_SCRIPT", content: PANEL_LESSON_1ON1_RECORD_SCRIPT },
	{ group: "档案管理", name: "班课建档", exportName: "PANEL_ARCHIVE_CLASS_CREATE_SCRIPT", content: PANEL_ARCHIVE_CLASS_CREATE_SCRIPT },
	{ group: "档案管理", name: "班课每课记录", exportName: "PANEL_LESSON_CLASS_RECORD_SCRIPT", content: PANEL_LESSON_CLASS_RECORD_SCRIPT },
	{ group: "行政工作", name: "例会添加页面", exportName: "PANEL_MEETING_ADD_PAGE_SCRIPT", content: PANEL_MEETING_ADD_PAGE_SCRIPT },
	{ group: "行政工作", name: "周例会建档", exportName: "PANEL_MEETING_SETUP_SCRIPT", content: PANEL_MEETING_SETUP_SCRIPT },
	{ group: "行政工作", name: "周例会记录", exportName: "PANEL_MEETING_RECORD_SCRIPT", content: PANEL_MEETING_RECORD_SCRIPT },
	{ group: "通用", name: "新建笔记", exportName: "PANEL_NEW_NOTE_SCRIPT", content: PANEL_NEW_NOTE_SCRIPT },
	{ group: "通用", name: "追加到笔记", exportName: "PANEL_APPEND_TO_NOTE_SCRIPT", content: PANEL_APPEND_TO_NOTE_SCRIPT },
];

export const GENERATED_ASSETS: GeneratedAsset[] = [
	{ name: "ArchiveUtils", exportName: "ARCHIVE_UTILS_SCRIPT", content: ARCHIVE_UTILS_SCRIPT },
	{ name: "XdfRuntime", exportName: "XDF_RUNTIME_SCRIPT", content: XDF_RUNTIME_SCRIPT },
];
