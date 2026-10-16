# DEVLOG — XDF Base

> 变更时间线，**只追加不回改**。每条：日期 + 改了什么 + **为什么**。
> 面向"人肉可读的历史决策"；面向用户的 Release 说明由流水线自动生成，此处不重复。

---

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
