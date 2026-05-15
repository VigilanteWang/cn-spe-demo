# Container Permission 共同契约、包装层与 `read*` 模式说明

## 1. 背景

这次重构前，`Container Permission` 后端逻辑主要集中在一个大文件里。  
当我们沿着“前端弹窗 -> 后端 API -> Microsoft Graph”这条链路读代码时，会看到很多“对象转换”和很多 `read*` 方法，第一眼很容易觉得它们像是在重复包一层。

真正的问题不是“为什么有包装”，而是：

- 必要的包装和可读性包装混在一起了
- 前后端各自维护了一份很像的类型
- `read* / map* / parse* / normalize*` 都堆在一个文件里，边界不明显

所以这次重构的目标不是把所有中间层删掉，而是把它们分层、命名、归档，让初级同学一眼能看出：

1. 哪些是前后端共同契约
2. 哪些是后端为了适配 Graph 必须做的转换
3. 哪些 `read*` 方法本质上是在做“边界防腐层”

---

## 2. 总体关系图

现在这个模块有 4 层常见对象：

```text
前端本地 UI 模型
  ↓
共同契约 common/contracts/containerPermissionCommonContracts.ts
  ↓
后端内部模型 server/containerPermissions/*
  ↓
Microsoft Graph 原始对象
```

更具体一点：

```text
Directory 搜索结果
  -> IPermissionPrincipalCandidate
  -> IContainerPermissionEntry
  -> IContainerPermissionChangeSet
  -> 后端 parse 成已校验的 change set
  -> Graph POST / PATCH / DELETE body

Graph GET /permissions 返回值
  -> normalizeGraphPermissionIdentity(...)
  -> mapGraphPermissionToEntry(...)
  -> IContainerPermissionEntry
  -> 前端 PermissionEntriesByTab 草稿态
```

这里最重要的认识是：

- `IPermissionPrincipalCandidate` 不是共同契约，它只服务前端搜索交互
- `IContainerPermissionEntry` 是共同契约，因为前后端都要认它
- `IGraphPermissionIdentity` 不是共同契约，它只服务后端适配 Graph

---

## 3. 一次完整链路

下面用一次真实的权限编辑流程，把这些层串起来。

### 第一步：Dialog 打开，前端请求当前权限

前端调用：

```ts
const response = await sendAuthorizedRequest(
  `/api/containerPermissions/${encodeURIComponent(containerId)}`,
  { method: "GET" },
);
```

后端入口在：

- `server/index.ts`
- `server/containerPermissions/containerPermissionsHandlers.ts`

后端 handler 只做编排：

```ts
const entries = await fetchContainerPermissionEntries(graphClient, containerId);
const responseBody: IContainerPermissionsResponse = { entries };
res.send(200, responseBody);
```

这里的重点是：  
handler 不直接理解 Graph 原始对象细节，它只负责“拿数据、调映射、发响应”。

### 第二步：后端把 Graph 对象翻译成共同契约

Graph 返回的权限对象并不适合前端直接消费，因为它有这些现实问题：

- `user` / `siteUser` / `group` / `siteGroup` 结构不同
- people 有时没有稳定 `id`
- role 名字和 UI 展示名字不同

所以后端会先走两步：

```ts
const principal =
  normalizeGraphPermissionIdentity(grantedToV2.user) ??
  normalizeGraphPermissionIdentity(grantedToV2.siteUser) ??
  normalizeGraphPermissionIdentity(grantedToV2.group) ??
  normalizeGraphPermissionIdentity(grantedToV2.siteGroup);

return {
  id: `permission:${permissionId}`,
  permissionId,
  principalId:
    principal.graphId ?? createFallbackPrincipalId(principalType, permissionId),
  role: mapGraphContainerPermissionRoleToUi(primaryRole),
};
```

这里有 3 个重要动作：

1. `normalizeGraphPermissionIdentity(...)`
   把多种 Graph identity 形状收口成统一中间对象
2. `createFallbackPrincipalId(...)`
   people 没有 Graph object id 时，给前端一个稳定可用的本地 id
3. `mapGraphContainerPermissionRoleToUi(...)`
   把 Graph 的 `reader/writer/...` 转成共同契约里的 `Reader/Writer/...`

### 第三步：前端维护草稿态

前端不会直接操作 Graph，也不会每改一项就立刻写后端。  
它先维护两份本地快照：

```ts
const [originalEntriesByTab, setOriginalEntriesByTab] = useState(...);
const [draftEntriesByTab, setDraftEntriesByTab] = useState(...);
```

这样做的原因：

- `Close` 时可以回滚到最近一次确认后的状态
- `Apply` 成功后可以把服务端最新结果变成新的基线
- 编辑中不必反复请求后端

### 第四步：点击 Apply，前端算出 change set

前端不会把整张表重新发给后端，而是只发差异：

```ts
return {
  create,
  update,
  remove,
};
```

这里的 `IContainerPermissionChangeSet` 也是共同契约。  
它的作用是让前端和后端都只关心：

- 新增了谁
- 哪条权限改了角色
- 哪条权限被删了

### 第五步：后端 parse 请求体

后端拿到 `req.body` 后，先不急着写 Graph，而是先 parse：

```ts
const changeSet = parseContainerPermissionChangeSet(req.body);
```

`parse` 阶段会做这些事：

- 检查 `create/update/remove` 是否存在
- 兼容历史字段 `delete`
- 校验 `role`
- 校验 `principalType`
- 对 people 分支强制要求 `userPrincipalName`

### 第六步：后端转成 Graph 写入 body

后端内部差异模型和 Graph 请求体也不是一回事。  
尤其新增时，people 和 groups 的载荷完全不同：

```ts
if (createChange.principalType === "people") {
  return {
    roles: [mapUiContainerPermissionRoleToGraph(createChange.role)],
    grantedToV2: {
      user: {
        userPrincipalName: createChange.userPrincipalName,
      },
    },
  };
}

return {
  roles: [mapUiContainerPermissionRoleToGraph(createChange.role)],
  grantedToV2: {
    group: {
      id: createChange.principalId,
    },
  },
};
```

这就是典型的“共同契约 -> 外部协议”转换层。

### 第七步：写回后再次读取，回到共同契约

Apply 完成后，后端不会只返回“成功了”，而是再读一遍服务端当前真实状态，重新映射成：

```ts
IContainerPermissionsResponse;
```

前端拿到后调用 `replaceEntries(...)`，把最新结果同时写回：

- `originalEntriesByTab`
- `draftEntriesByTab`

这样脏状态就被清掉了。

---

## 4. 什么是共同契约，为什么放在根目录 `common/contracts`

这次重构后，共同契约统一放在：

```text
common/contracts/containerPermissionCommonContracts.ts
```

这样放的原因有 3 个：

1. 它不属于前端，也不属于后端
2. 它描述的是“HTTP 两端都认的结构”
3. 用目录位置提醒大家：这是共享协议，不是某一层的私有细节

这个文件里只放两类东西：

- 共同的数据模型
- 共同的错误响应模型

例如：

```ts
export interface IContainerPermissionEntry {
  id: string;
  permissionId?: string;
  principalId: string;
  principalUserPrincipalName?: string;
  principalName: string;
  principalType: PermissionTabValue;
  description: string;
  role: ContainerPermissionRole;
}
```

和：

```ts
export interface IContainerPermissionChangeSet {
  create: ICreateContainerPermissionChange[];
  update: IUpdateContainerPermissionChange[];
  remove: IDeleteContainerPermissionChange[];
}
```

不应该放进共同契约的东西：

- Graph 原始返回结构
- 后端为了适配 Graph 造的中间对象
- 前端搜索候选项
- 前端草稿态 Hook 内部状态

一句话记忆：  
**共同契约描述“前后端怎么说话”，不是描述“每一层内部怎么工作”。**

---

## 5. 为什么不是所有中间对象都该删

很多初级同学会问：  
“既然有共同契约，能不能直接把 Graph 返回值给前端？”

这在这个模块里不合适，原因很现实：

### 1. Graph identity 形状不统一

后端读权限时，可能遇到：

- `grantedToV2.user`
- `grantedToV2.siteUser`
- `grantedToV2.group`
- `grantedToV2.siteGroup`

如果不先统一，主流程就会塞满条件分支。

### 2. people 不一定有稳定 object id

Graph 有时只给：

- `displayName`
- `email`
- `userPrincipalName`

不给 `user.id`。  
如果前端直接拿这种原始对象做列表主键，后续编辑和 diff 都会变得不稳定。

### 3. Graph role 和 UI role 不同

Graph 用：

- `reader`
- `writer`
- `manager`
- `owner`
- `principalOwner`

UI 和共同契约用：

- `Reader`
- `Writer`
- `Manager`
- `Owner`

这就是一个典型的“必须有映射层”的场景。

### 4. create/update/delete 的载荷不同

尤其 create：

- people 需要 `userPrincipalName`
- groups 需要 `group id`

如果没有中间差异模型，前后端就很容易在“字段是给谁用的”这件事上混乱。

所以正确做法不是“删光中间层”，而是：

- 保留必要边界
- 给每个边界一个清楚名字
- 把它们放到对应文件夹里

---

## 6. `read*` 是什么 pattern

这次重构里，`read*` 方法被集中到了 `server/containerPermissions/containerPermissionsReaders.ts`，以及错误映射附近的读取辅助逻辑里。

它们背后的模式可以理解为：

## Reader / Parser pattern

更准确地说，它是一种“边界防腐层”的写法。

边界防腐层的意思是：

- 外部输入往往是弱类型、松散、甚至不稳定的
- 业务代码不应该直接信任这些输入
- 所以先由一层小工具把输入“读干净”“收紧”“统一”

例如：

```ts
export const readRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
};
```

和：

```ts
export const readRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value === "string" && value) {
    return value;
  }

  throw new Error(`Missing required ${fieldName}.`);
};
```

这些方法本身不是业务规则。  
它们更像“门口保安”：

- 先确认输入是不是对象
- 先确认字段是不是非空字符串
- 先兼容多种 header/innerError 形状
- 再把干净的值交给真正的业务逻辑

这样好处很大：

1. 主流程更清楚
2. 校验逻辑可以复用
3. 出错点更集中
4. 更容易单元测试

---

## 7. 本模块里 `read*` 方法的分类

这次可以把它们分成 4 类。

### A. 请求解析类

典型代表：

- `parseContainerPermissionChangeSet(...)`

它的职责不是“读取单个字段”，而是把原始 `req.body` 解析成后端真正愿意接受的 change set。

它会：

- 校验字段结构
- 兼容 `delete -> remove`
- 调用更细的字段读取逻辑

所以它更接近 `Parser`。

### B. 基础弱类型读取类

典型代表：

- `readRecord(...)`
- `readOptionalString(...)`
- `readRequiredString(...)`
- `readStringArray(...)`

这类方法解决的是：

- 这个值能不能当对象看
- 这个字段是不是字符串
- 这个字段是不是必填
- 这个字段是不是字符串数组

它们是最底层的“安全读取工具”。

### C. Graph identity 读取类

典型代表：

- `normalizeGraphPermissionIdentity(...)`

它不是单纯 `read` 一个值，而是在做：

- 从多种 Graph identity 形状里提字段
- 统一 `displayName`
- 统一 `description`
- 保留 `userPrincipalName`

所以它更像“结构归一化器”。

### D. 错误对象读取类

典型代表：

- `readRetryAfterSeconds(...)`
- `readRequestId(...)`
- `readHeaderValue(...)`
- `readInnerError(...)`

这类方法的场景是：

- SDK 错误对象形状不稳定
- header 可能在不同位置
- `request-id` 和 `retry-after` 可能在 header，也可能在 `innerError`

它们的职责是把“调试和恢复所需信息”尽量提取出来，供：

- 前端提示
- 日志追踪
- 节流等待建议

---

## 8. 重构后的文件地图与阅读顺序

现在建议按下面顺序读：

```text
common/contracts/containerPermissionCommonContracts.ts
  -> 先看共同契约，理解前后端说话的语言

src/components/permissions/models/permissionModels.ts
  -> 再看前端本地补充模型，理解 UI 还额外需要什么

src/components/permissions/services/containerPermissionDiff.ts
  -> 看草稿如何变成 change set

src/services/containerPermissionApi.ts
  -> 看前端如何请求后端、如何拿共同契约

server/containerPermissions/containerPermissionsHandlers.ts
  -> 看后端主流程编排

server/containerPermissions/containerPermissionsRequestParser.ts
  -> 看请求体如何被 parse 和校验

server/containerPermissions/containerPermissionsCommonAdapters.ts
  -> 看共同契约和 Graph 之间如何互转

server/containerPermissions/containerPermissionsError.ts
  -> 看错误如何被标准化
```

如果你是第一次接触这个模块，最重要的两个入口是：

1. `common/contracts/containerPermissionCommonContracts.ts`
2. `server/containerPermissions/containerPermissionsHandlers.ts`

因为一个告诉你“双方约定了什么”，另一个告诉你“这条链路怎么跑”。

---

## 9. 给初级同学的阅读建议

### 建议 1：先分清“共同契约”和“内部模型”

如果一个类型会穿过 HTTP 边界，它大概率属于共同契约。  
如果一个类型只是为了让某一层内部更好写代码，它就不该进共同契约。

### 建议 2：不要把 `read*` 当成业务逻辑

`read*` 更多是在做：

- 安全读取
- 兜底
- 兼容不同输入形状

真正的业务决策通常在：

- “people 为什么要用 userPrincipalName”
- “为什么 entry.id 用 permissionId”
- “为什么先删再改再建”

这些地方。

### 建议 3：看到 `map* / parse* / normalize*` 时先问自己“边界是哪一层”

一个很实用的问题是：

> 这个函数是在把哪一层，转换成哪一层？

例如：

- `mapGraphPermissionToEntry`
  是 `Graph -> 共同契约`
- `parseContainerPermissionChangeSet`
  是 `原始请求体 -> 后端已校验差异模型`
- `normalizeGraphPermissionIdentity`
  是 `多种 Graph identity 形状 -> 统一中间结构`

一旦你能回答这个问题，代码就会清楚很多。

### 建议 4：先理解“为什么需要这一层”，再看字段细节

如果你先盯着每个字段名，容易陷进细节。  
更好的顺序是：

1. 这层存在是为了解决什么问题
2. 这层的输入是什么
3. 这层的输出是什么
4. 哪些字段是为了兼容外部系统不得不保留的

这样读起来会更像在理解系统设计。
