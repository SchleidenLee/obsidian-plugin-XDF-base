/**
 * XDF: 周例会记录
 *
 * 释放到 00.SYSTEM/xdf_base/scripts/周例会记录.js
 *
 * 创建一次例会的三件套（首页 / 会议记录 / 教研笔记），并往半年度导航页追加索引
 */

export const MEETING_RECORD_SCRIPT = String.raw`module.exports = async (params) => {
	const { app, quickAddApi } = params;

	const fs = app.plugins.plugins["xdf-base"].settings.folderStructure;
	const ROOT = ((fs && fs.admin) || "Admin") + "/周例会";

	function nextThursday() {
		const d = new Date();
		const delta = (4 - d.getDay() + 7) % 7;
		d.setDate(d.getDate() + delta);
		return d;
	}
	function fmtDate(d) {
		const p = (n) => String(n).padStart(2, "0");
		return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
	}

	// ---------- 选择半年度导航页 ----------
	const navCandidates = app.vault
		.getMarkdownFiles()
		.filter((f) => f.path.startsWith(ROOT + "/"))
		.filter((f) => {
			const parts = f.path.split("/");
			if (parts.length !== 5) return false;
			const folder = parts[3];
			const stem = parts[4].replace(/\.md$/, "");
			return folder === stem && /(秋季|春季)$/.test(stem);
		})
		.sort()
		.reverse();

	if (navCandidates.length === 0) {
		new Notice("⚠️ 没有任何半年度导航页，请先运行「周例会建档」");
		return;
	}

	const navFile = await quickAddApi.suggester(
		navCandidates.map((f) => {
			const parts = f.path.split("/");
			return parts[2] + " / " + parts[3];
		}),
		navCandidates,
		false,
		"选择半年度"
	);
	if (!navFile) return;

	const seasonFolder = navFile.parent.path;
	const seasonFolderName = navFile.parent.name;
	const fy = navFile.parent.parent.name;
	const season = seasonFolderName.endsWith("秋季") ? "秋季" : "春季";
	const section = season === "秋季" ? 1 : 2;

	// ---------- 会议日期 ----------
	const dateStr = await quickAddApi.datePrompt("会议日期（周四）", {
		dateFormat: "YYYY-MM-DD",
		defaultValue: fmtDate(nextThursday()),
	});
	if (!dateStr) return;

	const m = Number(dateStr.slice(5, 7));
	const calYear = Number(dateStr.slice(0, 4));
	const expectedFolder = calYear + (m >= 7 ? "秋季" : "春季");
	if (expectedFolder !== seasonFolderName) {
		new Notice("⚠️ 所选日期属于「" + expectedFolder + "」，但当前导航页是「" + seasonFolderName + "」，请确认");
	}

	// ---------- 第几次例会 ----------
	const seasonTFolder = app.vault.getAbstractFileByPath(seasonFolder);
	const existing = (seasonTFolder ? seasonTFolder.children : []).filter((c) =>
		/第(\d+)次例会$/.test(c.name)
	);
	const numbers = existing
		.map((c) => Number(c.name.match(/第(\d+)次例会/)[1]))
		.sort((a, b) => b - a);
	const meetingNumber = (numbers[0] || 0) + 1;

	// ---------- 生成三件套 ----------
	const folderName = dateStr + " 第" + meetingNumber + "次例会";
	const folderPath = seasonFolder + "/" + folderName;
	const homePath = folderPath + "/" + folderName + ".md";

	try {
		if (!app.vault.getAbstractFileByPath(folderPath)) {
			await app.vault.createFolder(folderPath);
		}
	} catch (e) {
		new Notice("❌ 创建文件夹失败：" + e);
		return;
	}

	if (app.vault.getAbstractFileByPath(homePath)) {
		new Notice("⚠️ 例会已存在：" + folderName);
		return;
	}

	// 首页
	const homeContent = [
		"---",
		"date: " + dateStr,
		"meeting_number: " + meetingNumber,
		"fiscal_year: " + fy,
		"section: " + section,
		"tags:",
		'  - "#行政"',
		'  - "#周例会"',
		"---",
		"",
		"## 📂 本次会议文件",
		"",
		"- [[会议记录|📋 会议记录]]",
		"- [[教研笔记|🔬 教研笔记]]",
		"",
		"## ✅ 待办",
		"",
		"- [ ] 发送周报到钉钉",
		"",
		"## 📝 备注",
		"",
	].join("\n");
	await app.vault.create(homePath, homeContent);

	// 会议记录
	const recordContent = [
		"---",
		"date: " + dateStr,
		"meeting_number: " + meetingNumber,
		"tags:",
		'  - "#行政"',
		'  - "#周例会"',
		"---",
		"",
		"## 本周工作",
		"",
		"",
		"## 学生情况",
		"",
		"",
		"## 问题与协调",
		"",
		"",
		"## 下周计划",
		"",
	].join("\n");
	await app.vault.create(folderPath + "/会议记录.md", recordContent);

	// 教研笔记
	const researchContent = [
		"---",
		"date: " + dateStr,
		"meeting_number: " + meetingNumber,
		"tags:",
		'  - "#教研"',
		'  - "#周例会"',
		"---",
		"",
		"## 主题",
		"",
		"",
		"## 内容纪要",
		"",
		"",
		"## 要点总结",
		"",
	].join("\n");
	await app.vault.create(folderPath + "/教研笔记.md", researchContent);

	// 导航页追加索引
	const indexLine = "- [[" + seasonFolderName + "/" + folderName + "|📅 第" + meetingNumber + "次例会 · " + dateStr.slice(5) + "]]";
	await app.vault.process(navFile, (text) => {
		if (text.includes(indexLine)) return text;
		return text.trimEnd() + "\n" + indexLine + "\n";
	});

	new Notice("✅ 例会已创建：" + folderName + "（含首页/会议记录/教研笔记）");
};
`;
