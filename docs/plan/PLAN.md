# Issue 1 拆分为 4 个对话的执行计划

## Summary

- 目标：把“容器级权限管理”拆成 4 个小步，每步都能在单独对话里完成。
- 原则：每一步都只做一个层面的工作，避免同一轮里同时处理布局、组件、搜索、权限写回。
- 执行顺序：`步骤 1 → 步骤 2 → 步骤 3 → 步骤 4`，每个新对话默认基于上一步已经完成后的代码状态继续。

## Step Prompts

### 步骤 1：页面布局与权限模块骨架

```text
请在仓库 `E:\cache\GitRepos\cn-spe-demo` 中实现“容器级权限管理”的第 1 步，只做布局调整和模块骨架，不要接入真实 Graph 权限数据，也不要做 TagPicker 搜索。

要求：
1. 先探索当前代码结构，再直接实现，不要只给建议。
2. 遵守仓库 `AGENTS.md`：最终回复用简体中文；新增注释和 JSDoc 必须是简体中文；所有新增 UI 用 Fluent UI；TypeScript 严格，不允许 `any`。
3. 本步只完成：
   - 顶部栏以下整体左对齐
   - 容器选择器右侧并排放置 `Create container` 和绿色强调的 `Manage Container Permission`
   - 新建权限功能模块骨架，例如 `src/components/permissions`
   - 新增一个可打开/关闭的容器权限 Dialog 外壳
   - Dialog 先只放静态标题、容器名占位、页签占位、输入区占位、列表占位、`Apply / Close` 按钮占位
4. 不要在这一步实现：
   - 真实权限加载
   - TagPicker
   - Graph 搜索
   - Apply 写回
   - access list 编辑逻辑
5. `containers.tsx` 只负责页面编排和打开/关闭弹窗，不要把权限细节塞进去。
6. 请为本步补最小测试，至少覆盖：
   - 新按钮渲染
   - 点击后 Dialog 打开
   - 左对齐布局未破坏容器和文件区结构
7. 最后运行：
   - `npm test -- --run`
   - `npx tsc --noEmit`

完成后请输出改动摘要、关键结构说明和测试结果。
```

### 步骤 2：Dialog 本地草稿编辑，不接 Graph

```text
请在仓库 `E:\cache\GitRepos\cn-spe-demo` 中继续实现“容器级权限管理”的第 2 步。假设第 1 步已经完成。本步只做 Dialog 内部的本地草稿编辑能力，不要接入真实 Graph 搜索和真实权限写回。

要求：
1. 先阅读当前权限模块和 `containers.tsx` 的最新状态，再直接实现。
2. 遵守仓库 `AGENTS.md`：最终回复用简体中文；新增注释和 JSDoc 必须是简体中文；新增 UI 用 Fluent UI；TypeScript 严格，不允许 `any`。
3. 本步只完成本地草稿编辑：
   - `People / Groups` 两个页签
   - 本地状态驱动的 access list
   - 权限下拉，容器角色显示为 `Reader / Writer / Manager / Owner`
   - 默认角色 `Reader`
   - 行内改权限
   - 行内删除
   - `Close` 放弃未保存草稿
4. 这一步先不要上真实 TagPicker 搜索；可以先用一个简单的 Fluent UI 输入控件承载“筛选当前列表”和“准备后续替换”的位置。
5. `Add` 行为先基于本地假数据或本地候选对象完成，让交互和状态先跑通。
6. 不要在这一步实现：
   - 真实 Graph 用户/组搜索
   - 真实容器权限读取
   - `Apply` 调 Graph 写回
7. 请把草稿状态、差异前的编辑状态、页签切换逻辑拆到独立 Hook，不要堆在 Dialog 组件里。
8. 请补测试，至少覆盖：
   - 页签切换
   - 本地新增一条权限
   - 修改角色
   - 删除一条权限
   - `Close` 放弃草稿
9. 如果测试里还会遇到 `NodeFilter is not defined`，请把补丁收敛到共享 test setup。
10. 最后运行：
   - `npm test -- --run`
   - `npx tsc --noEmit`

完成后请输出改动摘要、状态模型说明和测试结果。
```

### 步骤 3：接入 Fluent UI v9 TagPicker 与真实目录搜索

```text
请在仓库 `E:\cache\GitRepos\cn-spe-demo` 中继续实现“容器级权限管理”的第 3 步。假设前两步已经完成。本步聚焦于 `people picker` 的最终形态：Fluent UI v9 `TagPicker` + 真实 Graph 用户/组搜索，但仍然不要做 `Apply` 写回。

要求：
1. 先阅读当前权限模块实现，再直接修改。
2. 遵守仓库 `AGENTS.md`：最终回复用简体中文；新增注释和 JSDoc 必须是简体中文；新增 UI 用 Fluent UI；TypeScript 严格，不允许 `any`。
3. 本步必须把占位输入替换为 Fluent UI v9 `TagPicker`，参考：
   `https://storybooks.fluentui.dev/react/?path=/docs/components-tagpicker--docs`
4. 需要接入真实 Graph 搜索：
   - People 页签只搜索用户
   - Groups 页签只搜索组
5. 请在前端登录 scopes 中补充最小必要权限：
   - `User.ReadBasic.All`
   - `GroupMember.Read.All`
6. 候选项显示：
   - 头像或组图标
   - 主文本
   - 次文本
7. `Add` 启停规则要按最终要求实现：
   - 如果对象已存在于当前 access list，禁用 `Add`，并把 access list 过滤到匹配项
   - 如果搜索无结果，禁用 `Add`，显示专业空态提示
   - 只有选择了一个“当前 access list 中不存在”的真实候选对象时，`Add` 才可用
8. 这一步仍然不要实现：
   - 真实容器权限初始加载
   - `Apply` 调 Graph 写回
9. 请补测试，至少覆盖：
   - `TagPicker` 搜索结果渲染
   - 用户/组页签切换时搜索源切换
   - 重复对象导致 `Add` 禁用
   - 无结果空态
10. 最后运行：
   - `npm test -- --run`
   - `npx tsc --noEmit`

完成后请输出改动摘要、搜索与选择器设计说明、所新增 scopes 和测试结果。
```

### 步骤 4：真实容器权限加载与 Apply 写回

```text
请在仓库 `E:\cache\GitRepos\cn-spe-demo` 中继续实现“容器级权限管理”的第 4 步。假设前 3 步已经完成。本步只做真实容器权限加载、差异计算和 `Apply` 写回，完成 issue 1 的收尾。

要求：
1. 先探索当前权限模块、TagPicker 集成和容器页面的最新状态，再直接实现。
2. 遵守仓库 `AGENTS.md`：最终回复用简体中文；新增注释和 JSDoc 必须是简体中文；新增 UI 用 Fluent UI；TypeScript 严格，不允许 `any`。
3. 本步接入真实容器权限 API：
   - `list fileStorageContainer permissions`
   - `create fileStorageContainer permission`
   - `update fileStorageContainer permission`
   - `delete fileStorageContainer permission`
4. Graph 调用继续走前端直接调用，不要新增后端权限路由。
5. 不要把 permission 相关方法放进现有 `src/services/spembedded.ts`；保持在权限功能自己的服务模块中。
6. 实现真实初始加载：
   - 打开 Dialog 时读取当前容器权限
   - 映射到本地 access list 视图模型
7. 实现 `Apply`：
   - 对比初始权限和当前草稿
   - 正确拆分新增、更新、删除
   - 顺序调用或合理批量调用前端 Graph 请求
   - 成功后刷新当前列表并清空脏状态
   - 失败时给出明确错误提示，不吞错
8. 保留 `Close` 放弃未提交草稿的保护。
9. 请补测试，至少覆盖：
   - 初始权限加载成功后的列表显示
   - 差异拆分逻辑
   - `Apply` 成功
   - `Apply` 失败
   - 成功后重置脏状态
10. 最后运行：
   - `npm test -- --run`
   - `npx tsc --noEmit`

完成后请输出改动摘要、权限 API 映射说明、差异计算说明和测试结果。
```

## Assumptions

- 每个新对话都基于前一步已经完成后的代码继续。
- 4 个步骤都只处理 `issue 1`，不提前实现 `issue 2`。
- 如果某一步发现范围仍然偏大，优先继续纵向再拆，不要横向把未完成逻辑塞进同一轮。

**Summary**

已完成“容器级权限管理”第 1 步，只做了布局调整和模块骨架，没有接入真实 Graph 权限数据，也没有实现 `TagPicker`、搜索、`Apply` 写回或 access list 编辑逻辑。

这次改动把页面入口层收回到编排职责：[src/components/containers.tsx](E:/cache/GitRepos/cn-spe-demo/src/components/containers.tsx:28) 现在只负责容器选择、两个弹窗开关和文件区挂载；新增了创建容器弹窗组件 [CreateContainerDialog.tsx](E:/cache/GitRepos/cn-spe-demo/src/components/containers/components/CreateContainerDialog.tsx:47)；新增了权限模块骨架 [ContainerPermissionDialog.tsx](E:/cache/GitRepos/cn-spe-demo/src/components/permissions/ContainerPermissionDialog.tsx:22)。顶部栏下方整体已改为左对齐，容器下拉框右侧并排放置了 `Create container` 和绿色强调的 `Manage Container Permission`。

---

**Professional Details**

关键结构调整如下：

- 页面布局与样式拆分到了 [containers.tsx](E:/cache/GitRepos/cn-spe-demo/src/components/containers.tsx:67) 和 [containersStyles.ts](E:/cache/GitRepos/cn-spe-demo/src/components/containers/containersStyles.ts:6)。
- `containers.tsx` 不再承载权限弹窗内容，只保留页面编排、容器列表状态、当前容器选择，以及弹窗开关状态。
- 新建了 `src/components/permissions/` 模块骨架：
  - [ContainerPermissionDialog.tsx](E:/cache/GitRepos/cn-spe-demo/src/components/permissions/ContainerPermissionDialog.tsx:22)
  - [permissionsStyles.ts](E:/cache/GitRepos/cn-spe-demo/src/components/permissions/permissionsStyles.ts:6)
  - [permissionsTypes.ts](E:/cache/GitRepos/cn-spe-demo/src/components/permissions/permissionsTypes.ts:1)
  - [index.ts](E:/cache/GitRepos/cn-spe-demo/src/components/permissions/index.ts:1)
- 权限 Dialog 目前只有静态外壳：
  - 标题
  - 容器名占位
  - `TabList` 页签占位
  - 输入区占位
  - 列表区占位
  - `Apply / Close` 按钮占位
- 现阶段明确没有实现：
  - 真实 Graph 权限加载
  - `TagPicker`
  - Graph 搜索
  - `Apply` 写回
  - access list 编辑逻辑

测试与验证：

- 新增了页面级最小测试 [containers.test.tsx](E:/cache/GitRepos/cn-spe-demo/src/components/containers.test.tsx:45)
- 覆盖内容：
  - 新按钮渲染
  - 点击 `Manage Container Permission` 后 Dialog 打开
  - 顶部容器控制区与文件区仍是分离结构，选择容器后文件区仍能正常挂载
- 已运行并通过：
  - `npm test -- --run`
  - `npx tsc --noEmit`

补充说明：

- `npm test -- --run` 通过了，但测试输出里仍有一条来自 `jsdom/Tabster` 的 `NodeFilter is not defined` 警告信息；本次命令退出码为 `0`，没有阻塞测试通过。
- 这一步没有碰真实权限数据流，后续可以直接在 `src/components/permissions` 下继续接 Graph、搜索和权限列表逻辑，而不需要再把细节塞回 `containers.tsx`。
