# Progress

## 2026-11-10 · 同步上游 0.1.151

**进展**
- `main` 合并 `upstream/main`（0.1.142 → 0.1.151，merge-base 11-06），再合进 `feat/task-board`。
- 冲突 8 个文件：`server/index.ts`（内部路由链）、两处 BUDGET_BASELINE、三个 catalog goldens、`SidebarProfileMenu.test.ts`（上游把工具菜单重新分组）、`openai-chat-protocol.ts`（本地的空串修复上游已有，取上游）。
- 打包命令：`pnpm package:prepare && pnpm build:speech && pnpm build:cua && npx electron-builder --mac --publish never -c.directories.output=release-tole`，日志 `/tmp/tole-build.log`。

**踩坑**
- 解冲突不能对 `server/index.ts` 用 `git checkout --theirs`：会丢掉已自动合并的看板 import 和挂载行（`new Board()` / `createBoardRoutes`）。要用 `git checkout -m` 恢复标记后只改冲突块。
- BUDGET_BASELINE 不要手填：先 `UPDATE_AGENTS_CATALOG_GOLDENS=1` 重生成 goldens，再跑一遍测试，按失败信息里的实际值回写。

**总结**
- 上游 4 天 6400+ 提交，看板相关的接触面只有「内部路由链」「工具菜单分组」「catalog 体积」三处，每次同步照这三处查即可。

## 2026-11-06 · 改名 MausBot Tole

**进展**
- App 名 `MausBot Tole`，bundle id `com.anatole.mausbottole`，自动更新源指向 `XiaoMa-PM/MausBot-Tole`；GitHub fork 同步改名。
- `extraMetadata.productName` 保持 `OpenMausBot`：运行时 app 名不变，userData 与 safeStorage 钥匙串沿用原版，凭证不丢。bot 数据仍在 `~/.openmausbot`。
- 本地打包输出到 `release-tole/`，避免覆盖正在运行的旧包。

## 2026-11-06 · 迁到个人 fork 维护

**进展**
- fork 到 `XiaoMa-PM/OpenMausBot`（后改名 `MausBot-Tole`）：`origin` 指向 fork，`upstream` 指向 `milind-soni/OpenMausBot`。
- 同步上游：`git fetch upstream && git checkout main && git merge upstream/main && git push origin main`，再把 main 合进 `feat/task-board`。

## 2026-11-06 · 任务看板（feat/task-board）

**进展**
- 左侧栏 Tools 新增「任务看板」：桌面侧栏、简洁模式菜单、手机底栏三处入口，懒加载页面 `TaskBoardPage`。
- 「AI 正在替你运行」= coordinator 活跃 handoff（含交办者）+ 未被覆盖的忙碌线程；3 秒轮询。
- 看板三列待办/进行中/已完成；bot 任务显示领取者、进度条、进度说明；人的任务只有增删改勾选。
- bot 侧新增 agents 工具 `task_board`（list/add/claim/progress/done/release），仅领取者可报进度，revision 做乐观锁。
- 数据存 `~/.openmausbot/board.json`；设计见 `docs/task-board.md`。

**踩坑**
- 新工具描述里 "task" 出现过多，BM25 桥接检索把「schedule a recurring task」排到了 task_board 而非 trigger → 描述改用 item/to-do。
- 加工具要同步：catalog/bridge goldens（`UPDATE_AGENTS_CATALOG_GOLDENS=1`，两个文件分开跑）、两处 BUDGET_BASELINE、agents-proxy 工具名列表、outside-fence。
- `erasableSyntaxOnly` 不允许构造函数参数属性。
- 杀掉 fixture server 会连带清掉 launch 的数据目录；预置数据要在 launch 刚建目录、server 读盘前写入。

**总结**
- 看板实时性用轮询而非新增 SSE 帧，改动面最小。
- 「tasks」已被线程占用，模块统一叫 board。
