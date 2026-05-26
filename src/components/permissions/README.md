# Container Permission 前端模块说明

本文档面向初级开发者，目标不是只告诉你“这个模块能做什么”，而是帮助你按当前代码现状看懂它的前端结构、状态流、搜索流、Apply 流，以及它和后端共同契约之间的关系。

注意：这篇 README 现在以**前端现状**为主。  
如果你想继续看共同契约、后端包装层和 `read*` pattern，请继续阅读：

- `common/contracts/containerPermissionCommonContracts.ts`
- `docs/fix&refactor/container-permission-common-contracts-and-readers.md`

---

## 1. 这个前端模块解决什么问题

`Container Permission` 前端模块用于管理某个 `fileStorageContainer` 的访问权限。

用户在弹窗里可以做 4 件事：

1. 查看当前容器已经有哪些 `people` 和 `groups`
2. 搜索新的用户或组，并把它们加进本地权限草稿
3. 修改已有权限条目的角色
4. 点击 `Apply`，把本地草稿相对基线的差异提交给后端

当前前端设计有两个很重要的前提：

1. 前端**不直接操作 Microsoft Graph**
2. 前端维护的是**本地草稿**，不是“用户每改一下就立刻写服务端”

这样做的好处是：

- 弹窗内的交互更流畅
- 前端不需要直接理解 Graph 权限接口细节
- `Close / Reset / Apply` 的语义更清晰
- 错误处理、角色映射、Graph 兼容逻辑集中在后端

---

## 2. 当前前端文件地图

当前前端权限模块主要在：

```text
src/components/permissions/
├─ index.ts
├─ ContainerPermissionDialog.tsx
├─ ContainerPermissionDialog.test.tsx
├─ ItemPermissionDialog.tsx
├─ ItemPermissionDialog.test.tsx
├─ hooks/
├─ models/
├─ services/
└─ components/
   ├─ permissionsTypes.ts
   ├─ permissionsStyles.ts
   ├─ PermissionDialogFrame.tsx
   ├─ PermissionDialogFrame.test.tsx
   ├─ PermissionAccessListTable.tsx
   └─ PrincipalSearchComboBox.tsx
```

另外，这个模块还直接依赖两个外部层：

- 前端 API 层：`src/services/containerPermissionApi.ts`
- 共同契约层：`common/contracts/containerPermissionCommonContracts.ts`

### `index.ts`

模块出口文件。  
它只做两件事：

- 暴露 `ContainerPermissionDialog`
- 暴露 `IContainerPermissionDialogProps`

你可以把它理解成“权限模块的大门”。

### `ContainerPermissionDialog.tsx`

这是前端权限模块的主组件，也是最值得先读的文件。

它主要负责：

- 渲染对话框壳子
- 展示 `People / Groups` 两个页签
- 在弹窗打开时加载当前容器权限
- 接上目录搜索 Hook
- 接上草稿状态 Hook
- 点击 `Apply` 时计算差异并提交给后端
- 展示权限加载错误、搜索错误、Apply 成功或失败反馈

一句话理解：  
它像一个前端的“小 controller”，负责把多个 Hook 和服务拼起来。

### `permissionsTypes.ts`

定义对话框的外部入参：

- `open`
- `containerId`
- `containerName`
- `onClose`

这说明权限弹窗不是自己决定“当前容器是谁”，而是由容器页面把上下文传进来。

### `permissionsStyles.ts`

只负责样式，不负责业务逻辑。  
它能帮助你理解页面被分成了哪些区域，例如：

- 顶部容器信息区
- 搜索区
- Access List 表格区
- 底部操作区

### `models/containerPermissionModels.ts`

这是前端模型补充层。

现在这个文件和以前不一样：  
它**不再重复声明**前后端共同契约里的权限条目接口，而是直接复用根目录 `common/contracts` 里的共享类型，再补前端本地专用模型。

它目前最重要的内容是：

- 重新导出共同契约中的：
  - `PermissionTabValue`
  - `ContainerPermissionRole`
  - `IContainerPermissionEntry`
- 前端本地候选模型：
  - `IPermissionPrincipalCandidate`
- 前端按页签分组的列表模型：
  - `PermissionEntriesByTab`

这意味着现在的类型分层是：

- `common/contracts`
  前后端都认的稳定协议
- `models/containerPermissionModels.ts`
  前端为了页面交互补出来的本地模型

---

## 3. 当前前端核心状态是怎么拆的

当前前端权限模块不是把所有状态都堆在 `ContainerPermissionDialog.tsx` 里，而是拆成了几个职责明确的 Hook。

### 3.1 `usePermissionTabs.ts`

这是最小的一层。  
它只负责维护当前选中的是：

- `people`
- `groups`

这层很小，但作用很明确：  
让“当前页签”成为一个独立状态源，而不是散落在组件里。

### 3.2 `usePermissionDraft.ts`

这是当前前端模块最核心的状态层之一。

它维护两份列表：

- `originalEntriesByTab`
  最近一次确认后的基线
- `draftEntriesByTab`
  用户当前正在编辑的草稿

这两份数据为什么不能只保留一份？

因为前端当前有明确的“草稿编辑语义”：

1. `Close` 时要能丢弃本次编辑
2. `Apply` 成功后要把服务端最新结果变成新基线
3. 容器切换时要整体重置

所以这个 Hook 提供的关键能力是：

- `addEntry`
- `updateEntryRole`
- `removeEntry`
- `resetDraft`
- `replaceEntries`
- `hasUnsavedChanges`

你可以把它理解成：

> “权限弹窗里的本地编辑会话状态机”

### 3.3 `useContainerPermissionDialogState.ts`

这个 Hook 负责把“页签 + 草稿 + 每个 tab 的输入框”组合起来。

它做的事情包括：

- 维护当前选中的 `tab`
- 维护 `people / groups` 各自的输入框内容
- 把候选项转换成权限草稿条目
- 判断某个候选项是不是已经加过了
- 统一提供当前 tab 的可见权限列表
- 提供 `discardDraftAndClose`

这个 Hook 的价值是：  
让 `ContainerPermissionDialog.tsx` 主要负责渲染和真实请求，而不是自己手写很多零散 `useState`。

### 3.4 `usePermissionPrincipalSearch.ts`

这是当前前端搜索体验的核心。

注意：**当前现状是 `Combobox` 搜索流，不是 `TagPicker` 搜索流。**

它负责完整的搜索状态机：

- `idle`
- `waitingForMoreInput`
- `debouncing`
- `loading`
- `success`
- `empty`
- `error`

它还负责这些关键行为：

1. 每个 tab 各自维护 query
2. 最少输入 `3` 个字符才允许真正搜索
3. 输入后等待 `1000ms` 再发请求
4. 搜索请求按 tab 隔离
5. 用 `requestSequence` 防止旧请求晚返回覆盖新结果
6. 把目录搜索结果映射成统一候选项
7. 选中后直接加进 Access List 草稿，并清空输入框

一句话理解：

> 这个 Hook 管的是“搜索体验”，不是“权限写回”。

---

## 4. 当前前端数据模型

要看懂这个模块，最重要的不是先记所有文件名，而是先记当前前端到底在操作哪些模型。

### 4.1 共同契约：`IContainerPermissionEntry`

它来自：

```text
common/contracts/containerPermissionCommonContracts.ts
```

前端直接用它作为 Access List 行模型。

最重要的字段有：

- `id`
  前端本地稳定主键，用于渲染和草稿更新
- `permissionId`
  后续 `update/delete` 提交给后端时需要
- `principalId`
  当前人或组的稳定标识
- `principalUserPrincipalName`
  people 新增权限时必须保留
- `principalName`
  表格主标题
- `principalType`
  `people / groups`
- `description`
  副文本
- `role`
  `Reader / Writer / Manager / Owner`

### 4.2 前端本地候选模型：`IPermissionPrincipalCandidate`

这个模型只存在于前端搜索链路里。

它表示：

> “目录搜索结果在 UI 中被渲染和选择时的统一形状”

它和最终权限条目的关系是：

```text
IDirectoryPrincipalSearchResult
  -> IPermissionPrincipalCandidate
  -> IContainerPermissionEntry
```

### 4.3 前端按页签分组模型：`PermissionEntriesByTab`

它是：

```ts
type PermissionEntriesByTab = {
  people: IContainerPermissionEntry[];
  groups: IContainerPermissionEntry[];
};
```

这个模型贯穿了：

- 权限加载结果
- 原始基线
- 草稿状态
- Apply 成功后的刷新结果

---

## 5. 当前前端运行链路

下面按真实运行过程走一遍。

## 第 1 步：容器页打开权限弹窗

入口不在 `permissions/` 目录内部，而在：

```text
src/components/containers/index.tsx
```

容器页负责：

- 选中当前容器
- 把 `containerId` 和 `containerName` 传给 `ContainerPermissionDialog`

这说明边界很清楚：

- 容器页负责“当前我在管理哪个容器”
- 权限模块负责“怎么管理这个容器的权限”

## 第 2 步：弹窗打开时加载当前权限

`ContainerPermissionDialog.tsx` 监听：

- `open`
- `containerId`

当弹窗打开且有容器 id 时，它会调用：

```ts
listContainerPermissions(containerId)
```

拿到结果后调用：

```ts
replaceEntries(entriesByTab)
```

这一步会同时更新：

- `originalEntriesByTab`
- `draftEntriesByTab`

所以“第一次打开弹窗后的真实权限”会直接变成当前本地编辑会话的基线。

## 第 3 步：用户在 Combobox 里输入搜索词

当前组件使用的是：

```tsx
<Combobox />
```

不是 `TagPicker`。

输入时会调用：

```ts
handleQueryChange(event.target.value)
```

然后搜索 Hook 决定下一步：

- 空字符串：回到 `idle`
- 1 到 2 个字符：进入 `waitingForMoreInput`
- 3 个及以上字符：进入 `debouncing`
- 1 秒后真正发目录搜索请求

## 第 4 步：目录搜索服务返回结果，映射成候选项

`usePermissionPrincipalSearch.ts` 拿到目录搜索结果后，会调用：

```ts
mapDirectorySearchResultToCandidate(result, selectedTab)
```

转换成：

```ts
IPermissionPrincipalCandidate
```

这样 UI 不需要知道原始搜索结果来自哪条 Graph 查询。

## 第 5 步：用户选中候选项，直接加进本地草稿

当用户从 `Combobox` 结果里选中某一项时：

1. Hook 先根据 `candidateId` 找回完整候选项
2. 判断是否重复添加
3. 如果没加过，就调用 `addCandidate(...)`
4. 清空当前 query 和当前 tab 的结果列表

`useContainerPermissionDialogState.ts` 里会把候选项转换成新的草稿权限条目：

```ts
{
  id: `${candidate.type}:${candidate.id}`,
  principalId: candidate.id,
  principalUserPrincipalName: candidate.userPrincipalName,
  principalName: candidate.name,
  principalType: candidate.type,
  description: candidate.secondaryText,
  role: "Reader",
}
```

注意这里的当前前端行为：

- 新加条目默认角色是 `Reader`
- 新加条目只是进入草稿，还没有写服务端

## 第 6 步：用户修改角色或删除条目

这两件事都只改草稿：

- 改角色：`updateEntryRole(...)`
- 删除条目：`removeEntry(...)`

此时 `hasUnsavedChanges` 会变成 `true`。

## 第 7 步：点击 `Apply`，前端计算差异

弹窗会调用：

```ts
computeContainerPermissionChanges(
  originalEntriesByTab,
  draftEntriesByTab,
)
```

它只计算三类差异：

- `create`
- `update`
- `remove`

当前前端不会把整张权限表重新提交给后端，只提交差异。

这是当前实现里非常重要的一点。

## 第 8 步：前端把差异交给后端，并用返回值刷新基线

前端调用：

```ts
applyContainerPermissionChanges(containerId, changes)
```

后端完成真正的写回后，会把最新权限列表重新返回给前端。

前端再调用：

```ts
replaceEntries(refreshedEntries)
```

于是：

- `originalEntriesByTab` 被刷新成最新服务端结果
- `draftEntriesByTab` 也同步到同一份结果
- 本地脏状态被清空

---

## 6. 当前前端为什么要分成“搜索链路”和“权限写回链路”

这是现在这个模块最重要的设计边界之一。

### 链路 A：目录搜索

它关注的是：

- 输入框内容
- 最小输入长度
- debounce
- loading / empty / error
- 结果映射
- 防止重复添加

它的核心文件是：

- `hooks/usePermissionPrincipalSearch.ts`
- `services/permissionPrincipalCandidateMapper.ts`
- `services/directoryPrincipalSearch/*`

### 链路 B：权限草稿和写回

它关注的是：

- 原始基线
- 当前草稿
- 角色修改
- 删除条目
- 差异计算
- Apply 成功后刷新基线

它的核心文件是：

- `hooks/usePermissionDraft.ts`
- `hooks/useContainerPermissionDialogState.ts`
- `services/containerPermissionDiff.ts`
- `src/services/containerPermissionApi.ts`

为什么要分开？

因为“搜索某个人”和“把容器权限写回服务端”不是同一件事。

如果把它们硬揉在一起，后续改动会很痛苦，例如：

- 改搜索体验时容易误伤 Apply 流
- 改写回 payload 时容易误伤 Combobox 行为

所以当前结构的价值是：

> 搜索体验单独演进，权限写回逻辑单独演进。

---

## 7. 当前前端和后端的边界关系

虽然这篇 README 以当前前端为主，但你还是要知道它和后端的边界在哪里。

### 前端直接依赖的后端入口

前端不直接调 Graph，它只调：

```text
src/services/containerPermissionApi.ts
```

里面只有两条关键调用：

- `listContainerPermissions(containerId)`
- `applyContainerPermissionChanges(containerId, changes)`

### 前端直接依赖的共同契约

前端现在直接复用：

```text
common/contracts/containerPermissionCommonContracts.ts
```

这意味着前端页面里看到的：

- `IContainerPermissionEntry`
- `IContainerPermissionChangeSet`
- `IContainerPermissionsResponse`

都不是“前端自己乱定义的一套”，而是和后端共享的一套协议。

### 当前后端实现位置

如果你想顺着这条链继续看后端实现，现在的后端入口已经不是旧的单文件了，而是：

```text
server/containerPermissions/
```

其中最值得先看的文件是：

- `containerPermissionsHandlers.ts`
- `containerPermissionsRequestParser.ts`
- `containerPermissionsCommonAdapters.ts`

---

## 8. 当前前端错误处理现状

当前前端会同时处理两类错误：

### 8.1 权限加载 / Apply 错误

来源：

- `listContainerPermissions(...)`
- `applyContainerPermissionChanges(...)`

这类错误最终会被包装成：

```ts
ContainerPermissionApiError
```

如果后端返回了：

- `retryAfterSeconds`
- `requestId`

前端会把它拼进错误文案里。

### 8.2 搜索错误

来源：

- `searchDirectoryPrincipals(...)`
- MGT provider 未登录

这类错误不会阻塞整张权限表，但会在顶部状态区域显示：

- `Search Error: ...`

### 8.3 当前 UI 错误汇总策略

`ContainerPermissionDialog.tsx` 会把两类错误统一映射到顶部状态消息区，而不是在多个位置重复弹错误。

这让当前页面行为更统一，也更容易让用户理解“现在是哪条链路出了问题”。

---

## 9. 当前前端最值得先读的代码顺序

如果你第一次接触这个模块，建议按这个顺序读：

1. `src/components/permissions/ContainerPermissionDialog.tsx`
2. `src/components/permissions/hooks/useContainerPermissionDialogState.ts`
3. `src/components/permissions/hooks/usePermissionDraft.ts`
4. `src/components/permissions/hooks/usePermissionPrincipalSearch.ts`
5. `src/components/permissions/services/containerPermissionDiff.ts`
6. `src/services/containerPermissionApi.ts`
7. `common/contracts/containerPermissionCommonContracts.ts`

如果你之后还想继续理解后端，再去看：

8. `server/containerPermissions/containerPermissionsHandlers.ts`
9. `server/containerPermissions/containerPermissionsRequestParser.ts`
10. `server/containerPermissions/containerPermissionsCommonAdapters.ts`

---

## 10. 读完后你应该记住的 6 个核心点

### 1. 当前前端是 `Combobox` 搜索流，不是 `TagPicker`

这会直接影响你后续读代码和改交互的入口判断。

### 2. 当前前端维护的是“基线 + 草稿”两份权限状态

这不是重复存储，而是为了支持：

- Close 回滚
- Apply 后刷新基线
- 容器切换重置

### 3. 搜索链路和权限写回链路是分开的

搜索只负责：

- 找人 / 找组
- 生成候选项
- 加进草稿

真正写回权限是 Apply 流的事情。

### 4. 前端提交的是差异，不是整张表

差异来自：

```ts
computeContainerPermissionChanges(...)
```

### 5. 前端已经开始直接复用共同契约

`IContainerPermissionEntry` 不再是 permissions 模块里私有复制的一份，它来自根目录共享契约。

### 6. 后端现在已经拆到 `server/containerPermissions/`

所以如果你看到旧文档里还写 `server/containerPermissions.ts`，要以当前代码目录为准。

---

## 11. 如果你要继续扩展当前前端模块，优先注意什么

### 如果你要改搜索体验

优先看：

- `hooks/usePermissionPrincipalSearch.ts`
- `services/permissionPrincipalCandidateMapper.ts`
- `services/directoryPrincipalSearch/*`

特别注意：

- 最少 `3` 个字符才搜索
- `1000ms` debounce
- 请求序号防止旧结果回灌
- people / groups 搜索上下文是隔离的

### 如果你要改本地编辑体验

优先看：

- `hooks/usePermissionDraft.ts`
- `hooks/useContainerPermissionDialogState.ts`

特别注意：

- 不要破坏 `original + draft` 双快照语义
- `Close` 现在就是丢弃草稿
- `replaceEntries(...)` 是对齐服务端结果的关键动作

### 如果你要改 Apply payload

优先看：

- `services/containerPermissionDiff.ts`
- `src/services/containerPermissionApi.ts`
- `common/contracts/containerPermissionCommonContracts.ts`

特别注意：

- people 新增权限需要 `userPrincipalName`
- update / remove 依赖已有条目的 `permissionId`

### 如果你要改后端对接边界

优先看：

- `common/contracts/containerPermissionCommonContracts.ts`
- `src/services/containerPermissionApi.ts`
- `server/containerPermissions/`

不要只改前端类型，不改共同契约。

---

## 12. 一句话总结

当前 `Container Permission` 前端模块的本质是：

> 用 `Combobox` 驱动目录搜索，用“双快照草稿模型”管理本地编辑，用“差异提交”驱动 Apply，并通过 `common/contracts` 和后端保持统一协议。
