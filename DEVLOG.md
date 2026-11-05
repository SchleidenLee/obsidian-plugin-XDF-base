# DEVLOG — XDF Base

> 变更时间线，**只追加不回改**。每条：日期 + 改了什么 + **为什么**。
> 面向"人肉可读的历史决策"；面向用户的 Release 说明由流水线自动生成，此处不重复。

---

## 2026-11-05 · 移除 CI / CodeQL / 依赖审查 / PR 标题工作流，只保留 Release

- 删除 `.github/workflows/` 下 `ci.yml`、`codeql.yml`、`dependency-review.yml`、`pr-title.yml`，只留 `release.yml`。
- **为什么**：单人开发直接推 main、不走 PR —— `dependency-review` 与 `pr-title` 只在 PR 触发，永不运行；`codeql` 对本地桌面插件收益极低；`ci.yml` 连续 6 次失败无人处理，已成噪音。本地 `pnpm build` 已覆盖 tsc，`release.yml` 自身含 Build 步骤，发布链路不缺兜底。

---

## 2026-10-31 · 模板释放层收口（删除重复渲染实现 + 写盘前预渲染）

- **TplEngine 瘦身为纯释放器**：删除无引用的 `renderTemplate` / `renderPath` / `readTemplateFile` / `getTemplate` 与 `RenderContext` 类型。正文渲染的唯一实现留在 `ArchiveUtils.loadTemplate`，避免以后改占位符规则时改到没人调用的那份。
- **改用「先渲染、后动盘」**：`周例会建档`、`周例会记录`、`一对一建档`、`班课建档` 以及 `ArchiveUtils.writeLessonPackage`（覆盖一对一/班课每课记录）把模板渲染提前到 `createFolder` / `ensureFolder` 之前。原先占位符写错时目录已经建好，会留下空壳残留；现在渲染失败时一个文件都不创建。
- **为什么**：模板正文由用户随时手改，占位符拼错是高频风险；运行时虽已 fail-closed 抛「未知占位符」，但报错发生在写盘之后，会留脏数据。
- **待定**：周例会目录命名与路径占位符方案记入 `PENDING.md` E 项。
- **验证**：WSL `pnpm build` 通过（`tsc -noEmit` 无错误，8 脚本 + 2 资产正常生成）。

---

## 2026-11-04 · duowei 学员表全量入库（Schema v3：student_profile + 结班测成绩 + .duowei 增量同步）

- **Schema（[Schema.ts](./src/xdf/db/Schema.ts)）**：`SCHEMA_VERSION` 2→3。新增 `student_profile` 表（主键 `student_id`，FK → `students(id) ON DELETE CASCADE`），9 列：`ielts_needed / target_score / exam_date / exam_score / education_level / education_status / school / english_level / notes`；`class_roster` 新增 `final_exam_score REAL`。迁移沿用「版本不匹配 → 清空重建」（vault 是 source of truth）。
- **数据归属拆分**：duowei 12 列按语义分两类——学员全局属性（f2~f9、f12）进 `student_profile`，与课程/班级绑定的 f11「结班测成绩」进 `class_roster.final_exam_score`，f10「已上课程」不落库（`class_roster` JOIN `archives` 可算出）。
- **解析（[Parser.ts](./src/xdf/db/Parser.ts)）**：新增纯函数 `parseDuoweiRoster(content)`：字段映射优先按 `fields[].name` 中文列名、回退 `f1`~`f12`（列顺序调整/改 id 不影响）；未填字段返回 `null`、checkbox `false` → `0`；非法 JSON 返回空数组不抛异常。
- **写库（[Builder.ts](./src/xdf/db/Builder.ts)）**：`writeArchive` 读 duowei 行；班课写 `class_roster.final_exam_score` + `student_profile`，一对一取本人行写 `student_profile`。新增 `upsertStudentProfile`，采用**非空增量 upsert**（`COALESCE(excluded.x, student_profile.x)`，文本再套 `NULLIF(...,'')`）：跨班课同步时空值不覆盖已有数据，整行全空不建行。duowei 缺失（回退 md 表格）时保留 `class_roster` 已有结班测成绩，避免档案页重写抹掉成绩。旧 `parseStudentsFromDuowei` 删除，统一走 `parseDuoweiRoster`。
- **同步（[Sync.ts](./src/xdf/db/Sync.ts)）**：`snapshotOf` 把 `.duowei` 与 `.md` 同等视为文本；`.duowei` 变更时经 `archivePathOfDuowei` 反推档案页路径并入 upsert 集合，连带重写档案（名单/属性/成绩统一由档案写入路径落库）。此前 `.duowei` 被标 binary、单独改动不触发任何 DB 更新。
- **为什么**：duowei 已是学员信息唯一来源，但 DB 镜像只同步了姓名；学校/年级/目标分等无法查询。拆分全局属性与课程绑定属性的原因是「学校/程度跨班课不变」而「结班测成绩属于某期课程」，混在一张表会互相覆盖。
- **验证**：WSL `vitest.xdf.config.mts` 全量重建测试 vault（4501 文件 / 63 档案 / 571 课次 / 301 学员，0 错误）：`student_profile` 正常落库；把某学员 duowei 的「学校」清空后重写档案，值保留，改非空则覆盖。`Parser.test.ts` 新增 `parseDuoweiRoster` 4 组用例（列名映射 / 空值 null / 改列名与无 fields 回退 / 非法 JSON）。注：`Builder.test.ts` 依赖的 `obsidian-plugin/Reference/current class` 目录不存在，该套件在本环境下无法运行（既有问题，与本次改动无关）。

---

## 2026-11-04 · 测试项目（refined）合并回主项目 → v1.5.0

- **合并来源**：`Test/base-refined/`（xdf-base-refined）→ 主项目 `obsidian-plugin-XDF-base`（xdf-base）。diff 清单驱动回写：37 个身份字面量文件批量替换 `xdf-base-refined`→`xdf-base`；测试独有文件（TplEngine.ts、templates/ 目录、DB 实体化改动）直接拷入；正式项目独有文件（AI出作业.ts、presets/通用/）按用户指示删除不保留。回滚锚 tag `pre-merge-refined` 打在合并前的 1.4.14。
- **合并内容**：DB 实体化（students/attendance/homework 表、Schema v2）、duowei 学员名单接入（Builder/Sync 读 duowei）、模板释放引擎（TplEngine + templates/ 目录）、Feedback 面板锚点渲染修复（Pass 0 补空行）、collectVaultFiles 把 .duowei 识别为文本快照、档案模板占位符单花括号→双花括号。
- **部署验证**：测试 vault 实测通过——class_roster 305 行 / 37 班全覆盖，students 305、attendance 408、homework 315；面板样式修复（根 styles.css 是旧文件，部署时须取 dist/styles.css）。
- **发布**：bump 1.4.14 → 1.5.0，tag v1.5.0，GitHub Release 流水线自动生成（main.js / manifest.json / styles.css 三件）。
- **已知遗留**：styles.css 根目录文件（38802 字节，9/18 旧版）与 dist/styles.css（41617 字节，编译新版）不一致——根文件未维护，部署只取 dist 产物。后续考虑删除根 styles.css 避免误用。

---

## 2026-11-04 · DB 学员名单数据源收敛（Phase 3：md 表格 → duowei）

- [Builder.ts](./src/xdf/db/Builder.ts)：`DBWriter` 新增 `duoweiContents` Map 和 `registerDuowei()` 方法；`rebuildAll()` 扫描 vault 时识别 `*学员表.duowei` 文件并建立 `archivePath → content` 映射；`writeArchive()` 优先从 duowei 读学员名单（`parseStudentsFromDuowei`），回退到旧的 md 表格解析（`parseStudentsFromBody`）。新增 `parseStudentsFromDuowei()` 函数：JSON 解析 duowei 文件，提取 `records[].values.f1`（姓名字段）。
- [Sync.ts](./src/xdf/db/Sync.ts)：增量同步时，档案页变更前先读对应的 `{档案名}学员表.duowei` 文件，调用 `writer.registerDuowei()` 传给 writer。
- **为什么**：11-03 学员表改造后，档案首页的 `## 👥 学员信息` 从 md 表格换成 `![[{班号}学员表.duowei]]` 嵌入，`parseStudentsFromBody()` 解析 md 表格的逻辑失效（返回空数组），导致 `class_roster` 表写不进学员数据。本次改动让 DB 同步直接读 duowei 文件，`class_roster` 数据源从 md 表格收敛到 duowei，与脚本侧（`parseStudentsFromArchive` 已改读 duowei）对齐。回退兼容保留：duowei 文件不存在时仍尝试解析 md 表格（兼容未迁移的存量档案）。
- **实测修正（同日）**：清库重建后 `class_roster` 仍为 0 行——根因在 `collectVaultFiles()`：只有 `.md` 被当文本读内容，`.duowei` 落入 else 分支标记 `binary: true` 且 content 为空串，`rebuildAll()` 的 duowei 扫描被 `!f.binary` 全数滤掉。修复：`collectVaultFiles` 把 `.duowei` 与 `.md` 同等对待（读全文、不标 binary）。重建验证：class_roster 305 行 / 37 班全覆盖，1111（张三/李四/王五）等名单与 duowei 一致；students 305、attendance 408、homework 315（280 个班课 Feedback 面板 checkbox 全部入库）。
- 同日修复：档案模板「## 👥 学员信息」的嵌入写的是单花括号 `![[{archiveName}学员表.duowei]]`，而模板渲染契约是 `{{双花括号}}`，占位符原样落盘导致嵌入引用失效；两个档案模板改为 `{{archiveName}}`，已生成的 1111/刘柏征档案页手工替换为真实班号。

---

## 2026-11-03 · 学员表改造（md 表格 → duowei 多维表格，Phase 1/2 落地）

- **模板**：[班课/{archiveName}.md](./src/xdf/templates/档案/班课/{archiveName}.md) 与 [一对一/{archiveName}.md](./src/xdf/templates/档案/一对一/{archiveName}.md) 的「## 👥 学员信息」改为嵌入 `![[{archiveName}学员表.duowei]]`；duowei 与档案页**同目录**（路径 = `{班号}学员表.duowei`，班号命名避免 basename 歧义）。[ArchiveUtils.ts](./src/xdf/scripts/assets/ArchiveUtils.ts) 的 `buildArchiveBody` 改读模板文件（`loadTemplate`），旧 md 表格拼装逻辑删除。
- **锁版 schema**：ArchiveUtils 侧新增 `ROSTER_FIELDS`（12 字段：姓名 / IELTS需求(checkbox) / 目标分数 / 考试时间(date) / 考试成绩 / 受教育程度+受教育状态(原「年级」拆分) / 学校 / 英语程度 / 已上课程(multiSelect) / 结班测成绩 / 备注）、生成器 `buildRosterDuoweiDoc`（grid 视图 + colorRules「IELTS需求=true 整行绿」+ 单格居中）与 `rosterDuoweiPath`；原始 22 字段类型与 normalize 容错结论经 duowei-table 源码（main.js）实证。
- **建档脚本**：[班课建档.ts](./src/xdf/scripts/presets/档案管理/班课建档.ts) / [一对一建档.ts](./src/xdf/scripts/presets/档案管理/一对一建档.ts) execute 末尾追加「只建不覆」写 `{班号}学员表.duowei`（`writeIfNotExists`）。
- **读侧**：`parseStudentsFromArchive` 重写为 async 且只读 duowei（**按字段名找 id**，不依赖具体 fld 编号；md 表格解析函数删除）；唯一调用点 [班课每课记录.ts](./src/xdf/scripts/presets/档案管理/班课每课记录.ts) 同步改 await。**注意：db/Builder 的 class_roster 数据源（md 表格）已失效，Phase 3 收敛见 PENDING。**
- **存量迁移**：一次性脚本（项目外、非 preset）已对测试 vault 执行并验证：26 个班课/一对一档案全部换嵌入 + 生成标准 duowei；3440 的手调样张 `学员表.duowei` 改名为 `3440学员表.duowei` 保留数据。**随后按用户要求二次调整**：旧 md 表格当初写得不规范，脚本解析出的历史列数据不可信 → 已把所有生成器格式的 duowei 重置为「仅保留姓名行、其余字段全空」，数据由用户手动补录；3440 手调文件（插件 normalize 格式）不动。存量 Feedback 页是旧版生成的、本就没有「学员状态面板」头部（块锚 ^att-n/^hw-n 也不存在），不在迁移范围。
- **改名**：Feedback 头部「✅ 快速点选」区更名「🎯 学员状态面板」（`buildClassFeedback` 的 strip 约定同步）。
- **为什么**：md 表格无法承载选项/勾选/条件着色，读写都靠脆弱的正则；duowei 承载学员全局信息，嵌入进档案页即可视可编辑，脚本侧仍按姓名取名单。嵌入渲染器缺 colorRules/cellStyles/headerStyle 属 duowei-table 插件限制，已立补丁条目（PENDING）。

---

## 2026-11-03 · DB 实体化改造（学员 → 一等实体）

- [Schema.ts](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/db/Schema.ts)：SCHEMA_VERSION 1→2；students 表加 `student_code TEXT`（可选友好编号）；sections/checkboxes 表加 `student_id TEXT REFERENCES students(id)`；新建 `attendance` 表（student_id + lesson_id + status，UNIQUE 约束）和 `homework` 表（student_id + lesson_id + submitted，UNIQUE 约束）。migrate() 改为版本不匹配时清空重建（不做数据迁移，vault 是 source of truth）。
- [Parser.ts](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/db/Parser.ts)：新增 `AttendanceDraft`/`HomeworkDraft` 类型和 `parseAttendance()`/`parseHomework()` 函数，从 `#### 出勤`/`#### 作业情况` heading 下解析 inline checkbox，提取学员名（heading_path 首段去 emoji）和勾选状态。`parseFile()` 返回值加 `attendance`/`homework` 字段。
- [Builder.ts](file:///x:/AI/projects/XDF-obsidian-system/Test/base-refined/src/xdf/db/Builder.ts)：新增 `getStudentIdByName()`（从内存缓存/class_roster/students 表三级查 student_id）和 `extractStudentNameFromPath()`（heading_path 首段提取学员名）。sections/checkboxes INSERT 加 student_id 字段。新增 `writeAttendance()`/`writeHomework()`，Feedback 文件入库时调用，按语义写入新表。
- **为什么**：原设计查询靠拼 heading 字符串（`section_path LIKE '%张三%出勤%'`），脆弱且慢。实体化后查询变成 `WHERE student_id = ? AND lesson_id = ?`，精确且快。改名问题靠合并 student 记录解决（手动或脚本辅助），重名问题暂不处理（概率太低）。vault 结构不变（脚本生成的模板），Parser 适配固定结构。

---

## 2026-10-28 · `api.db` 门面收紧为纯只读（引擎级 query_only 硬闸）

- [db/Connection.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Connection.ts)：连接**默认锁死** `PRAGMA query_only=ON`（`initialize()` / `clear()` 新建库后立即上锁，fail-closed）；`exec()` 内部「开锁 → 执行 → finally 上锁」，写权限只在 exec 那一瞬间存在；`query()` 零改动，运行在默认只读态。[db/index.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/index.ts)：`XdfDBApi` 门面删 `exec` / `rebuild` / `setSyncEnabled`，仅留 `query` / `status` / `isSyncEnabled`；[main.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/main.ts) 与 [XdfBaseExtension.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/XdfBaseExtension.ts) 的「v1.0.0 契约：query/exec/rebuild/status」注释同步为只读契约。新增 [Connection.test.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/db/Connection.test.ts) 5 例（exec 窗口可写 / query 裸 DELETE 被拒 / CTE-DML 被拒 / 拒绝后锁不漏 / exec 抛错后锁回得上）。
- **为什么**：DB 的设计定位就是 vault 的只读镜像——数据修改只发生在 md，由内部 Sync/Builder 回灌，外部经 `api.db` 写库本就不该是合法路径。toolkits 侧 A1（`query_db` 假只读：文本黑名单可被 `WITH ... DELETE` 型 CTE-DML 绕过）的根治点在这层：sql.js 不暴露 authorizer/stmt_readonly，`query_only` 是引擎能给的唯一硬闸，比文本审查可靠。影响面核实为零：门面消费者（ArchiveUtils 脚本、toolkits db.ts）只用 `query`+`status`；内部写路径直调 `DBConnection` 不走门面，Sync 的 500ms debounce + 2s 节流回灌全在 exec 合法窗口内。附带发现：当前 sql.js 内置 SQLite 连 `DELETE RETURNING` 语法都不支持（语法层即拒），硬闸是双保险。
- 遗留（toolkits 侧配套）：base 发新版后 toolkits 提最低依赖版本、`query_db` 黑名单简化为透传引擎报错。

---

## 2026-10-22 · 脚本面板：折叠分组菜单 + 扫描来源设置

- [XdfScriptPanelView.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/xdf/panel/XdfScriptPanelView.ts) 的 `<select>` 换成自渲染折叠分组列表（组头点击折叠/展开、条目点击选中高亮、折叠态仅内存）；扫描改为多根：内置 `00.SYSTEM/xdf_base/scripts/presets/` 写死不可关 + 设置页「脚本面板扫描来源」（`xdfPanelScriptSources: string[]`，每行一个 vault 目录，[settings.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/settings.ts) 新增、[quickAddSettingsTab.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-base/src/quickAddSettingsTab.ts) XDF 区块多行文本框）。**扫描根名永不显示**：分组 = 根内第一层子目录名，根级散装归「其他」，跨来源同组合并，重名 presets 优先；来源不存在静默跳过；只影响面板，释放器与 QuickAdd 菜单不读。
- **为什么**：目录重组后释放路径多出 `presets/` 结构层，旧「相对 scripts/ 取第一段」的分组全显示为 presets；且下拉不体现分组层级。老师需要自定义脚本目录进面板但不想污染内置释放，故扫描来源做成设置项，内置根写死保底。
- 追加修复（同日实测反馈，两轮）①交互定型为**两段式选择器**：收起态只有一行触发条（显示当前选中脚本名、不带组名，其他组完全隐藏），点击才打开全量分组选择界面（组头可折叠），选完自动收回显示新选中项——第一版做成「默认全折叠 + 选中组自动展开」不符合需求，被实测推翻；②挤压消失：`.xdf-panel-tree` 展开态加 `flex: 0 1 auto` + `min-height: 90px`（overflow 容器在 flex 列里自动最小尺寸按 0 算，面板矮时被整个挤掉），收起态 `is-collapsed` 不占保底高度。

---

## 2026-10-22 · 脚本目录重组（presets/assets 分层 + prebuild 自动清单 + 统一释放映射）

- 从 v1.4.12（7c3a2a6）回溯重做（上一轮重组因移动命令误操作丢文件，弃抢救、整轮回滚）：业务脚本移入 `src/xdf/scripts/presets/<分组>/`，共享资产移入 `assets/`（[ArchiveUtils.ts](./src/xdf/scripts/assets/ArchiveUtils.ts) / [XdfRuntime.ts](./src/xdf/scripts/assets/XdfRuntime.ts)），`index.ts` 改名重写为 [scriptRegistry.ts](./src/xdf/scripts/scriptRegistry.ts)。全部移动用 `git mv` 追踪。
- 新增 [auto-manifest.mjs](./scripts/auto-manifest.mjs)：`dev` / `build` / `build-with-lint` 前置运行，扫描 `presets/*/*.ts` 与 `assets/*.ts` 生成 [manifest.generated.ts](./src/xdf/scripts/manifest.generated.ts)（提交入库，勿手改）；fail-fast 校验散装文件 / 空分组 / assets 子目录 / 缺失或重复 `*_SCRIPT` 导出。
- [scriptRegistry.ts](./src/xdf/scripts/scriptRegistry.ts) 从自动清单装配 `SCRIPTS` / `ASSETS`（`GROUP_ORDER` / `groupRank` / `groupScripts` 保留，QuickAdd 分组对接不变）；[ScriptReleaser.ts](./src/xdf/scripts/ScriptReleaser.ts) 删除 `LEGACY_PATHS` / `LEGACY_DIRS` / `pruneLegacy()` 旧布局清理。
- **统一释放映射（唯一规则）**：`src/xdf/scripts/<相对路径>/<名>.ts → 00.SYSTEM/xdf_base/scripts/<相对路径>/<名>.js`，即业务释放到 `scripts/presets/<分组>/<名>.js`、资产释放到 `scripts/assets/<名>.js`；11 个脚本内 `RUNTIME_PATH` / `UTILS_PATH` 字面量与头注释同步改指新路径。
- **为什么**：此前加脚本需在 index.ts 手工登记一行，目录与清单两处维护、容易漏；且旧释放布局（`scripts/<分组>/` + `utils/`）与源码目录不一致，脚本内写死的工具路径字面量容易指错。改为「目录即清单、源码目录即释放路径」后，新增脚本只需落文件，分组、释放、面板、QuickAdd 菜单全自动。旧释放文件不做代码兼容迁移，由用户手动删除 `00.SYSTEM/xdf_base/` 后按新结构重新释放。

---

## 2026-10-20 · 脚本按目录分组，源码/释放/面板/QuickAdd 四处统一中文命名

- 源码目录重构：`src/xdf/scripts/` 下按既有三组 + 通用组落盘（`档案管理/` `文件生成/` `行政工作/` `通用/`），共享资产移到 `lib/`（ArchiveUtils）与 `runtime/`（XdfRuntime）。11 个两段式脚本由 `panel-<kebab>.ts` 改名为 `<中文名>.ts`；9 个旧扁平预设脚本源码删除（备份在 `XDF-obsidian-system/_backup/20261019-script-migration/`）。
- [scripts/index.ts](./src/xdf/scripts/index.ts)：`SCRIPTS` 每条只登记 `"<分组>/<中文名>.js"` 路径，`defineScript()` 从路径推导 `id`（= 文件名）与 `group`（= 第一段目录）；`GROUP_ORDER` 只定顺序，新增 `groupScripts()` 归并。
- [scripts/ScriptReleaser.ts](./src/xdf/scripts/ScriptReleaser.ts)：释放到 `scripts/<分组>/<中文名>.js`；新增 `LEGACY_PATHS` / `LEGACY_DIRS` 与 `pruneLegacy()`，一次性删除旧扁平脚本与 `panel-scripts/`（非递归 rmdir，目录里还有用户脚本则保留）。
- [choiceManager.ts](./src/xdf/choiceManager.ts)：删除 `PRESET_FOLDERS` / `PANEL_FOLDER`，改为按 `groupScripts()` 动态生成 `xdf-group-<分组>` 文件夹与 `xdf-script-<中文名>` Choice；`xdf-base-*` / `xdf-panel-*` 与消失分组统一清理。
- [panel/XdfScriptPanelView.ts](./src/xdf/panel/XdfScriptPanelView.ts)：递归扫 `scripts/**/*.js`，`category` 取相对路径第一段，按 `GROUP_ORDER` 排序。
- **为什么**：分组此前硬编码在 `choiceManager` 的清单里，增删脚本要改两处且分组与目录脱节；用户要求分组沿用现有三组、由 `src/xdf/scripts/` 的文件夹识别，并让源码名 / 释放名 / 面板 id / QuickAdd 菜单名统一为同一中文。新脚本已全量验证可用，旧扁平实现不再保留。

---

## 2026-10-19 · 面板脚本注册进 QuickAdd（独立分组）

- [choiceManager.ts](./src/xdf/choiceManager.ts) 新增 `PANEL_FOLDER`（id `xdf-base-folder-panel`，名「面板脚本」）与 `panelToChoice()`：把 `PANEL_SCRIPTS` 的 11 个脚本注册为 QuickAdd Macro Choice，choice id `xdf-panel-<id>`、macro id `xdf-panel-macro-<id>`，UserScript 指向 `00.SYSTEM/xdf_base/panel-scripts/<kebab>.js`。
- 同步逻辑从「只遍历 `PRESET_FOLDERS`」改为遍历 `ALL_PRESET_FOLDERS`（原三组 + 面板组），散落项清理同时覆盖 `xdf-base-*` 与 `xdf-panel-*`。
- **为什么**：原脚本有「启动时注册 QuickAdd 菜单」这一步，复刻的面板脚本只释放文件、没有注册，导致 QuickAdd 侧看不到；按用户要求另起一组，避免与原脚本条目混在一起或 id 冲突。

---

## 2026-10-19 · 按两段式规范复刻 9 个预设脚本

- 新增 9 个面板脚本（`panel-archive-1on1-create` / `panel-archive-class-create` / `panel-lesson-1on1-record` / `panel-lesson-class-record` / `panel-homework-ai` / `panel-wordlist-ai` / `panel-meeting-setup` / `panel-meeting-record` / `panel-meeting-add-page`），业务逻辑逐一对照原脚本复刻，`PANEL_SCRIPTS` 由 3 项扩到 11 项。**原 10 个预设脚本与 `ArchiveUtils` 一字未动**。
- 删除 `panel-lesson-package.ts`（一对一与班课揉在一个脚本里属假共享，已拆成两个独立复刻版）。
- 规范细则沉淀进 [ARCHITECTURE.md](./ARCHITECTURE.md)「约定 → 两段式脚本规范（细则）」：骨架、ctx 契约、字段类型映射、复刻十条原则、验证方式。
- **为什么**：原脚本参数全靠逐项弹窗，不直观、不能回退；按同一份 `collect` / `execute` 复刻后，两份脚本可在面板里一次填表、反复重跑，QuickAdd 侧仍可经 `entry` 顺跑，且原脚本保持可用以对照回滚。规范先行是为了让后续复刻有统一验收标准（逐行等价、输入搬 collect、写盘只在 execute）。

---

## 2026-10-19 · 面板脚本双入口（QuickAdd 顺跑 + 面板两段式）

- 新增共享运行时 [xdf-runtime.ts](./src/xdf/scripts/xdf-runtime.ts)（释放为 `utils/XdfRuntime.js`）与 `RUNTIME_SCRIPTS` 清单（并入 `ScriptReleaser.ALL_SCRIPTS`）：`run(mod)` 造 native ctx（`ask` 经 `api.suggester / inputPrompt / wideInputPrompt / datePrompt`）顺序跑 `collect → execute`。
- 3 个面板脚本改为 `const MOD = { meta, collect, execute }; MOD.entry = ...; module.exports = MOD`：`entry` 载入运行时即可在 QuickAdd 里顺跑；`collect` / `execute` 逻辑一字未改，**现有 10 个预设脚本与 `ArchiveUtils` 均未改动**。
- 规范并入 [ARCHITECTURE.md](./ARCHITECTURE.md)「约定」：新增「双入口（可选）」条，脚本清单由两清单扩为三清单。
- **为什么**：面板脚本此前只能在面板跑，无法用 QuickAdd 快捷方式触发。研究 QuickAdd 求值实证后确认：脚本导出对象含 `entry` 即会被直接调用（不弹成员选择器），而调用签名 `(params, settings)` 不含 ctx——故挂一个 `entry` 自造 native ctx 复用同一份 `collect` / `execute`，比给两边各写一套脚本更贴近既有结构。字段定义与业务逻辑各只写一份，两条路只差 asker 实现（面板=一张表单，QuickAdd=逐项弹窗）。

## 2026-10-19 · 脚本运行面板 + 两段式脚本规范

- 新增 `src/xdf/runner/`（`types` / `ScriptModuleLoader` / `ScriptRunner` / `AnswerStore`）与 `src/xdf/panel/`（`index` / `XdfScriptPanelView` / `PanelFormRenderer`）：面板选脚本 → 跑 `collect` 生成表单 → 值变化防抖重算 → 点运行跑 `execute`，填答落 `00.SYSTEM/xdf_base/panel/answers.json`。
- 确立**两段式脚本契约**：`module.exports = { meta?, collect, execute }`，`collect` 只读不写盘、`execute` 只写不弹窗；取输入统一经 `ctx.ask(field)`（复用 `FieldRequirement`）。规范并入 [ARCHITECTURE.md](./ARCHITECTURE.md)「约定」。
- 新写 3 个面板脚本（登记进新增的 `PANEL_SCRIPTS`，释放到 `panel-scripts/`、不进 QuickAdd 菜单）：新建笔记 / 追加到笔记 / 生成课次包。**现有 10 个预设脚本未改动**。
- `XdfBaseExtension.initialize()` 在首个 `await` 前同步调用 `registerScriptPanel`（`registerView` 须在 `onload` 内同步完成）。
- **为什么**：原脚本靠弹窗逐个问参数——不直观、不能回退、中断要重填。两段式把「收集」与「执行」解耦：收集阶段纯只读、可随便重跑 / 回退 / 中断；面板只认字段描述即可通用渲染，脚本只经 `ctx` 访问宿主、不感知驱动方（面板或原生弹窗）。

## 2026-10-17 · 清理历史裸 tag `1.4.9`

- 删除裸 tag `1.4.9` 及其 Release（非流水线产物，属旧 `tag-version-prefix: ""` 时代的遗留），仓库 tag 自此全部为 `v*`。
- **为什么**：流水线只由 `v*` 触发，裸 tag 不触发构建；且非 `v` 前缀会搅乱「取最新 tag」类脚本的排序（`git describe --abbrev=0` 曾返回 `1.4.9` 导致误判）。

## 2026-10-17 · 接上 `api.db` + 内置脚本改走数据库

- `main.ts get api()` 以懒 getter 挂载 `db`（委托 `_xdfBase.getDBApi()`），把 v1.0.0 起只有注释契约、从未实现的 `api.db` 真正接上；toolkits 的 `api.db` 兼容分支自此可命中。
- `ArchiveUtils` 新增 `getDbApi()` / `queryDb()` 守卫（`status().isOpen` 检查，全程 try/catch 回退文件解析）；新增 `parseArchiveMeta(file, content)`（读 `archives` 表）与 `parseStudentsFromArchive(file, content)`（读 `class_roster` 表）替代读取场景的手写 YAML / Markdown 表格解析；`getNextLessonNumber` 改双源取 `max(DB, 文件扫描)+1`。
- 调用方切换：`lesson-1on1-record` / `lesson-class-record` 改用新函数；**写路径 `updateArchiveFrontmatter` 仍用 `parseFrontmatter`**（DB 是只读镜像，改原文必须解析原文）。
- **为什么**：消除脚本里的手写 YAML / 表格解析（脆弱、易随格式漂移出错），让结构化读取走 SQLite 镜像；fallback 保留是防 DB 未初始化 / 同步滞后（最终一致约 2.5s）时脚本拿不到数据；课号双源取最大值是防「连续建课」时 DB 滞后算出重复课号。

## 2026-10-17 · CI 收敛 + references/ 移出仓库

- CI 移除测试 job，只保留 Build + Lint；删除 `ScriptReleaser` 未使用的 import。
- `references/`（上游 QuickAdd 源码副本）移出仓库并加入 `.gitignore`，修复缺失 `.gitmodules` 导致的 CI checkout 失败。
- **为什么**：CI 只需保证可构建、可过 lint；上游源码副本体积大且非构建必需，留在仓库内只会拖慢 checkout 并反复触发子模块报错。

## 2026-10-16 · 统一发布流水线

- 新增 `.github/workflows/release.yml`：tag `v*` 触发，校验 `package.json` / `manifest.json` / tag 三者版本一致后构建并发布，release notes 自动生成；移除旧三段式 stub 工作流。
- chore：eslint 忽略 `references/`；修正 workflow 分支名 `master` → `main`。
- docs：`PENDING` 补充「代码审查整改计划（2026-10-04）」。
- **为什么**：统一发布口径，避免手搓 Release 与版本号漂移；分支名与工作流命名对齐实际仓库。

## 2026-09-18 · v1.4.9 行政工作模块

- 新增「行政工作」模块（周例会管理）：`meeting-setup` / `meeting-record` / `meeting-add-page` 三个脚本，进入 `PRESET_SCRIPTS` 与「行政工作」Choice 文件夹；脚本经 `settings.folderStructure.admin` 取行政目录。
- **为什么**：把周例会的建档 / 记录 / 添页纳入同一套脚本释放与 Choice 同步机制，行政事务与教学档案统一入口。

## 2026-09-14 · v1.4.8 / v1.4.7 授课布局与文件夹事件崩溃修复

- v1.4.7：修复 vault 文件夹事件崩溃（`Sync.shouldTrack` 对 `TFolder` 读 `extension.toLowerCase()` 报错），在 `shouldTrack` 开头加 `instanceof TFile` 守卫；新增「授课布局」右键菜单（主窗口开 Feedback，popout 开 Wordlist + Note）。
- v1.4.8：「授课布局」判断条件由路径正则改为 frontmatter `#课程记录` 标签 + `lesson_number`。
- **为什么**：归档 / 新建课次都会触发 folder 事件，守卫是崩溃根因修复；用标签而非路径匹配更贴合档案的真实语义，不受目录改名影响。

## 2026-09-13 · v1.4.6 / v1.4.5 归档互斥菜单与课程索引格式

- v1.4.6：归档 / 恢复菜单改成按 frontmatter `status` 互斥显示（active → 归档，archived → 恢复）；每课记录排除已归档课程。
- v1.4.5（+ 后续 fix）：统一课程索引显示格式、去掉课型分隔符；新课型插入时删除原分隔符、块自身带 `---`。
- **为什么**：状态相关的操作只显示合法动作，避免误操作；分隔符重复累积会破坏索引块的视觉结构。

## 2026-09-12 · v1.4.4 档案页课程索引链接补全 nav 文件名

- 档案页课程索引链接补全 nav 文件名（此前指向课次文件夹，落到文件夹而非 nav）。
- **为什么**：点击索引应直接打开对应课次的 nav，而不是先落到文件夹再二次点击。

## 2026-09-11 · v1.4.3 上一课链接补全 nav 文件名

- 课次 nav 的「上一课」链接补全 nav 文件名。
- **为什么**：与 v1.4.4 同源，确保课次间导航直达 nav 文件。

## 2026-09-09 · v1.4.0 / v1.4.1 / v1.4.2 相对路径链接 · 文件结构管理 · 右键归档

- v1.4.0：课程链接改相对路径（`./` 同级、`../` 父级）；新增文件结构管理（`folderStructure` 的 active/archived/admin 三文件夹）；新增右键「归档此课程」。
- v1.4.1：「归档」按钮支持 `archived` 状态（可恢复）。
- v1.4.2：frontmatter `links` 补全 nav 文件路径。
- **为什么**：裸名链接在 vault 有同名文件时会被 Obsidian 解析到错误目标、移动档案后失效；把文件夹结构配置化 + 右键归档，让老师在库内直接管理档案位置，不依赖外部脚本。

## 2026-09-04 · v1.3.1 描述格式与 references 目录

- 统一插件显示名称 / description 格式；添加 `references` 目录（QuickAdd 上游源码）。
- **为什么**：插件列表信息统一口径；留一份上游源码便于对照与移植。

## 2026-09-02 · v1.3.0 Feedback 内联 checkbox 组

- 新增 Feedback 内联 checkbox 组：源文件保持单行 `出勤：[ ] 正常 | [ ] 迟到 …`，用 CM6 ViewPlugin + WidgetType（Live Preview）与 MarkdownPostProcessor（阅读模式）双模式渲染为内联 checkbox，点击回写文本。
- checkbox 契约放宽为任意标签（≤40 字符 + 中文冒号），模板改合并格式；DB 端 `Parser.parseInlineCheckboxGroups` 以 `source='inline'` 入库。
- 相关修复：分隔符替换误吞标签文字；源码模式改用 `editorLivePreviewField` 过滤；归零悬挂缩进消除行前空白。
- **为什么**：多行 CSS 压横排方案已证伪（破坏 CM6 行几何），改回单行源 + 渲染层接管；契约放宽以适应不同出勤 / 作业标签。

## 2026-09-01 · v1.2.0 / v1.2.1 数据库层完整实现

- 数据库层完整实现：7 表 Schema（实体层 `students/archives/lessons/class_roster`，内容层 `sections/files/checkboxes`）+ 全量 / 增量同步 + 粒度回归测试；Feedback checkbox 由 HTML input 迁移为 markdown task。
- **为什么**：为脚本与设置页提供可查询的 SQLite 镜像，md 仍是唯一数据源；用 markdown task 表达勾选以复用 Obsidian 原生能力。

## 2026-08-31 · v1.0.0 / v1.1.0 起点

- v1.0.0：XDF-Base 首个版本——在 QuickAdd fork 上挂载 XDF 教学系统扩展（脚本释放、Choice 同步、数据库）。
- v1.1.0：设置页汉化与 AI 配置接入；词表工具重做；脚本 AI 调用修复。
- **为什么**：确立「QuickAdd 引擎 + XDF 自研扩展（`src/xdf/`）」的架构基线；AI 能力需先打通 provider 配置与脚本侧调用。
