/**
 * XDF: 例会添加页面
 *
 * 释放到 00.SYSTEM/xdf_base/scripts/例会添加页面.js
 *
 * 向某次例会文件夹按需添加特殊页面（赛课/展课/述职/分享/总结汇报），
 * 并把链接追加到该例会首页的「本次会议文件」清单里。
 */

export const MEETING_ADD_PAGE_SCRIPT = String.raw`module.exports = async (params) => {
	const { app, quickAddApi } = params;

	const fs = app.plugins.plugins["xdf-base"].settings.folderStructure;
	const ROOT = ((fs && fs.admin) || "Admin") + "/周例会";

	const PAGES = {
		赛课: ["🏆", ["参赛人", "课题", "评分记录", "结果与点评"]],
		展课: ["📢", ["展示人", "课程与班次", "观摩反馈"]],
		述职: ["📊", ["述职人", "考核周期", "内容纪要", "结果"]],
		分享: ["💡", ["分享人", "主题", "纪要"]],
		总结汇报: ["📈", ["汇报范围", "数据汇总", "纪要"]],
	};

	// ---------- 选择例会 ----------
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
		.reverse();

	if (meetingFiles.length === 0) {
		new Notice("⚠️ 没有任何例会，请先运行「周例会记录」");
		return;
	}

	const homeFile = await quickAddApi.suggester(
		meetingFiles.map((f) => {
			const parts = f.path.split("/");
			return parts[2] + " / " + parts[3] + " / " + parts[4];
		}),
		meetingFiles,
		false,
		"选择例会"
	);
	if (!homeFile) return;

	const meetingFolder = homeFile.parent;
	const meetingName = meetingFolder.name;
	const dateStr = meetingName.slice(0, 10);
	const meetingNumber = Number(meetingName.match(/第(\d+)次例会/)[1]);

	// ---------- 选择页面类型 ----------
	const type = await quickAddApi.suggester(
		Object.keys(PAGES),
		Object.keys(PAGES),
		false,
		"页面类型"
	);
	if (!type) return;
	const pageInfo = PAGES[type];
	const emoji = pageInfo[0];
	const sections = pageInfo[1];

	// ---------- 生成页面 ----------
	const pagePath = meetingFolder.path + "/" + type + ".md";
	if (app.vault.getAbstractFileByPath(pagePath)) {
		new Notice("⚠️ 页面已存在：" + meetingName + "/" + type + ".md");
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
		...sections.flatMap((s) => ["## " + s, "", ""]),
	].join("\n");
	await app.vault.create(pagePath, content);

	// ---------- 首页文件清单追加链接 ----------
	const linkLine = "- [[" + type + "|" + emoji + " " + type + "]]";
	await app.vault.process(homeFile, (text) => {
		if (text.includes(linkLine)) return text;
		const idx = text.indexOf("## ✅ 待办");
		if (idx === -1) return text.trimEnd() + "\n" + linkLine + "\n";
		return text.slice(0, idx) + linkLine + "\n\n" + text.slice(idx);
	});

	new Notice("✅ 已添加：" + meetingName + "/" + type + ".md");
};
`;
