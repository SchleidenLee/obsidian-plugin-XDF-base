/**
 * XDF: 例会添加页面（测试版，手动装载）
 *
 * 作用：向某次例会文件夹按需添加特殊页面（赛课/展课/述职/分享/总结汇报），
 *       并把链接追加到该例会首页的「本次会议文件」清单里
 * 位置：00.SYSTEM/test/XDF例会添加页面.js
 * 装载：QuickAdd 设置 → 添加 Macro Choice → 添加 UserScript 命令 → 选择本文件
 *
 * 说明：会议记录/教研笔记由「周例会记录」脚本默认生成；本脚本只负责特殊页面。
 */

module.exports = async (params) => {
	const { app, quickAddApi } = params;

	const fs = app.plugins.plugins["xdf-base"].settings.folderStructure;
	const ROOT = ((fs && fs.admin) || "Admin") + "/周例会";

	// 特殊页面类型 → [emoji, 模板栏目]
	const PAGES = {
		赛课: ["🏆", ["参赛人", "课题", "评分记录", "结果与点评"]],
		展课: ["📢", ["展示人", "课程与班次", "观摩反馈"]],
		述职: ["📊", ["述职人", "考核周期", "内容纪要", "结果"]],
		分享: ["💡", ["分享人", "主题", "纪要"]],
		总结汇报: ["📈", ["汇报范围", "数据汇总", "纪要"]],
	};

	// ---------- 选择例会（结构：ROOT/FYxx/2026秋季/2026-xx-xx 第N次例会/同名.md） ----------
	const meetingFiles = app.vault
		.getMarkdownFiles()
		.filter((f) => f.path.startsWith(ROOT + "/"))
		.filter((f) => {
			const parts = f.path.split("/");
			if (parts.length !== 6) return false;
			const folder = parts[4];
			const stem = parts[5].replace(/\.md$/, "");
			return folder === stem && /第\d+次例会$/.test(folder);
		})
		.sort()
		.reverse(); // 新的在前

	if (meetingFiles.length === 0) {
		new Notice("⚠️ 没有任何例会，请先运行「周例会记录」");
		return;
	}

	const homeFile = await quickAddApi.suggester(
		meetingFiles.map((f) => {
			const parts = f.path.split("/");
			return `${parts[2]} / ${parts[3]} / ${parts[4]}`;
		}),
		meetingFiles,
		false,
		"选择例会"
	);
	if (!homeFile) return;

	const meetingFolder = homeFile.parent; // 2026-09-03 第3次例会
	const meetingName = meetingFolder.name;
	const dateStr = meetingName.slice(0, 10); // 文件夹名以 YYYY-MM-DD 开头
	const meetingNumber = Number(meetingName.match(/第(\d+)次例会/)[1]);

	// ---------- 选择页面类型 ----------
	const type = await quickAddApi.suggester(
		Object.keys(PAGES),
		Object.keys(PAGES),
		false,
		"页面类型"
	);
	if (!type) return;
	const [emoji, sections] = PAGES[type];

	// ---------- 生成页面 ----------
	const pagePath = `${meetingFolder.path}/${type}.md`;
	if (app.vault.getAbstractFileByPath(pagePath)) {
		new Notice(`⚠️ 页面已存在：${meetingName}/${type}.md`);
		return;
	}

	const content = [
		"---",
		"date: " + dateStr,
		"meeting_number: " + meetingNumber,
		"type: " + type,
		"tags:",
		'  - "#行政"',
		'  - "#周例会"',
		"---",
		"",
		...sections.flatMap((s) => [`## ${s}`, "", ""]),
	].join("\n");
	await app.vault.create(pagePath, content);

	// ---------- 首页文件清单追加链接 ----------
	const linkLine = `- [[${type}|${emoji} ${type}]]`;
	await app.vault.process(homeFile, (text) => {
		if (text.includes(linkLine)) return text; // 幂等
		// 插到「## ✅ 待办」之前
		const idx = text.indexOf("## ✅ 待办");
		if (idx === -1) return text.trimEnd() + "\n" + linkLine + "\n";
		return text.slice(0, idx) + linkLine + "\n\n" + text.slice(idx);
	});

	new Notice(`✅ 已添加：${meetingName}/${type}.md`);
};
