/**
 * 模板释放器
 *
 * 双目录策略：
 *   build-in/    每次启动无条件覆盖（保真源码版）
 *   customized/  首次从 build-in 拷贝，此后永不再动
 *
 * 模板 = vault 内 markdown 文件。正文渲染由脚本侧的 ArchiveUtils.loadTemplate 负责，
 * 本模块只负责把模板落到 vault 并维护缓存来源。
 */

import { TEMPLATES } from "./templates";

const SYSTEM_DIR = "00.SYSTEM/xdf_base";
const TPL_DIR = `${SYSTEM_DIR}/templates`;
const BUILD_IN_DIR = `${TPL_DIR}/build-in`;
const CUSTOMIZED_DIR = `${TPL_DIR}/customized`;

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
