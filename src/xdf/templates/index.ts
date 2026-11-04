/**
 * 模板注册表
 *
 * 源码期模板为真 md 文件（src/xdf/templates/...），esbuild text loader 编译进 main.js。
 * 释放时按镜像树写入 vault：templates/{来源}/档案/{类型}/...
 *
 * 注意：模板路径中的 {archiveName}、{n} 是占位符，由脚本渲染时替换。
 * 空壳文件（Note/Wordlist/Grammar/Homework/Quiz）不进模板，仍由脚本写 content: ""。
 */

import tplClassArchive from "./档案/班课/{archiveName}.md";
import tplClassNav from "./档案/班课/{archiveName}/{archiveName} Lesson {n}/nav.md";
import tplClassFeedback from "./档案/班课/{archiveName}/{archiveName} Lesson {n}/Feedback {n}.md";
import tplVipArchive from "./档案/一对一/{archiveName}.md";
import tplVipNav from "./档案/一对一/{archiveName}/{archiveName} Lesson {n}/nav.md";
import tplVipFeedback from "./档案/一对一/{archiveName}/{archiveName} Lesson {n}/Feedback {n}.md";
import tplMeetingSeasonNav from "./行政工作/周例会/{fy}/{seasonFolderName}/{seasonFolderName}.md";
import tplMeetingHome from "./行政工作/周例会/{fy}/{seasonFolderName}/{date} 第{n}次例会/首页.md";
import tplMeetingRecord from "./行政工作/周例会/{fy}/{seasonFolderName}/{date} 第{n}次例会/会议记录.md";
import tplMeetingResearch from "./行政工作/周例会/{fy}/{seasonFolderName}/{date} 第{n}次例会/教研笔记.md";
import tplMeetingActivityPage from "./行政工作/周例会/{fy}/{seasonFolderName}/{date} 第{n}次例会/活动页.md";

export interface TemplateEntry {
	/** 相对释放路径（含占位符），如 档案/班课/{archiveName}.md */
	relPath: string;
	/** 模板内容 */
	content: string;
}

export const TEMPLATES: TemplateEntry[] = [
	{ relPath: "档案/班课/{archiveName}.md", content: tplClassArchive },
	{ relPath: "档案/班课/{archiveName}/{archiveName} Lesson {n}/nav.md", content: tplClassNav },
	{ relPath: "档案/班课/{archiveName}/{archiveName} Lesson {n}/Feedback {n}.md", content: tplClassFeedback },
	{ relPath: "档案/一对一/{archiveName}.md", content: tplVipArchive },
	{ relPath: "档案/一对一/{archiveName}/{archiveName} Lesson {n}/nav.md", content: tplVipNav },
	{ relPath: "档案/一对一/{archiveName}/{archiveName} Lesson {n}/Feedback {n}.md", content: tplVipFeedback },
	{ relPath: "行政工作/周例会/{fy}/{seasonFolderName}/{seasonFolderName}.md", content: tplMeetingSeasonNav },
	{ relPath: "行政工作/周例会/{fy}/{seasonFolderName}/{date} 第{n}次例会/首页.md", content: tplMeetingHome },
	{ relPath: "行政工作/周例会/{fy}/{seasonFolderName}/{date} 第{n}次例会/会议记录.md", content: tplMeetingRecord },
	{ relPath: "行政工作/周例会/{fy}/{seasonFolderName}/{date} 第{n}次例会/教研笔记.md", content: tplMeetingResearch },
	{ relPath: "行政工作/周例会/{fy}/{seasonFolderName}/{date} 第{n}次例会/活动页.md", content: tplMeetingActivityPage },
];

/** 按相对路径取模板 */
export function getTemplate(relPath: string): string | undefined {
	return TEMPLATES.find((t) => t.relPath === relPath)?.content;
}
