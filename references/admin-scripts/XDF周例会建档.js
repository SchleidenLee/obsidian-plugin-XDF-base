/**
 * XDF: 周例会建档
 *
 * 作用：创建半年度导航页 + 同步创建「总结会」（每学期第一次会议）
 * 装载：QuickAdd 设置 → 行政工作 → XDF: 周例会建档
 *
 * 财年规则：每年 7 月开始新财年（FY27 = 2026-07 ~ 2027-06）
 *   - Section 1 = 秋季（7~12月）；Section 2 = 春季（1~6月）
 *   - 文件夹带日历年：FY27/2026秋季（2026-07~12）、FY27/2027春季（2027-01~06）
 *
 * 结构：
 *   {admin}/周例会/FY27/2026秋季/2026秋季.md          ← 导航页
 *   {admin}/周例会/FY27/2026秋季/2026-09-03 总结会/    ← 建档时同步创建
 *     2026-09-03 总结会.md                             ← 首页
 *     会议记录.md
 *     教研笔记.md
 */

module.exports = async (params) => {
	const { app, quickAddApi } = params;

	const fs = app.plugins.plugins["xdf-base"].settings.folderStructure;
	const ROOT = ((fs && fs.admin) || "Admin") + "/周例会";

	function deriveFiscalYear(d) {
		const y = d.getFullYear();
		const m = d.getMonth() + 1;
		return m >= 7 ? y + 1 : y;
	}
	function fyLabel(year) {
		return `FY${String(year % 100).padStart(2, "0")}`;
	}
	function parseFy(fyStr) {
		return { startYear: 2000 + Number(fyStr.slice(2)) };
	}

	// ---------- 输入 ----------
	const now = new Date();
	const defaultFy = fyLabel(deriveFiscalYear(now));
	const defaultSeason = now.getMonth() + 1 >= 7 ? "秋季" : "春季";

	const fy = await quickAddApi.inputPrompt("财年（每年7月开始新财年）", defaultFy, defaultFy);
	if (!fy) return;

	const season = await quickAddApi.suggester(
		["秋季（7~12月）= Section 1", "春季（1~6月）= Section 2"],
		["秋季", "春季"],
		false,
		`选择半年周期（默认 ${defaultSeason}）`
	);
	if (!season) return;

	// ---------- 路径：{admin}/周例会/FY27/2026秋季/2026秋季.md ----------
	const { startYear } = parseFy(fy);
	const section = season === "秋季" ? 1 : 2;
	const calendarYear = season === "秋季" ? startYear : startYear + 1;
	const seasonFolderName = `${calendarYear}${season}`;
	const seasonFolder = `${ROOT}/${fy}/${seasonFolderName}`;
	const navPath = `${seasonFolder}/${seasonFolderName}.md`;

	try {
		for (const dir of [ROOT, `${ROOT}/${fy}`, seasonFolder]) {
			if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
		}
	} catch (e) {
		new Notice("❌ 创建文件夹失败：" + e);
		return;
	}

	if (app.vault.getAbstractFileByPath(navPath)) {
		new Notice(`⚠️ 导航页已存在：${navPath}`);
		return;
	}

	const content = [
		"---",
		"fiscal_year: " + fy,
		"section: " + section,
		"starting_date: " + (season === "秋季" ? `${startYear}-07-01` : `${startYear + 1}-01-01`),
		"ending_date: " + (season === "秋季" ? `${startYear}-12-31` : `${startYear + 1}-06-30`),
		"tags:",
		'  - "#行政"',
		'  - "#周例会"',
		"---",
		"",
		"## 📌 本学期任务与侧重点",
		"",
		"",
		"## 📚 会议索引",
		"",
	].join("\n");

	try {
		await app.vault.create(navPath, content);
		new Notice(`✅ 周例会导航页已创建：${navPath}`);
	} catch (err) {
		new Notice("❌ 创建失败：" + err);
	}

	// ---------- 同步创建「总结会」（每学期第一次会议） ----------
	function fmtDate(d) {
		const p = (n) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
	}
	function nextThursday() {
		const d = new Date();
		const delta = (4 - d.getDay() + 7) % 7;
		d.setDate(d.getDate() + delta);
		return d;
	}

	const summaryDate = await quickAddApi.datePrompt("总结会日期（默认下个周四）", {
		dateFormat: "YYYY-MM-DD",
		defaultValue: fmtDate(nextThursday()),
	});
	if (!summaryDate) return;

	const summaryFolderName = `${summaryDate} 总结会`;
	const summaryFolderPath = `${seasonFolder}/${summaryFolderName}`;
	const summaryHomePath = `${summaryFolderPath}/${summaryFolderName}.md`;

	if (app.vault.getAbstractFileByPath(summaryHomePath)) {
		new Notice(`⚠️ 总结会已存在：${summaryFolderName}`);
		return;
	}

	try {
		await app.vault.createFolder(summaryFolderPath);
	} catch (e) {
		new Notice("❌ 创建总结会文件夹失败：" + e);
		return;
	}

	// 首页
	const summaryHome = [
		"---",
		"date: " + summaryDate,
		"meeting_number: 1",
		"fiscal_year: " + fy,
		"section: " + section,
		"tags:",
		'  - "#行政"',
		'  - "#周例会"',
		'  - "#总结会"',
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
	await app.vault.create(summaryHomePath, summaryHome);

	// 会议记录
	const summaryRecord = [
		"---",
		"date: " + summaryDate,
		"meeting_number: 1",
		"tags:",
		'  - "#行政"',
		'  - "#周例会"',
		'  - "#总结会"',
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
	await app.vault.create(`${summaryFolderPath}/会议记录.md`, summaryRecord);

	// 教研笔记
	const summaryResearch = [
		"---",
		"date: " + summaryDate,
		"meeting_number: 1",
		"tags:",
		'  - "#教研"',
		'  - "#周例会"',
		'  - "#总结会"',
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
	await app.vault.create(`${summaryFolderPath}/教研笔记.md`, summaryResearch);

	// 导航页追加索引
	const summaryIndexLine = `- [[${seasonFolderName}/${summaryFolderName}|📅 总结会 · ${summaryDate.slice(5)}]]`;
	await app.vault.process(navPath, (text) => {
		if (text.includes(summaryIndexLine)) return text;
		return text.trimEnd() + "\n" + summaryIndexLine + "\n";
	});

	new Notice(`✅ 导航页 + 总结会已创建：${summaryFolderName}`);
};
