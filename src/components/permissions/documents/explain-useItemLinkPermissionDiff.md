# 用例子理解 `useItemLinkPermissionDiff.ts`

这份文档专门讲这个文件在做什么：

- 文件位置：`src/components/permissions/hooks/useItemLinkPermissionDiff.ts`
- 目标：把用户在 links 面板里的每一次“新建 link / 删 link / 加人 / 删人”操作，记录成一份还没提交到后端的本地差异 `diff`

如果你刚接触这个模块，可以先记住一句话：

> `useItemLinkPermissionComputedEntries` 负责“把基线和差异合成界面结果”，而 `useItemLinkPermissionDiff` 负责“把用户动作记成差异”。

也就是说，这个 hook 不是直接改后端，也不是直接算最终渲染列表，而是在维护一份“本轮编辑会话里，用户到底动了什么”的草稿账本。

## 先看这个 hook 维护的数据长什么样

这个文件最核心的状态就是 `diff`。

可以把它理解成下面这种结构：

```ts
const diff = {
  createdLinks: [],
  deletedPermissionIds: [],
  grantsByPermissionId: {},
  revokesByPermissionId: {},
};
```

它分成 4 类差异：

1. `createdLinks`
   表示“本地新建了哪些 link，但还没提交到后端”

2. `deletedPermissionIds`
   表示“后端原本有的哪些 link，被用户标记成整条删除”

3. `grantsByPermissionId`
   表示“对后端已有的某条 specific link，新加了哪些 recipient”

4. `revokesByPermissionId`
   表示“对后端已有的某条 specific link，移除了哪些 recipient”

所以这个 hook 真正在做的事情，不是保存一整张 links 表，而是只记录“增量变化”。

## 先看一个完整例子

假设后端当前真实状态是：

1. 有一条 `specific + write` link，`permissionId = "perm-specific-write"`
2. 这条 link 当前已经授予了 `Alice` 和 `Bob`

现在用户在弹窗里连续做下面 4 个动作：

1. 新建一条 `specific + read` link
2. 给这条新建 link 加上 `Carol`
3. 在已有的 `specific + write` link 里删掉 `Bob`
4. 在同一条已有 link 里再加上 `David`

这时候，这个 hook 最终维护出来的 `diff` 可以理解成：

```ts
const diff = {
  createdLinks: [
    {
      id: "diff-item-link:1",
      scope: "specific",
      type: "read",
      recipients: [{ objectId: "u-carol", displayName: "Carol" }],
    },
  ],
  deletedPermissionIds: [],
  grantsByPermissionId: {
    "perm-specific-write": [{ objectId: "u-david", displayName: "David" }],
  },
  revokesByPermissionId: {
    "perm-specific-write": [{ objectId: "u-bob", displayName: "Bob" }],
  },
};
```

它表达的意思是：

- 有一条本地新建 link 草稿
- 后端没有整条 link 被删除
- 对 `perm-specific-write` 这条已有 link：
  - 要新增 `David`
  - 要移除 `Bob`

后面 `useItemLinkPermissionComputedEntries` 再拿这份 `diff` 去和后端基线合并，界面才会显示成“新 link 先出现，Bob 先消失，David 先出现”的效果。

## 1. 初始化时，这个 hook 会先准备一份空 diff

代码开头：

```ts
const [diff, setDiff] = useState<IItemLinkPermissionDiffState>(
  createEmptyItemLinkPermissionDiffState(),
);
```

意思是：

- 初始进入弹窗时，先假设“用户还没有做任何改动”
- 所以 `createdLinks`、`deletedPermissionIds`、`grantsByPermissionId`、`revokesByPermissionId` 都是空的

你可以把它理解成一张刚打开的草稿纸，上面还什么都没记。

## 2. 切换到别的文件项时，要把上一轮草稿全部清空

这个 hook 依赖一个 `resetKey`：

```ts
useEffect(() => {
  createdLinkSequence.current = 0;
  setDiff(createEmptyItemLinkPermissionDiffState());
}, [resetKey]);
```

这段的意思是：

- 只要当前编辑目标变了
- 上一条 item 的本地 link 草稿就不能继续带到下一条 item

所以它会同时做两件事：

1. 把本地新建 link 的编号计数器清零
2. 把整个 `diff` 重置为空

这样能避免“我在 A 文件上新建的 link 草稿，不小心跑到 B 文件上继续显示”。

## 3. 用户点击“新建 link”时，`addCreatedLink` 会记一条 created diff

来看一个最简单的例子。

假设当前 `diff` 还是空的，用户在创建区选择：

- `scope = "specific"`
- `type = "read"`

然后点击新增。

`addCreatedLink("specific", "read")` 做完之后，会把 `diff` 变成：

```ts
{
  createdLinks: [
    {
      id: "diff-item-link:1",
      scope: "specific",
      type: "read",
      recipients: [],
    },
  ],
  deletedPermissionIds: [],
  grantsByPermissionId: {},
  revokesByPermissionId: {},
}
```

### 这里有两个关键点

#### 3.1 只记本地草稿，不请求后端

这个函数只是往 `createdLinks` 里追加一条本地 entry。

所以这时：

- 界面会先出现一条新 link 草稿行
- 但后端实际上还没有任何变化

#### 3.2 同一个 `scope + type` 组合不会重复创建两次

如果用户已经新建过一条 `specific + read` 草稿，又再次点击同样的组合，
这段逻辑会先 `find`：

```ts
const existingEntry = currentDiff.createdLinks.find(
  (entry) => entry.scope === scope && entry.type === type,
);
```

如果找到，就直接复用已有 id，返回原 `diff`。

不过要先说明一个前提：

- 按现在的前端交互，用户正常从 links 创建区操作时，基本上不可能再手动新建出一条重复草稿

原因不在这个 hook 本身，而是在更外层的 links 面板已经提前挡住了：

- `ItemLinkPermissionPanel.tsx` 会先根据当前 `entries` 计算哪些 `scope:type` 组合已经被占用
- 如果当前 `scope` 下某个 `type` 已经存在，对应的下拉选项就会被禁用
- 如果某个 `scope` 下所有 `type` 都已经占满，对应的 `scope` 选项也会被禁用
- `useItemLinkPermissionUIState.ts` 还会在列表变化后自动切到“下一个可用组合”，避免创建区停在已占用组合上

也就是说，正常情况下，创建区送进 `addCreatedLink` 的应该都是“还没被占用的组合”。

那这里为什么还要再做一次判断？

可以把它理解成 `diff` 层的最后一道保险，主要是为了两件事：

1. 保证 `addCreatedLink` 自己是幂等的
   就算以后调用路径调整了，或者有别的地方直接调用这个函数并传进重复的 `scope:type`，这里也不会把 `createdLinks` 写坏。

2. 让调用方稳定拿到“这条草稿”的 id
   现在外层会使用返回 id 继续做行级 UI 处理，比如新建 `specific` link 后自动展开对应行。命中重复时直接复用旧 id，调用方就不需要再区分“这次是真新增”还是“只是又点到同一个组合”。

也就是说：

- 不会多出第二条一样的 `specific + read` 草稿
- 调用方还能拿到原来那条草稿的 id，继续对它做操作

## 4. 如果用户撤回这条新建 link，`removeCreatedLink` 会直接删掉这条 created diff

继续上面的例子。

当前 `diff` 是：

```ts
{
  createdLinks: [
    {
      id: "diff-item-link:1",
      scope: "specific",
      type: "read",
      recipients: [],
    },
  ],
  deletedPermissionIds: [],
  grantsByPermissionId: {},
  revokesByPermissionId: {},
}
```

如果用户把这条本地草稿整条删除，`removeCreatedLink("diff-item-link:1")` 做完后会变回：

```ts
{
  createdLinks: [],
  deletedPermissionIds: [],
  grantsByPermissionId: {},
  revokesByPermissionId: {},
}
```

这里为什么可以直接删掉？

因为这条 link 还没有提交到后端，所以它没有 persisted 基线可对照。对这种草稿行来说，“删除”就等于“把草稿从本地抹掉”。

## 5. 给本地新建 link 加人时，`addRecipientToCreatedLink` 只改 `createdLinks`

还是看刚才那条本地新建的 `specific + read` link。

假设它当前是：

```ts
{
  id: "diff-item-link:1",
  scope: "specific",
  type: "read",
  recipients: [],
}
```

如果用户给它加上 `Carol`，也就是调用：

```ts
addRecipientToCreatedLink("diff-item-link:1", Carol);
```

那这条 created entry 会变成：

```ts
{
  id: "diff-item-link:1",
  scope: "specific",
  type: "read",
  recipients: [Carol],
}
```

### 这里为什么是改 `createdLinks`，而不是改 `grantsByPermissionId`

因为这条 link 根本还没提交到后端。

也就是说：

- 它没有 `permissionId`
- 它不是一条 persisted link

所以对它的 recipient 操作，本质上是在编辑“这条新 link 草稿本身”，而不是在对某个已有 permission 记录增删人。

### 这里还会做一次去重

函数会先给 `candidate` 算一个统一 key，再检查：

```ts
const alreadyExists = entry.recipients.some(
  (recipient) => getItemLinkPermissionRecipientKey(recipient) === candidateKey,
);
```

如果 `Carol` 已经在这条草稿 link 里了，就直接返回原 entry，不重复追加第二次。

## 6. 从本地新建 link 里删人时，`removeRecipientFromCreatedLink` 也是直接改 `createdLinks`

如果当前这条本地草稿是：

```ts
{
  id: "diff-item-link:1",
  scope: "specific",
  type: "read",
  recipients: [Carol, David],
}
```

用户把 `David` 移除后，会变成：

```ts
{
  id: "diff-item-link:1",
  scope: "specific",
  type: "read",
  recipients: [Carol],
}
```

这里的逻辑仍然很直接：

- 它不是 persisted link
- 所以也不需要 `grant / revoke` 对冲
- 直接把草稿 entry 里的 `recipients` 数组过滤一遍就够了

## 7. 删除一条后端已有 link 时，`deletePersistedLink` 只记 `permissionId`

现在切换到 persisted link 的情况。

> Note: 可以先把这个项目里的 link change 模型理解成两层：
> 一层是“link 本身”的增删，比如新建一条 link、删除一条 link；
> 另一层是“specific link 下面的 recipients”增删，也就是给这条 link 加人或删人。
> 在 `diff` 里，这两层没有拆成两份彼此独立的状态，而是放在同一份账本里：
> `deletedPermissionIds` 记录 link 层变化，`grantsByPermissionId` / `revokesByPermissionId` 记录 recipient 层变化，
> 中间靠 `permissionId` 把“这是谁下面的 recipient 变化”串起来。

假设后端原本有一条：

```ts
{
  permissionId: "perm-specific-write",
  scope: "specific",
  type: "write",
}
```

如果用户整条删除它，`deletePersistedLink("perm-specific-write")` 不会把整条 entry 塞进 diff，而只会记下：

```ts
{
  deletedPermissionIds: ["perm-specific-write"],
}
```

也就是说，这个 hook 的想法是：

- “整条 link 要删掉”这件事，只需要知道是哪条 persisted permission
- 不需要在 diff 里重复保存那条 link 的所有完整字段

### 这里还会顺手清掉这条 link 上原本记录的 grant / revoke

如果之前这条 link 上已经有：

```ts
grantsByPermissionId: {
  "perm-specific-write": [David],
},
revokesByPermissionId: {
  "perm-specific-write": [Bob],
}
```

那 `deletePersistedLink("perm-specific-write")` 之后，这两块也会一起被删掉。

原因很简单：

- 整条 link 都没了
- 它上面的“加谁 / 删谁”这些局部差异就没有意义了

最终你只需要保留“这条 link 要整条删除”这一个事实。

## 8. 给后端已有 link 加人时，`addGrantRecipient` 分两种情况

这是这个文件里最容易绕的一段。

先记住它的目标：

- 不是直接改 persisted 数据
- 而是往 `grantsByPermissionId` 里记一条增量
- 但前提是，不要和已有的 `revoke` 打架

### 情况 8.1：正常给 persisted link 加一个新的人

假设当前 `diff` 里还没有关于 `perm-specific-write` 的 revoke：

```ts
{
  grantsByPermissionId: {},
  revokesByPermissionId: {},
}
```

如果调用：

```ts
addGrantRecipient("perm-specific-write", David);
```

结果会变成：

```ts
{
  grantsByPermissionId: {
    "perm-specific-write": [David],
  },
  revokesByPermissionId: {},
}
```

这就是最普通的路径：

- 没有相反的 revoke 需要抵消
- 那就直接记一条 grant

### 情况 8.2：这个人上一拍刚被本地 revoke，现在又被重新加回来

假设当前 `diff` 是：

```ts
{
  grantsByPermissionId: {},
  revokesByPermissionId: {
    "perm-specific-write": [Bob],
  },
}
```

这表示：

- 后端本来有 `Bob`
- 用户刚才先把 `Bob` 标记成“移除”

但紧接着，用户又把 `Bob` 重新加回来了。

这时如果调用：

```ts
addGrantRecipient("perm-specific-write", Bob);
```

正确结果不是：

```ts
{
  grantsByPermissionId: {
    "perm-specific-write": [Bob],
  },
  revokesByPermissionId: {
    "perm-specific-write": [Bob],
  },
}
```

因为那样就变成“同一个人同时要加、又要删”，语义互相打架。

这个函数真正会做的是：

- 先检查当前 `permissionId` 下有没有 revoke
- 如果发现 revoke 的正好就是这个人
- 就把那条 revoke 抵消掉

所以结果会变成：

```ts
{
  grantsByPermissionId: {},
  revokesByPermissionId: {},
}
```

这表达的含义是：

- `Bob` 本来就在 persisted 基线里
- 用户先删后加，最终等于“什么都没变”

## 9. 给后端已有 link 删人时，`addRevokeRecipient` 也分两种情况

这段和上一段正好是镜像关系。

它的目标是：

- 先看看这个人是不是本地刚加的
- 如果是，就撤销那条未提交 grant
- 如果不是，才真正补一条 revoke

### 情况 9.1：删除的是“本地刚加、还没提交”的人

假设当前 `diff` 是：

```ts
{
  grantsByPermissionId: {
    "perm-specific-write": [David],
  },
  revokesByPermissionId: {},
}
```

这表示：

- `David` 不是 persisted 基线里本来就有的人
- 他只是本轮刚刚被本地加上去

如果这时用户又把 `David` 删掉，调用：

```ts
addRevokeRecipient("perm-specific-write", David);
```

结果不会变成“给 David 记一条 revoke”。

相反，它会先调用 `removeCandidateFromRecipientMap`，把那条 grant 直接删掉，最后变成：

```ts
{
  grantsByPermissionId: {},
  revokesByPermissionId: {},
}
```

意思是：

- `David` 只是本地草稿里短暂出现过
- 既然还没提交就又删掉了，那最终等于没发生过

### 情况 9.2：删除的是 persisted 基线里本来就有的人

假设当前 `diff` 是：

```ts
{
  grantsByPermissionId: {},
  revokesByPermissionId: {},
}
```

而 persisted 基线里原本有 `Bob`。

如果用户移除 `Bob`，调用：

```ts
addRevokeRecipient("perm-specific-write", Bob);
```

这时 `removeCandidateFromRecipientMap` 会发现：

- `grantsByPermissionId["perm-specific-write"]` 里没有 `Bob`
- 也就是说，这不是“撤回未提交 grant”

于是它才会继续往 `revokesByPermissionId` 里追加：

```ts
{
  grantsByPermissionId: {},
  revokesByPermissionId: {
    "perm-specific-write": [Bob],
  },
}
```

这才是在表达：

- `Bob` 原本就在后端基线里
- 本轮用户明确要把他移除

## 10. `addCandidateToRecipientMap` 和 `removeCandidateFromRecipientMap` 在干什么

这两个工具函数可以把它们理解成：

- 一个负责“往某个 `permissionId` 的 recipient 数组里加人”
- 一个负责“从某个 `permissionId` 的 recipient 数组里删人”

它们本身并不关心这是 `grant` 还是 `revoke`，也不关心 persisted 基线是什么，只是负责做 map 级别的不可变更新。

### 10.1 `addCandidateToRecipientMap`

假设当前是：

```ts
const grantsByPermissionId = {
  "perm-specific-write": [David],
};
```

如果再加 `Carol`，结果会变成：

```ts
{
  "perm-specific-write": [David, Carol],
}
```

如果加的还是 `David`，它会先做 key 去重，发现已存在，于是直接返回原 map 引用，不制造无意义的新对象。

### 10.2 `removeCandidateFromRecipientMap`

假设当前是：

```ts
const grantsByPermissionId = {
  "perm-specific-write": [David, Carol],
};
```

如果移除 `David`，会变成：

```ts
{
  "perm-specific-write": [Carol],
}
```

如果移除之后数组空了：

```ts
const grantsByPermissionId = {
  "perm-specific-write": [David],
};
```

删除 `David` 后不会变成：

```ts
{
  "perm-specific-write": [],
}
```

而是会直接变成：

```ts
{
}
```

也就是把整个 key 都删掉。

这样 `diff` 会更干净，因为空数组本身已经不表达任何有效差异了。

## 11. `hasUnsavedChanges` 是怎么来的

这个 hook 最后会返回：

```ts
hasUnsavedChanges: hasItemLinkPermissionDiffChanges(diff);
```

它的意思是：

- 只要 `createdLinks` 不为空
- 或 `deletedPermissionIds` 不为空
- 或 `grantsByPermissionId` 里有数据
- 或 `revokesByPermissionId` 里有数据

就说明本轮用户做过还没提交的修改。

所以这个布尔值通常是给外层 UI 用来做这些判断：

- 是否高亮“有未保存更改”
- 是否启用 `Apply`
- 是否在关闭弹窗前提示用户

## 12. `resetDiff` 做的事情最简单，但非常重要

`resetDiff()` 会直接把整个 `diff` 重置为空：

```ts
setDiff(createEmptyItemLinkPermissionDiffState());
```

这一般对应两种场景：

1. 用户主动点击“放弃本地编辑”
2. 上层在切换 item / 重新加载时，需要把旧草稿全部清掉

它的重点在于：

- 只清本地差异
- 不碰后端已加载基线

所以 reset 后的效果不是“删掉后端 link”，而是“把本轮草稿全部撤销，界面回到基线状态”。

## 可以把这个 hook 理解成什么

如果你想记一句最核心的话，可以把它理解成：

> 这是一个“本地差异记账器”。

它不负责：

- 发请求
- 改后端真实数据
- 直接合成最终渲染列表

它负责的是：

- 记录新建了哪些 link
- 记录删掉了哪些 persisted link
- 记录对 persisted specific link 做了哪些 grant / revoke
- 在相反操作发生时，把彼此抵消掉，保证 diff 始终表达“最终还剩下的改动”

## 读这个文件时最值得盯住的 5 个关键词

如果你以后要自己再读一遍源码，最建议盯住下面 5 个词：

1. `created`
   表示“本地新建但还没提交的整条 link”

2. `deleted`
   表示“后端已有 link 被标记成整条删除”

3. `grant`
   表示“给 persisted specific link 新加的人”

4. `revoke`
   表示“从 persisted specific link 移除的人”

5. `cancel out`
   虽然源码里没有这个词，但读的时候最好一直带着这个意识：
   先加后删、先删后加，这两类相反操作通常不会并存，而是应该彼此抵消

理解了这 5 个词，再回头看这个文件的代码路径，会容易很多。
