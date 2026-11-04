/**
 * 模板引擎 + 释放器
 *
 * 双目录策略：
 *   build-in/    每次启动无条件覆盖（保真源码版）
 *   customized/  首次从 build-in 拷贝，此后永不再动
 *
 * 模板 = vault 内 markdown 文件，支持 {{占位符}}；未知占位符报错中止。
 * 镜像结构：模板相对路径 ↔ 生成物相对路径同构。
 */

import { TEMPLATES, getTemplate } from "./templates";

const SYSTEM_DIR = "00.SYSTEM/xdf_base";
const TPL_DIR = `${SYSTEM_DIR}/templates`;
const BUILD_IN_DIR = `${TPL_DIR}/build-in`;
const CUSTOMIZED_DIR = `${TPL_DIR}/customized`;

export type TemplateSource = "build-in" | "customized";

export interface RenderContext {
	archiveName: string;
	courseType: string;
	subject: string;
	lessonNumber: number;
	isoDate: string;
	month: number;
	day: number;
	students?: string[];
	studentRows?: string;
	personBlocks?: string;
	navTitle?: string;
	homeworkLabel?: string;
	homeworkBlock?: string;
	noteName?: string;
	wordlistName?: string;
	grammarName?: string;
	homeworkName?: string;
	quizName?: string;
	feedbackName?: string;
	[key: string]: string | number | string[] | undefined;
}

/** 渲染模板：替换 {{key}}，未知 key 抛错 */
export function renderTemplate(template: string, ctx: RenderContext): string {
	const re = /\{\{([a-zA-Z0-9_]+)\}\}/g;
	let result = template;
	let match: RegExpExecArray | null;

	while ((match = re.exec(template)) !== null) {
		const key = match[1];
		const value = ctx[key];
		if (value === undefined) {
			throw new Error(`模板占位符未知：{{${key}}}`);
		}
		result = result.replace(match[0], String(value));
	}
	return result;
}

/** 渲染路径中的占位符 */
export function renderPath(relPath: string, ctx: RenderContext): string {
	return relPath
		.replace(/\{archiveName\}/g, ctx.archiveName)
		.replace(/\{n\}/g, String(ctx.lessonNumber));
}

/** 从 vault 读模板文件 */
export async function readTemplateFile(
	app: any,
	relPath: string,
	source: TemplateSource
): Promise<string> {
	const dir = source === "build-in" ? BUILD_IN_DIR : CUSTOMIZED_DIR;
	const fullPath = `${dir}/${relPath}`;
	const exists = await app.vault.adapter.exists(fullPath);
	if (!exists) {
		throw new Error(`缺模板文件：${fullPath}`);
	}
	return await app.vault.adapter.read(fullPath);
}

/** 释放所有模板到 vault */
export async function releaseTemplates(app: any): Promise<void> {
	// 1. build-in：无条件覆盖
	for (const tpl of TEMPLATES) {
		const path = `${BUILD_IN_DIR}/${tpl.relPath}`;
		await ensureDir(app, path.substring(0, path.lastIndexOf("/")));
		if (await app.vault.adapter.exists(path)) {
			await app.vault.adapter.write(path, tpl.content);
		} else {
			await app.vault.create(path, tpl.content);
		}
	}

	// 2. customized：逐文件补漏——缺失的从 build-in 拷入，已存在的不动
	//    （首启全量拷入；后续启动只补新模板/丢失文件，用户改动永不覆盖）
	for (const tpl of TEMPLATES) {
		const src = `${BUILD_IN_DIR}/${tpl.relPath}`;
		const dst = `${CUSTOMIZED_DIR}/${tpl.relPath}`;
		if (!(await app.vault.adapter.exists(dst))) {
			await ensureDir(app, dst.substring(0, dst.lastIndexOf("/")));
			await app.vault.adapter.copy(src, dst);
		}
	}
}

async function ensureDir(app: any, path: string): Promise<void> {
	if (await app.vault.adapter.exists(path)) return;
	const parent = path.substring(0, path.lastIndexOf("/"));
	if (parent) await ensureDir(app, parent);
	await app.vault.adapter.mkdir(path);
}
