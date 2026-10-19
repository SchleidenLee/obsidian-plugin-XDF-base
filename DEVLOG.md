# DEVLOG — XDF Base

> 变更时间线，**只追加不回改**。每条：日期 + 改了什么 + **为什么**。
> 面向"人肉可读的历史决策"；面向用户的 Release 说明由流水线自动生成，此处不重复。

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
