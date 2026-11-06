# Progress

## 2026-11-06 · 迁到个人 fork 维护

**进展**
- fork 到 `XiaoMa-PM/OpenMausBot`：`origin` 指向 fork，`upstream` 指向 `milind-soni/OpenMausBot`。
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
