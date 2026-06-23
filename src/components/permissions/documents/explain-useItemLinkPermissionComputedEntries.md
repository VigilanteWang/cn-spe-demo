# 用例子理解 `useItemLinkPermissionComputedEntries.ts`

这份文档专门讲这个文件在做什么：

- 文件位置：`src/components/permissions/hooks/useItemLinkPermissionComputedEntries.ts`
- 目标：把“后端当前真实存在的 link 权限”加上“用户在弹窗里还没提交的本地修改”，合成为“界面现在应该显示的 links 列表”

如果你刚接触这个模块，可以先不要急着看抽象定义，先看一个具体例子。

## 先看例子

假设后端当前返回了 3 条 link：

1. 一条 `anonymous + read` link
2. 一条 `specific + write` link，当前授予了 `Alice` 和 `Bob`
3. 一条 `organization + review` link

我们把它简化成下面这样：

```ts
const originalEntries = [
  {
    id: "row-anonymous-read",
    permissionId: "perm-anonymous-read",
    shareId: "share-anonymous-read",
    webUrl: "https://contoso/link-a",
    scope: "anonymous",
    type: "read",
    roleLabel: "Can view",
    preventsDownload: false,
    grantedToIdentities: [],
    grantedToCount: 0,
  },
  {
    id: "row-specific-write",
    permissionId: "perm-specific-write",
    shareId: "share-specific-write",
    webUrl: "https://contoso/link-b",
    scope: "specific",
    type: "write",
    roleLabel: "Can edit",
    preventsDownload: false,
    grantedToIdentities: [
      { graphId: "u-alice", displayName: "Alice" },
      { graphId: "u-bob", displayName: "Bob" },
    ],
    grantedToCount: 2,
  },
  {
    id: "row-organization-review",
    permissionId: "perm-organization-review",
    shareId: "share-organization-review",
    webUrl: "https://contoso/link-c",
    scope: "organization",
    type: "review",
    roleLabel: "Can review",
    preventsDownload: false,
    grantedToIdentities: [],
    grantedToCount: 0,
  },
];
```

这时用户在弹窗里做了这些还没提交的操作：

1. 把 `specific + write` link 里的 `Bob` 移除
2. 给这条 `specific + write` link 新增 `Carol`
3. 删除整条 `organization + review` link
4. 新建一条 `specific + read` link，但是还没选任何人

于是本地草稿 `draft` 可以理解成：

```ts
const draft = {
  createdLinks: [
    {
      id: "draft-item-link:1",
      scope: "specific",
      type: "read",
      recipients: [],
    },
  ],
  deletedPermissionIds: ["perm-organization-review"],
  grantsByPermissionId: {
    "perm-specific-write": [{ objectId: "u-carol", name: "Carol" }],
  },
  revokesByPermissionId: {
    "perm-specific-write": [{ objectId: "u-bob", name: "Bob" }],
  },
};
```

这个 hook 的任务，就是把上面两份数据合并成“界面当前应该渲染出来的最终结果”。

## 最终会显示成什么

按这个例子，界面最后应该看到的是：

1. `anonymous + read` 还在
2. `specific + write` 还在，但 recipients 从 `Alice + Bob` 变成 `Alice + Carol`
3. `organization + review` 先从界面消失，因为用户已经标记删除
4. 多出一条新的 `specific + read` 草稿 link
5. 因为这条新建的 `specific + read` 还没有 recipient，所以 `Apply` 应该被禁用

这就是这个文件最终返回的两个东西：

- `entries`：给界面真正渲染的列表
- `hasBlockingValidationError`：是否存在阻止提交的校验错误

## 第 1 步：先处理“哪些后端 link 还应该继续显示”

代码开头先把草稿里的 `deletedPermissionIds` 转成 `Set`：

```ts
const deletedPermissionIds = new Set(draft.deletedPermissionIds);
```

这样做是为了快速判断某条后端 link 有没有被“整条删除”。

然后它会先过滤掉这些被删除的 persisted link：

```ts
const persistedEntries = originalEntries
  .filter((entry) => !deletedPermissionIds.has(entry.permissionId))
```

套回刚才的例子：

- `perm-anonymous-read` 保留
- `perm-specific-write` 保留
- `perm-organization-review` 被过滤掉

所以到了这一步，`organization + review` 已经不会继续参与渲染了。

## 第 2 步：如果不是 `specific` link，就直接返回

这是这个文件现在一个很重要的分支：

```ts
if (entry.scope !== ITEM_LINK_PERMISSION_SCOPES.specific) {
  return {
    ...,
    grantedToCount: entry.grantedToCount,
    recipients: [],
    hasValidationError: false,
  };
}
```

意思是：

- `anonymous`
- `organization`

这两类 link 不需要展开成具体 recipient 列表，所以不需要继续做 `grant/revoke` 合并计算。

它们仍然要出现在最终列表里，但只是普通行，不展示 recipient 明细。

套回例子：

- `anonymous + read` 在这里会直接返回
- 它会保留自己的 `grantedToCount`
- `recipients` 会是空数组

这样代码就不会浪费时间去算这类 link 根本不会展示的 recipient 细节。

## 第 3 步：只有 `specific` link 才继续处理 recipients

如果当前 entry 是 `specific`，代码才会继续往下走。

### 3.1 先把后端原始 identity 转成前端统一 recipient 结构

代码会先把 `grantedToIdentities` 转成前端统一使用的 `candidate`：

```ts
const persistedRecipients = entry.grantedToIdentities.map((identity) => {
  const candidate = mapGraphIdentityToItemLinkRecipientCandidate(identity);

  return {
    key: getItemLinkPermissionRecipientKey(candidate),
    candidate,
    source: "persisted",
  };
});
```

这里可以把它理解成：

- 后端返回的是 Graph 风格 identity
- 前端渲染和增删判断更想要统一的 recipient 结构
- 所以先转换一次

在例子里，这一步会得到：

```ts
persistedRecipients = [
  { key: "u-alice", candidate: Alice, source: "persisted" },
  { key: "u-bob", candidate: Bob, source: "persisted" },
];
```

这里的 `key` 非常重要，它是后面判断“是不是同一个人”的统一依据。

## 第 4 步：找出哪些旧 recipient 被本轮 revoke 了

接着代码会去看：

```ts
draft.revokesByPermissionId[entry.permissionId]
```

也就是“这条 specific link 本轮被移除的人有哪些”。

然后把它们也转换成统一 key：

```ts
const revokedRecipientKeys = new Set(
  (draft.revokesByPermissionId[entry.permissionId] ?? []).map((candidate) =>
    getItemLinkPermissionRecipientKey(candidate),
  ),
);
```

在例子里：

```ts
revokedRecipientKeys = new Set(["u-bob"]);
```

这表示：`Bob` 虽然现在还真实存在于后端基线里，但从“当前界面应该展示的结果”来看，他应该先被隐藏掉。

## 第 5 步：找出哪些新 recipient 被本轮 grant 了

然后代码会去看：

```ts
draft.grantsByPermissionId[entry.permissionId]
```

也就是“这条 specific link 本轮新增了哪些人”。

它会把这些新 grant 的人也转成可渲染结构：

```ts
const grantedRecipients = (
  draft.grantsByPermissionId[entry.permissionId] ?? []
)
  .map((candidate) => ({
    key: getItemLinkPermissionRecipientKey(candidate),
    candidate,
    source: "draft",
  }))
```

在例子里：

```ts
grantedRecipients = [
  { key: "u-carol", candidate: Carol, source: "draft" },
];
```

但这里还没结束，它还会做一次去重：

```ts
.filter(
  (recipient) =>
    !persistedRecipients.some(
      (persistedRecipient) => persistedRecipient.key === recipient.key,
    ),
);
```

意思是：

- 如果某个人本来就已经在 persistedRecipients 里
- 那就不要因为本地 grant 再重复显示一遍

这一步是在保护界面，避免同一个人出现两次。

## 第 6 步：把“该隐藏的旧人”和“该新增的人”合并起来

先把被 revoke 的旧 recipient 去掉：

```ts
const visiblePersistedRecipients = persistedRecipients.filter(
  (recipient) => !revokedRecipientKeys.has(recipient.key),
);
```

在例子里：

```ts
visiblePersistedRecipients = [
  { key: "u-alice", candidate: Alice, source: "persisted" },
];
```

然后把它和新 grant 的人拼起来：

```ts
const recipients = [
  ...visiblePersistedRecipients,
  ...grantedRecipients,
];
```

例子里最终变成：

```ts
recipients = [
  { key: "u-alice", candidate: Alice, source: "persisted" },
  { key: "u-carol", candidate: Carol, source: "draft" },
];
```

这就是为什么界面上你会看到：

- `Alice` 还在
- `Bob` 不见了
- `Carol` 已经先显示出来了

虽然这时用户还没点 `Apply`，但 UI 已经在“预演最终结果”了。

## 第 7 步：生成这条 `specific` link 的最终渲染行

有了最终 `recipients` 后，代码就会构造这一条 `computed entry`：

```ts
return {
  id: entry.id,
  source: "persisted",
  permissionId: entry.permissionId,
  shareId: entry.shareId,
  webUrl: entry.webUrl,
  scope: entry.scope,
  type: entry.type,
  roleLabel: entry.roleLabel,
  preventsDownload: entry.preventsDownload,
  grantedToCount: recipients.length,
  recipients,
  hasValidationError: false,
};
```

这里要注意 `grantedToCount`：

- 对 `specific` link，不再直接用后端原来的 `grantedToCount`
- 而是用当前合并后的 `recipients.length`

所以例子里的 `specific + write`：

- 原来后端 count 是 `2`
- 现在界面上的最终 recipients 是 `Alice + Carol`
- count 仍然是 `2`

如果最后只剩一个人，那这里就会实时变成 `1`

## 第 8 步：处理“本地新建但还没提交”的 link

前面讲的是 persisted link，也就是后端原来就有的 link。

接下来代码会处理：

```ts
draft.createdLinks
```

这部分表示“用户刚在弹窗里新建出来，但还没有提交到后端”的 link。

代码会把它们也转换成统一的 `IItemLinkPermissionComputedEntry`：

```ts
const createdEntries = draft.createdLinks.map((entry) => ({
  id: entry.id,
  source: "draft",
  scope: entry.scope,
  type: entry.type,
  roleLabel: getItemLinkPermissionRoleLabel(entry.type),
  preventsDownload: entry.type === "blocksDownload",
  grantedToCount:
    entry.scope === ITEM_LINK_PERMISSION_SCOPES.specific
      ? entry.recipients.length
      : 0,
  recipients:
    entry.scope === ITEM_LINK_PERMISSION_SCOPES.specific
      ? ...
      : [],
  hasValidationError:
    entry.scope === ITEM_LINK_PERMISSION_SCOPES.specific &&
    entry.recipients.length === 0,
}));
```

这里最重要的是两个点。

### 8.1 新建 link 的 `roleLabel` 要前端自己算

因为它还没提交到后端，所以后端还没返回 `roleLabel`。

因此代码会用：

```ts
getItemLinkPermissionRoleLabel(entry.type)
```

按 `type` 直接算出展示文案。

### 8.2 新建的 `specific` link 如果没有 recipient，就是校验错误

这段逻辑是：

```ts
hasValidationError:
  entry.scope === ITEM_LINK_PERMISSION_SCOPES.specific &&
  entry.recipients.length === 0
```

回到例子里，新建的是一条：

- `specific + read`
- `recipients = []`

所以这条新建行会被标记成：

```ts
hasValidationError: true
```

意思是：

- 这条行可以先显示出来
- 但它现在还不完整
- 用户必须先选至少一个人，才能安全提交

## 第 9 步：把 persisted 和 created 混在一起排序

前面得到两组数据：

- `persistedEntries`
- `createdEntries`

代码会把它们拼起来排序：

```ts
const sortedEntries = [...persistedEntries, ...createdEntries].sort(...)
```

排序规则分三层：

1. 先按 `scope`
2. 同一个 `scope` 下按 `type`
3. 如果 `scope` 和 `type` 都一样，`persisted` 排在 `draft` 前面

对应代码是：

```ts
const scopeRankDiff =
  getScopeSortRank(left.scope) - getScopeSortRank(right.scope);

const typeRankDiff =
  getTypeSortRank(left.type) - getTypeSortRank(right.type);

return left.source === "persisted" ? -1 : 1;
```

这样做的好处是：列表顺序稳定。

不会因为你刚加了一条本地草稿 link，整个列表看起来忽上忽下，用户也更容易理解“真实已存在的数据”和“我刚刚新建的草稿”之间的关系。

## 第 10 步：算出最终返回值

最后，这个 hook 返回：

```ts
return {
  entries: sortedEntries,
  hasBlockingValidationError: sortedEntries.some(
    (entry) => entry.hasValidationError,
  ),
};
```

这表示：

- `entries`：links 面板此刻真正应该渲染的最终列表
- `hasBlockingValidationError`：只要任意一行有阻塞性错误，就禁用 `Apply`

套回例子：

### 最终 `entries` 可以理解成

```ts
[
  {
    scope: "anonymous",
    type: "read",
    source: "persisted",
    recipients: [],
    hasValidationError: false,
  },
  {
    scope: "specific",
    type: "read",
    source: "draft",
    recipients: [],
    hasValidationError: true,
  },
  {
    scope: "specific",
    type: "write",
    source: "persisted",
    recipients: ["Alice", "Carol"],
    hasValidationError: false,
  },
];
```

### 最终 `hasBlockingValidationError`

```ts
true
```

因为新建的 `specific + read` 还是空 recipient。

## 可以把这个 hook 理解成什么

如果你想记一句最核心的话，可以把它理解成：

> 这是一个“界面结果预演器”。

它不负责：

- 发请求
- 改后端数据
- 自己保存状态

它负责的是：

- 读取后端基线 `originalEntries`
- 读取前端草稿 `draft`
- 算出“如果用户现在点 Apply，当前列表看起来应该是什么样子”

所以这个文件的价值，不是做业务提交，而是让 UI 能在提交前就稳定、准确地展示最终结果。

## 读这个文件时最值得盯住的 4 个关键词

如果你以后要自己再读一遍源码，最建议盯住下面 4 个词：

1. `persisted`
   表示后端本来就存在的东西

2. `draft`
   表示用户本轮还没提交的本地修改

3. `specific`
   只有这种 link 才需要真正处理 recipients 明细

4. `computed`
   表示这不是原始数据，而是“合并计算后的最终显示结果”

理解了这 4 个词，再回头看代码，会容易很多。
