# Progress

## 2026-11-09 · 任务看板拖动与优先级（候选版）

**进展**
- 在独立分支 `feat/board-drag-priority` 接续已验证的上游同步提交 `5fd0ca6e0`，不修改正在打包的工作区。
- 人工/未领取卡片可用专用拖动柄跨三列移动；bot 领取卡片和实际 AI 运行区不提供拖动柄。
- 新增/卡片编辑支持高、中、低优先级，默认中；服务端校验并保存，旧记录读为中。
- TDD：新增测试先观察 5 项失败，实现后存储/路由 24 项通过。真实隔离页面已验证新增高优先级保存。

**待完成**
- 类型检查退出 0；含 Esc 取消的 5 文件 115 项测试通过。真实页面模拟 pointer 验证与刷新持久化通过。
- 原生鼠标捕获/真机触屏未验收（当前浏览器没有对应输入操作）；候选版供用户验收。构建退出 0，包含 Esc 最后改动；新功能候选安装包待完成。
- 原 `release-tole` 仅含上游同步；最终含新功能的安装包必须另行构建，不能混同。

## 2026-11-09 · 上游 0.1.150 同步（源码验证通过，打包待完成）

**进展**
- 独立分支 `sync/upstream-2026-11-09`，从个人分支 `4542932fe` 合并上游 `1d72099d5c05cdadcd01a579508e27dbb97afa26`（0.1.150）。原工作区和运行应用不变。
- 保留任务看板桌面/简洁/手机入口、board 服务与工具、MausBot Tole 品牌、原运行时数据身份及个人更新源。
- 内部路由冲突采用上游的新 lending/meeting/cancellation 流程并插入 board 路由；简洁菜单采用新版顺序并保留 board。
- 工具目录快照采用新版为基础，待依赖安装后按实际目录重新生成并检查预算。

**当前状态**
- 依赖安装退出码 0；看板/菜单 102 项测试通过；隔离服务 HTTP 新增、完成、重开、读取和删除检查通过。
- 快照对比上游：完整目录固定增加 1,234 字节，桥接目录固定增加 12 字节；预算取实测值，原 2% 限制不变。
- 首轮跨回合检查进程消失且无退出码，不能视为通过；改用独立进程串行检查，日志和退出码保存在同步工作区父目录。
- 串行检查结果：`pnpm typecheck`、`pnpm build`、8 文件 362 测试的组合回归均退出 0。构建仅有产物体积提示。
- 源码验收通过；安装包及签名检查待完成，未替换运行应用。

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
