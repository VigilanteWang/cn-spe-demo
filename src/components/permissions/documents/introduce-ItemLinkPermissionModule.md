# 初识 `itemLinkPermission` 模块

这篇文档面向刚接触这个模块的同学。

目标不是把所有实现细节一次讲完，而是先帮你建立一个稳定的整体印象：

1. `itemLinkPermission` 在解决什么问题
2. 这个模块在当前项目里是怎么建模的
3. 一次简单的编辑过程，是怎么从前端本地状态一路走到后端 `apply` 的

---

## 1. 背景：`item link permission` 是什么

在 SharePoint Embedded 里，一个文件除了可以通过显式权限 （Direct Access）控制“谁能访问”，还可以通过链接 （Share Link）控制“谁能拿着链接访问”。

这个模块处理的就是后一类能力，也就是：

> 给某个 item 创建、读取、修改 sharelink。

它和传统“直接维护一整张用户权限表”的思路不太一样。

原因是 sharelink 本身就是一个独立对象：

- 先有一条 link
- 再决定这条 link 的分享范围 （scope）和权限类型（type）
- 如果它是 `specific` link，还要继续决定这条 link 下面具体授予给谁

所以在 Graph 侧，这件事天然会拆成几个 API。

### 1.1 当前最关键的 3 个 Graph API

结合官方文档，可以先记住 3 个 API：

1. `createLink`
   给出 `scope` 和 `type`，为某个 item 创建一条 link

2. `permission/grant`
   给 `specific` link 补充特定用户 Specific people，graph 里称为 `recipients`；
3. `permission/revokeGrants`
   从已有 `specific` link 移除 recipients；

这里最容易误解的一点是：

- `createLink` 负责创建“这条 link 本身”
- 但 recipient 的增删，不管是新建出来的，还是已经存在的 `specific` link，需要再执行 `grant / revoke` Graph 操作

### 1.2 `scope` 是什么

`scope` 主要回答的是：

> 这条 link 面向哪一类对象开放

当前项目里实现这 3 种：

- `anonymous`
  任何拿到链接的人都可以按链接权限访问

- `organization`
  组织内登录的人可以访问

- `specific`
  只有被明确授予的对象可以通过这条链接访问

这里有一个很重要的点：

- 在业务说明和前端讲解里，我们常说 `specific`
- 但在共享合同和 graph api 里，这个值实际是 `users`
- 为了避免和直接授予的显式权限（对，它在 graph 里也叫 User Permission）混淆，所以这里才改的

也就是说，下面两种说法在当前项目里指的是同一类 link：

```ts
ITEM_LINK_PERMISSION_SCOPES.specific;
```

```json
"scope": "users"
```

### 1.3 `type` 是什么

`type` 主要回答的是：

> 这条 link 允许什么样的访问方式

当前共享合同里支持 4 种：

- `view`
  只读查看

- `edit`
  允许编辑

- `review`
  在 Word 里，可以理解成“除了查看之外，还允许添加评论/批注”的权限

- `blocksDownload`
  只读查看, 并且禁止下载

### 1.4 本项目里已经验证过的几点结论

1. 同一个 `scope:type` 组合不额外做前置查重，因为如果已存在同一组合的 link，调用 `createLink` 会返回已有 link，而不会新建。可以认为一个 item，一共可以建 scope X type 即 12 条 link

2. SPE 中，只有受支持的 Office 文件，添加 link 才有意义。其它文件类型或文件夹，虽能创建，但都会重定向到 https://aka.ms/spe-openfilelocation

---

## 2. 当前代码大致分成哪几层

可以先把它粗略理解成 3 层：

1. `common/contracts`
   前后端共享的稳定合同层

2. `src/components/permissions`
   前端本地状态、渲染模型、交互编排

3. `server/itemPermissions/linkPermission`
   后端解析请求、调用 Graph、回读最新结果

先看文件树，再记职责。

### 2.1 共同契约

```text
common/
├─ contracts/
│  └─ itemPermissionCommonContracts.ts
└─ helper/
   └─ itemLinkPermissionCommonHelper.ts
```

- `itemPermissionCommonContracts.ts`
  定义 `scope`、`type`、响应 entry、`apply` 请求体等前后端共享合同

- `itemLinkPermissionCommonHelper.ts`
  提供 links 模块前后端都会复用的共享 helper，比如目标文件是否支持 link share、`scope/type` 白名单判断、`roleLabel` 映射

### 2.2 前端 links 相关文件

```text
src/components/permissions/

├─ models/
│  └─ itemLinkPermissionModels.ts
├─ hooks/
│  ├─ useItemLinkPermissionDiff.ts
│  ├─ useItemLinkPermissionComputedEntries.ts
│  ├─ useItemLinkPermissionUIState.ts
│  └─ useItemLinkPermissionApiRequestState.ts
├─ components/
│  └─ ItemLinkPermissionPanel.tsx
└─ utils/
   └─ itemLinkPermissionUiUtils.ts
```

- `models/itemLinkPermissionModels.ts`
  定义前端自己的 `diff`、`computed entry`、recipient 展示模型

- `hooks/useItemLinkPermissionDiff.ts`
  记录本地的 `create / delete / grant / revoke` 差异

- `hooks/useItemLinkPermissionComputedEntries.ts`
  把后端基线和前端差异合成界面当前应该显示的列表

- `hooks/useItemLinkPermissionUIState.ts`
  编排 links 面板的本地交互状态和事件回调

- `hooks/useItemLinkPermissionApiRequestState.ts`
  负责懒加载 link 权限、准备 `apply` 请求、提交成功后替换基线

- `components/ItemLinkPermissionPanel.tsx`
  links tab 自己的 UI 面板

- `utils/itemLinkPermissionUiUtils.ts`
  放前端映射、去重 key、空状态工厂、change set 组装等工具

### 2.3 后端 links 相关文件

```text
server/itemPermissions/
├─ index.ts
└─ linkPermission/
   ├─ itemLinkPermissionHandlers.ts
   ├─ itemLinkPermissionRequestParser.ts
   ├─ itemLinkPermissionService.ts
   ├─ itemLinkPermissionGraphAdapters.ts
   └─ itemLinkPermissionErrors.ts
```

- `server/itemPermissions/index.ts`
  作为 item permissions 区域的导出边界

- `itemLinkPermissionHandlers.ts`
  接住 HTTP 请求，读取路由参数，调用 parser 和 service

- `itemLinkPermissionRequestParser.ts`
  把外部 `req.body` 收窄成后端真正接受的 `apply` 合同

- `itemLinkPermissionService.ts`
  负责真正执行业务顺序：读、写、回读

- `itemLinkPermissionGraphAdapters.ts`
  负责 Graph 请求体和 Graph 返回结果的映射

- `itemLinkPermissionErrors.ts`
  统一创建这个模块使用的业务错误

---

## 3. 先记住这几个核心模型

第一次读代码时，不要急着记所有函数名，先记住下面 4 个模型。

### 3.1 后端确认过的基线：`IItemLinkPermissionEntryForUI`

它来自：

```ts
common / contracts / itemPermissionCommonContracts.ts;
```

你可以把它理解成：

> 后端最新确认过的一条 link permission 长什么样

它通常会包含这些关键信息：

- `permissionId`
  这条 persisted link 在后端的稳定标识

- `shareId`
  之后做 `grant` / `revoke` 时要用到的链接标识

- `scope`
  这条 link 是 `anonymous`、`organization` 还是 `users`

- `type`
  这条 link 是 `view`、`edit`、`review` 还是 `blocksDownload`

- `grantedToIdentities`
  这条 link 当前已经授予了哪些对象

### 3.2 前端本地差异：`IItemLinkPermissionDiffState`

它来自：

```ts
src / components / permissions / models / itemLinkPermissionModels.ts;
```

它长这样：

```ts
interface IItemLinkPermissionDiffState {
  createdLinks: IItemLinkPermissionCreatedLinkDiff[];
  deletedPermissionIds: string[];
  grantsByPermissionId: Record<string, IItemLinkPermissionRecipientCandidate[]>;
  revokesByPermissionId: Record<
    string,
    IItemLinkPermissionRecipientCandidate[]
  >;
}
```

它表达的是：

> 本轮编辑里，用户相对后端基线到底改了什么

注意这里不是“前端维护一整张 link 快照”，而是只维护增量差异。

### 3.3 前端计算后的渲染行：`IItemLinkPermissionComputedEntry`

它同样来自前端 `models`。

你可以把它理解成：

> 当前界面真正应该显示出来的一行

它不是后端原始 entry，也不是 `diff` 自身，而是：

```text
originalEntries + diff -> computed entries
```

### 3.4 后端 `apply` 请求体：`IApplyItemLinkPermissionChangesRequest`

它来自共享合同层：

```ts
interface IApplyItemLinkPermissionChangesRequest {
  create: IItemLinkPermissionCreateChange[];
  deleteLinks: IItemLinkPermissionDeleteChange[];
  grantRecipients: IItemLinkPermissionGrantRecipientsChange[];
  revokeRecipients: IItemLinkPermissionRevokeRecipientsChange[];
}
```

它表达的是：

> 前端最终提交给后端的，不是整张表，而是 4 组变化

---

## 4. 用一个简单例子走一遍

这一节只覆盖你最常碰到的两种情况：

1. 新建一条 `specific` link，并给它加一个人
2. 给已有 `specific` link 加一个人、删一个人

为了让主线清楚，我们故意不引入整条 link 删除，也不额外放 `anonymous` 和 `organization` 的复杂分支。

### 4.1 例子的起点：后端当前基线

假设后端当前已经有一条 persisted link：

- `scope = users`
- `type = edit`
- 当前 recipients 只有 `Alice`

把它简化成下面这样：

```json
[
  {
    "id": "row-specific-edit",
    "permissionId": "perm-specific-edit",
    "shareId": "share-specific-edit",
    "webUrl": "https://contoso.example/edit-link",
    "scope": "users",
    "type": "edit",
    "roleLabel": "Edit",
    "preventsDownload": false,
    "grantedToIdentities": [
      {
        "graphId": "user-alice",
        "displayName": "Alice",
        "principalType": "people",
        "description": "alice@contoso.com",
        "mail": "alice@contoso.com",
        "userPrincipalName": "alice@contoso.com"
      }
    ],
    "grantedToCount": 1
  }
]
```

在前端里，这份数据就是：

```ts
const originalEntries: IItemLinkPermissionEntryForUI[] = ...
```

### 4.2 用户现在做了什么

用户在 links 面板里做 3 个动作：

1. 新建一条 `specific + view` link
2. 给这条新建 link 加上 `Bob`
3. 给已有 `specific + edit` link 新增 `Carol`，并移除 `Alice`

先不要急着看请求。

当前前端还没点 `Apply`，所以此时最重要的不是“后端会收到什么”，而是：

> 前端如何把这些动作记成 `diff`

---

## 5. 第一步：前端先把动作记成 `diff`

这一层主要由：`useItemLinkPermissionDiff;` 负责。

它的职责不是直接请求后端，而是把用户动作记进本地差异。

### 5.1 新建 `specific + view` link

新建后，前端会先得到一条 created diff：

```json
{
  "createdLinks": [
    {
      "id": "diff-item-link:1",
      "scope": "users",
      "type": "view",
      "recipients": []
    }
  ],
  "deletedPermissionIds": [],
  "grantsByPermissionId": {},
  "revokesByPermissionId": {}
}
```

可以看到，这时只是“创建了一条本地草稿 link”，还没有真正写后端。

### 5.2 给这条新建 link 加上 `Bob`

这一步不会写进 `grantRecipients`。

原因很简单：

- 这条 link 还不存在于后端
- 它还没有真正的 `permissionId`
- 所以它的 recipient 变化应该直接挂在这条 `createdLinks` 草稿项上

结果会变成：

```json
{
  "createdLinks": [
    {
      "id": "diff-item-link:1",
      "scope": "users",
      "type": "view",
      "recipients": [
        {
          "id": "user-bob",
          "objectId": "user-bob",
          "name": "Bob",
          "type": "people",
          "secondaryText": "bob@contoso.com",
          "initials": "B",
          "mail": "bob@contoso.com",
          "userPrincipalName": "bob@contoso.com"
        }
      ]
    }
  ],
  "deletedPermissionIds": [],
  "grantsByPermissionId": {},
  "revokesByPermissionId": {}
}
```

### 5.3 给已有 `specific + edit` link 新增 `Carol`

这次不一样，因为目标已经是 persisted link。

所以前端不会去修改 `createdLinks`，而是记一条：

```json
{
  "grantsByPermissionId": {
    "perm-specific-edit": [
      {
        "id": "user-carol",
        "objectId": "user-carol",
        "name": "Carol",
        "type": "people",
        "secondaryText": "carol@contoso.com",
        "initials": "C",
        "mail": "carol@contoso.com",
        "userPrincipalName": "carol@contoso.com"
      }
    ]
  }
}
```

### 5.4 从已有 `specific + edit` link 移除 `Alice`

同理，前端会把它记成一条 `revoke` 差异：

```json
{
  "revokesByPermissionId": {
    "perm-specific-edit": [
      {
        "id": "user-alice",
        "objectId": "user-alice",
        "name": "Alice",
        "type": "people",
        "secondaryText": "alice@contoso.com",
        "initials": "A",
        "mail": "alice@contoso.com",
        "userPrincipalName": "alice@contoso.com"
      }
    ]
  }
}
```

### 5.5 当前完整 `diff`

把这些动作合在一起，本轮编辑最终的 `diff` 可以理解成：

```json
{
  "createdLinks": [
    {
      "id": "diff-item-link:1",
      "scope": "users",
      "type": "view",
      "recipients": [
        {
          "id": "user-bob",
          "objectId": "user-bob",
          "name": "Bob",
          "type": "people",
          "secondaryText": "bob@contoso.com",
          "initials": "B",
          "mail": "bob@contoso.com",
          "userPrincipalName": "bob@contoso.com"
        }
      ]
    }
  ],
  "deletedPermissionIds": [],
  "grantsByPermissionId": {
    "perm-specific-edit": [
      {
        "id": "user-carol",
        "objectId": "user-carol",
        "name": "Carol",
        "type": "people",
        "secondaryText": "carol@contoso.com",
        "initials": "C",
        "mail": "carol@contoso.com",
        "userPrincipalName": "carol@contoso.com"
      }
    ]
  },
  "revokesByPermissionId": {
    "perm-specific-edit": [
      {
        "id": "user-alice",
        "objectId": "user-alice",
        "name": "Alice",
        "type": "people",
        "secondaryText": "alice@contoso.com",
        "initials": "A",
        "mail": "alice@contoso.com",
        "userPrincipalName": "alice@contoso.com"
      }
    ]
  }
}
```

这一层最值得记住的一句话是：

> 前端记录的是“变化”，不是“把整个 links 列表重新抄一份”。

---

## 6. 第二步：前端把基线和 `diff` 合成当前界面结果

这一层主要由：

```ts
useItemLinkPermissionComputedEntries(originalEntries, diff);
```

负责。

它做的事情是：

1. 读取后端基线 `originalEntries`
2. 读取本地差异 `diff`
3. 算出“如果用户现在点击 Apply，界面应该先预演成什么样”

### 6.1 persisted link 会显示成什么

原本 persisted link 上只有 `Alice`。

现在本地差异里：

- `Alice` 被放进了 `revokesByPermissionId`
- `Carol` 被放进了 `grantsByPermissionId`

所以前端计算后的 recipients 会从：

```json
["Alice"]
```

变成：

```json
["Carol"]
```

### 6.2 新建 link 会显示成什么

新建的 `specific + view` link 还没有后端 `permissionId`，但它已经存在于 `createdLinks` 里，而且已经挂上了 `Bob`。

所以它也会进入界面渲染结果。

### 6.3 当前 `computed entries`

把两条行合在一起，前端最终会算出类似下面的结果：

```json
[
  {
    "id": "diff-item-link:1",
    "source": "diff",
    "scope": "users",
    "type": "view",
    "roleLabel": "View",
    "preventsDownload": false,
    "grantedToCount": 1,
    "recipients": [
      {
        "key": "user-bob",
        "source": "diff",
        "candidate": {
          "id": "user-bob",
          "objectId": "user-bob",
          "name": "Bob",
          "type": "people",
          "secondaryText": "bob@contoso.com",
          "initials": "B",
          "mail": "bob@contoso.com",
          "userPrincipalName": "bob@contoso.com"
        }
      }
    ],
    "hasValidationError": false
  },
  {
    "id": "row-specific-edit",
    "source": "persisted",
    "permissionId": "perm-specific-edit",
    "shareId": "share-specific-edit",
    "webUrl": "https://contoso.example/edit-link",
    "scope": "users",
    "type": "edit",
    "roleLabel": "Edit",
    "preventsDownload": false,
    "grantedToCount": 1,
    "recipients": [
      {
        "key": "user-carol",
        "source": "diff",
        "candidate": {
          "id": "user-carol",
          "objectId": "user-carol",
          "name": "Carol",
          "type": "people",
          "secondaryText": "carol@contoso.com",
          "initials": "C",
          "mail": "carol@contoso.com",
          "userPrincipalName": "carol@contoso.com"
        }
      }
    ],
    "hasValidationError": false
  }
]
```

这个结果说明：

- 新建的 `specific + view` link 已经先显示出来了
- 这条新建 link 当前包含 `Bob`
- 原来的 `specific + edit` link 还在
- 但它的 recipient 已经从 `Alice` 预演成了 `Carol`

所以 `computed entries` 的本质是：

> 让界面在提交前，就能先显示“最终会变成什么样”。

---

## 7. 第三步：点击 `Apply` 后，前端如何生成请求体

这一层主要由：

```ts
useItemLinkPermissionApiRequestState;
```

和：

```ts
createItemLinkPermissionChangeSet;
```

一起完成。

它们会把：

```text
originalEntries + diff
```

收敛成后端真正需要的 `apply` 合同。

### 7.1 当前例子生成的请求体

在这个例子里，最终请求体会长成这样：

```json
{
  "create": [
    {
      "scope": "users",
      "type": "view",
      "recipients": [
        {
          "recipientObjectId": "user-bob",
          "recipientEmail": "bob@contoso.com",
          "recipientAlias": "bob@contoso.com"
        }
      ]
    }
  ],
  "deleteLinks": [],
  "grantRecipients": [
    {
      "permissionId": "perm-specific-edit",
      "shareId": "share-specific-edit",
      "type": "edit",
      "recipients": [
        {
          "recipientObjectId": "user-carol",
          "recipientEmail": "carol@contoso.com",
          "recipientAlias": "carol@contoso.com"
        }
      ]
    }
  ],
  "revokeRecipients": [
    {
      "permissionId": "perm-specific-edit",
      "shareId": "share-specific-edit",
      "recipients": [
        {
          "recipientObjectId": "user-alice",
          "recipientEmail": "alice@contoso.com",
          "recipientAlias": "alice@contoso.com"
        }
      ]
    }
  ]
}
```

这里有 3 个很关键的观察点：

1. 新建 link 的 `Bob` 被放进了 `create[].recipients`
   因为这条 link 还没有 persisted `permissionId`

2. 给已有 link 新增 `Carol` 走的是 `grantRecipients`

3. 从已有 link 移除 `Alice` 走的是 `revokeRecipients`

这正是当前项目的正式合同。

---

## 8. 第四步：后端拿到请求后做了什么

这一层主要由下面两个文件衔接：

```ts
itemLinkPermissionHandlers.ts;
itemLinkPermissionService.ts;
```

### 8.1 `handler` 先做什么

`handler` 层主要负责：

1. 读取 `driveId` 和 `itemId`
2. 解析 `req.body`
3. 调用 `parseItemLinkPermissionChangeSet`
4. 把收窄后的 change set 交给 service

也就是说，`handler` 关心的是：

> 这个 HTTP 请求能不能被安全地转换成模块真正理解的输入

### 8.2 `service` 再做什么

`service` 层才真正执行写操作。

当前顺序是：

```text
deleteLinks
  -> create
  -> grantRecipients
  -> revokeRecipients
  -> final reread
```

放到这个例子里就是：

1. `deleteLinks`
   这次为空，所以跳过

2. `create`
   先创建 `specific + view` link

3. `grantRecipients`
   对已有 `specific + edit` link 授予 `Carol`

4. `revokeRecipients`
   对已有 `specific + edit` link 撤销 `Alice`

5. `final reread`
   最后重新读取一遍 link 列表，返回后端确认过的最新快照

这里要特别注意：

- 新建 `specific` link 时，后端不是只做 `createLink`
- 它还会继续把 `create[].recipients` 授予到新创建的 link 上

也就是说，对于“新建 `specific` link 并授予 `Bob`”这个动作，后端实际会经历：

```text
createLink(scope=users, type=view)
  -> 读取 createLink 返回的 shareId
  -> grant Bob
```

---

## 9. 第五步：后端应用完成后的最终返回结果

`service` 最后会重新读取最新 link 列表，并把它映射成前端统一消费的响应结构。

所以这次 `Apply` 完成后，前端大致会拿到下面这样的结果：

```json
[
  {
    "id": "row-specific-view",
    "permissionId": "perm-specific-view",
    "shareId": "share-specific-view",
    "webUrl": "https://contoso.example/view-link",
    "scope": "users",
    "type": "view",
    "roleLabel": "View",
    "preventsDownload": false,
    "grantedToIdentities": [
      {
        "graphId": "user-bob",
        "displayName": "Bob",
        "principalType": "people",
        "description": "bob@contoso.com",
        "mail": "bob@contoso.com",
        "userPrincipalName": "bob@contoso.com"
      }
    ],
    "grantedToCount": 1
  },
  {
    "id": "row-specific-edit",
    "permissionId": "perm-specific-edit",
    "shareId": "share-specific-edit",
    "webUrl": "https://contoso.example/edit-link",
    "scope": "users",
    "type": "edit",
    "roleLabel": "Edit",
    "preventsDownload": false,
    "grantedToIdentities": [
      {
        "graphId": "user-carol",
        "displayName": "Carol",
        "principalType": "people",
        "description": "carol@contoso.com",
        "mail": "carol@contoso.com",
        "userPrincipalName": "carol@contoso.com"
      }
    ],
    "grantedToCount": 1
  }
]
```

然后前端会做两件事：

1. 用这份返回结果替换旧的 `originalEntries`
2. 把本地 `diff` 清空

这样 UI 就从“草稿状态”回到了“后端已确认状态”。

---

## 10. 把整个过程压缩成一句人话

如果你想快速记住这个模块，可以先记这句话：

> 前端先把 link 的新增、删人、加人记成 `diff`，再把 `diff` 和后端基线合成当前显示结果；点击 `Apply` 后，前端把这些差异收敛成 `create / deleteLinks / grantRecipients / revokeRecipients`，后端按固定顺序调用 Graph，最后回读最新结果覆盖基线。

---

## 11. 推荐阅读顺序

如果你准备继续顺着代码往下读，推荐按这个顺序：

1. 先读这篇文档
2. 再读 `src/components/permissions/models/itemLinkPermissionModels.ts`
3. 再读 `src/components/permissions/hooks/useItemLinkPermissionDiff.ts`
4. 再读 `src/components/permissions/hooks/useItemLinkPermissionComputedEntries.ts`
5. 再读 `src/components/permissions/hooks/useItemLinkPermissionApiRequestState.ts`
6. 最后读 `server/itemPermissions/linkPermission/itemLinkPermissionService.ts`

如果你中途对某一层理解还不稳，可以回头看这两篇专门文档：

1. `src/components/permissions/documents/explain-useItemLinkPermissionDiff.md`
2. `src/components/permissions/documents/explain-useItemLinkPermissionComputedEntries.md`

---

## 12. 读完后最该记住的 6 个点

1. `itemLinkPermission` 管的是“分享链接权限”，不是传统的显式用户权限表

2. `specific` 在项目语义里很好懂，但合同值实际是 `users`

3. 前端维护的是 `diff`，不是整张 links 草稿快照

4. `computed entries` 是“后端基线 + 前端差异”的合成结果

5. 新建 `specific` link 的 recipient 走 `create[].recipients`

6. 已有 link 的 recipient 调整走 `grantRecipients` 和 `revokeRecipients`

如果这 6 个点都记住了，你再去看源码时，很多命名就会顺很多。
