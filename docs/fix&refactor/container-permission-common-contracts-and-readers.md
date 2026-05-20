# Container Permission 前后端模块交互说明

## 1. 整体简介

在 SharePoint Embedded 里，业务文件并不是直接散落在系统里，而是放在一个个 `Container` 里，可以理解为传统SPO的 Document Library。`Container Permission` 可以理解为 Library Permission。它规定

- **谁** 可以访问这个 container
- **以什么角色** (Owner, Manager, Writer, Reader) 访问这个 container

在此项目中，containerPermission 模块的作用，不是仅做界面，而是把下面这条链路串起来：

1. 前端向后端发起“读取权限”或“修改权限”请求
2. 后端把前端传来的 业务模型，转换成 Microsoft Graph 能理解的请求格式
3. 后端调用 Graph
4. 后端再把 Graph 返回的原始对象，重新整理成前端容易消费的结构

你可以把它理解成一个“翻译层 + 编排层”。这篇文档仅说明 Graph，后端，前端三者之间是怎么说话的，不涉及 UI 组件细节。

---

## 2. 这几个文件分别负责什么

下面只看这次你关心的几组文件。

### 2.1 后端目录：`server/containerPermissions/`

```text
server/containerPermissions/
  index.ts
  containerPermissionsHandlers.ts
  containerPermissionsCommonAdapters.ts
  containerPermissionsRequestParser.ts
  containerPermissionsReaders.ts
  containerPermissionRoleMapper.ts
  containerPermissionsError.ts
  containerPermissionsInternalContracts.ts
```

可以先这样理解：

- `index.ts`
  - 对外导出权限模块真正使用的函数入口。
- `containerPermissionsHandlers.ts`
  - 主流程编排层。
  - 负责鉴权、读路由参数、拿 token、创建 Graph client、调用读取/写入逻辑、返回 API 响应。
- `containerPermissionsCommonAdapters.ts`
  - 对象转换层。
  - 负责把 Graph permission 转成前端可读的 `entry`，也负责把前端的新增权限变化转成 Graph `POST` 请求体。
- `containerPermissionsRequestParser.ts`
  - 请求解析层。
  - 负责把前端传来的 `create/update/remove` 解析成后端可安全使用的结构。
- `containerPermissionsReaders.ts`
  - 小型读取工具层。
  - 负责把 `unknown` 数据安全地读成 `Record`、`string`、`string[]`，属于边界防守代码。
- `containerPermissionRoleMapper.ts`
  - 角色映射工具。
  - 负责项目里的 `Reader/Writer/Manager/Owner` 和 Graph 角色字符串之间的互转。

### 2.2 共同契约目录：`common/`

```text
common/
  contracts/
    containerPermissionCommonContracts.ts
```

这个文件非常关键，它定义的是“前端和后端通过 HTTP 通信时，双方都同意的数据结构”。

它不是 Graph 原始模型，也不是某个组件私有状态，而是前后端共享的稳定契约。例如：

- `IContainerPermissionEntryForUI`
  - 后端返回给前端的一条权限记录
- `IContainerPermissionsResponseFromApi`
  - 后端返回给前端的响应体
- `IContainerPermissionChangeSetFromUI`
  - 前端提交给后端的一组变更

### 2.3 前端差异计算：`src/components/permissions/services/containerPermissionDiff.ts`

这个文件不负责请求网络，它负责比较：

- 原始权限快照
- 用户修改后的草稿

然后算出：

- `create`
- `update`
- `remove`

也就是说，前端不会把整个权限列表原样提交回去，而是只提交“差异”。

### 2.4 前端 API 调用：`src/services/containerPermissionApi.ts`

这个文件是前端访问后端权限接口的直接入口：

- `listContainerPermissions(containerId)`
  - 发起读取权限请求
- `applyContainerPermissionChanges(containerId, changes)`
  - 发起应用权限变更请求

它拿到后端返回的 `entries` 之后，还会再按 `people/groups` 分组，方便前端继续使用。

---

## 3. 先看整体数据流

### 3.1 List Permission 的整体链路

```text
前端 listContainerPermissions(containerId)
  ↓
后端 listContainerPermissionsFromGraph(req, res)
  ↓
后端 fetchMapContainerPermissionFromGraphToEntries(graphClient, containerId)
  ↓
后端 mapGraphPermissionToEntryOnUI(permission)
  ↓
前端 mapEntriesToTabs(entries)
```

### 3.2 Apply Permission 的整体链路

```text
前端 computeContainerPermissionChanges(originalEntriesByTab, draftEntriesByTab)
  ↓
前端 applyContainerPermissionChanges(containerId, changes)
  ↓
后端 applyContainerPermissionsToGraph(req, res)
  ↓
后端 parseContainerPermissionChangeSet(body)
  ↓
后端 applyContainerPermissionChangeSet(graphClient, containerId, changeSet)
  ↓
后端 newGraphCreatePermissionBody(createChange)
  ↓
后端 fetchMapContainerPermissionFromGraphToEntries(graphClient, containerId)
  ↓
前端 mapEntriesToTabs(entries)
```

---

## 4. 例子一：List Permission

以下是一份 Graph 返回的原始 container permission Json response。这个例子讲解从前端调用，到后端读取 Graph，再到前端拿到最终结果的完整链路。

```json
{
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#storage/fileStorage/containers('b%21...')/permissions",
  "value": [
    {
      "id": "X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
      "roles": ["writer"],
      "grantedToV2": {
        "user": {
          "displayName": "Alex Wilber",
          "email": "AlexW@tenant.onmicrosoft.com",
          "userPrincipalName": "alexw@tenant.onmicrosoft.com"
        }
      }
    },
    {
      "id": "X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
      "roles": ["writer"],
      "grantedToV2": {
        "group": {
          "displayName": "U.S. Sales Members",
          "email": "U.S.Sales@tenant.onmicrosoft.com",
          "id": "7eba5343-2fd9-4885-a294-8af3a59677b5"
        }
      }
    }
  ]
}
```

### 4.1 第一步：前端调用读取接口

前端调用入口在 [src/services/containerPermissionApi.ts](../../src/services/containerPermissionApi.ts)：

```ts
export const listContainerPermissions = async (
  containerId: string,
): Promise<PermissionEntriesByTab> => {
  const response = await sendAuthorizedRequest(
    `/api/containerPermissions/${encodeURIComponent(containerId)}`,
    {
      method: "GET",
    },
  );

  const payload =
    (await response.json()) as IContainerPermissionsResponseFromApi;
  return mapEntriesToTabs(payload.entries);
};
```

这里做的事很简单：

1. 调后端 `GET /api/containerPermissions/{containerId}`
2. 等后端返回 `entries`
3. 再把 `entries` 按 `people/groups` 分组给 UI 显示

### 4.2 第二步：后端 handler 接住请求

后端入口在 [server/containerPermissions/containerPermissionsHandlers.ts](../../server/containerPermissions/containerPermissionsHandlers.ts) 的 `listContainerPermissionsFromGraph(...)`：

```ts
export const listContainerPermissionsFromGraph = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await authorizeContainerManageRequest(req);
  const containerId = readContainerId(req);
  const graphToken = await getGraphToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken) as IGraphClient;

  const entries = await fetchMapContainerPermissionFromGraphToEntries(
    graphClient,
    containerId,
  );

  res.send(200, { entries });
};
```

这一层主要负责“编排”，不是做字段细节转换：

1. 鉴权
2. 读取 `containerId`
3. 用当前请求对应的身份去拿 Graph token
4. 创建 Graph client
5. 调读取函数
6. 把结果包装成 `{ entries }` 返回

### 4.3 第三步：后端去 Graph 读取原始权限列表

真正访问 Graph 的地方还是在同一个文件里的 `fetchMapContainerPermissionFromGraphToEntries(...)`：

```ts
const response = await graphClient
  .api(getContainerPermissionsGraphPath(containerId))
  .version("v1.0")
  .get();

const responseRecord = readGraphToRecord(response);
const permissionItems = responseRecord.value;

return permissionItems.map(mapGraphPermissionToEntryOnUI);
```

如果把上面的 JSON 代进来：

1. `response` 就是整份 Graph JSON
2. `responseRecord.value` 就是那两个 permission 对象组成的数组
3. 每一项都交给 `mapGraphPermissionToEntryOnUI(permission)` 做转换

### 4.4 第四步：把第一条 user 权限转成前端可用模型

转换函数在 [server/containerPermissions/containerPermissionsCommonAdapters.ts](../../server/containerPermissions/containerPermissionsCommonAdapters.ts)：

```ts
export const mapGraphPermissionToEntryOnUI = (
  permission: unknown,
): IContainerPermissionEntryForUI => { ... }
```

先看 Alex 这条 `user` 记录。它的原始输入是：

```json
{
  "id": "X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
  "roles": ["writer"],
  "grantedToV2": {
    "user": {
      "displayName": "Alex Wilber",
      "email": "AlexW@tenant.onmicrosoft.com",
      "userPrincipalName": "alexw@tenant.onmicrosoft.com"
    }
  }
}
```

经过 `mapGraphPermissionToEntryOnUI(...)` 之后，核心结果会变成：

```ts
{
  id: "permission:X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
  permissionId: "X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
  principalId:
    "people:permission:X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
  principalUserPrincipalName: "alexw@tenant.onmicrosoft.com",
  principalName: "Alex Wilber",
  principalType: "people",
  description: "AlexW@tenant.onmicrosoft.com",
  role: "Writer"
}
```

这里最值得初学者注意的有 4 点：

1. `permissionId` 直接来自 Graph 的原始 `id`
2. `roles: ["writer"]` 会被映射成前端使用的 `"Writer"`
3. `principalType` 会被整理成稳定的 `"people"`
4. 这条 `user` 数据里没有稳定的 Graph `user.id`，所以代码会退回到 `createFallbackPrincipalId(...)` 生成一个本地稳定 id

### 4.5 第五步：把第二条 group 权限转成前端可用模型

再看 `U.S. Sales Members` 这条 `group` 记录，原始输入是：

```json
{
  "id": "X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
  "roles": ["writer"],
  "grantedToV2": {
    "group": {
      "displayName": "U.S. Sales Members",
      "email": "U.S.Sales@tenant.onmicrosoft.com",
      "id": "7eba5343-2fd9-4885-a294-8af3a59677b5"
    }
  }
}
```

转换后核心结果会接近：

```ts
{
  id: "permission:X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
  permissionId:
    "X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
  principalId: "7eba5343-2fd9-4885-a294-8af3a59677b5",
  principalName: "U.S. Sales Members",
  principalType: "groups",
  description: "U.S.Sales@tenant.onmicrosoft.com",
  role: "Writer"
}
```

这里和 `people` 分支的关键区别是：

1. `group` 通常能直接拿到稳定的 `id`
2. 所以 `principalId` 可以直接用真实 group id
3. `groups` 分支不需要 `principalUserPrincipalName`

### 4.6 第六步：后端把统一结构返回前端

后端最终返回给前端的是共同契约定义的：

```ts
interface IContainerPermissionsResponseFromApi {
  entries: IContainerPermissionEntryForUI[];
}
```

所以返回结果不再是 Graph 原始 JSON，而是：

```ts
{
  entries: [
    {
      id: "permission:...",
      permissionId: "...",
      principalId: "people:permission:...",
      principalUserPrincipalName: "alexw@tenant.onmicrosoft.com",
      principalName: "Alex Wilber",
      principalType: "people",
      description: "AlexW@tenant.onmicrosoft.com",
      role: "Writer",
    },
    {
      id: "permission:...",
      permissionId: "...",
      principalId: "7eba5343-2fd9-4885-a294-8af3a59677b5",
      principalName: "U.S. Sales Members",
      principalType: "groups",
      description: "U.S.Sales@tenant.onmicrosoft.com",
      role: "Writer",
    },
  ];
}
```

### 4.7 第七步：前端把返回结果分到 people/groups

前端拿到 `entries` 后，会在 [src/services/containerPermissionApi.ts](../../src/services/containerPermissionApi.ts) 里执行：

```ts
const mapEntriesToTabs = (
  entries: IContainerPermissionEntryForUI[],
): PermissionEntriesByTab => {
  const nextEntries: PermissionEntriesByTab = {
    people: [],
    groups: [],
  };

  for (const entry of entries) {
    nextEntries[entry.principalType].push(entry);
  }

  return nextEntries;
};
```

于是：

1. Alex 会进入 `people`
2. `U.S. Sales Members` 会进入 `groups`

到这里，前端拿到的已经不是 Graph 原始对象，而是项目自己约定好的稳定结构。

---

## 5. 例子二：新增权限

这一段看“写回”链路，从点击 Apply 到新列表返回。

假设用户要新增一个人员权限：

- 姓名：`Miriam Graham`
- 邮箱：`MiriamG@tenant.onmicrosoft.com`
- 角色：`Manager`

为了说明流程，我们假设前端草稿里新增了一条 `people` 记录：

```ts
{
  id: "draft:miriamg@tenant.onmicrosoft.com",
  principalId: "miriamg@tenant.onmicrosoft.com",
  principalUserPrincipalName: "MiriamG@tenant.onmicrosoft.com",
  principalName: "Miriam Graham",
  principalType: "people",
  description: "MiriamG@tenant.onmicrosoft.com",
  role: "Manager"
}
```

注意，这里最关键的是 `principalUserPrincipalName`，因为后端创建 people 权限时最终要靠它告诉 Graph：“要把权限授给哪个用户”。

### 5.1 第一步：前端先计算差异，而不是整表回传

差异计算在 [src/components/permissions/services/containerPermissionDiff.ts](../../src/components/permissions/services/containerPermissionDiff.ts) 的 `computeContainerPermissionChanges(...)`：

```ts
export const computeContainerPermissionChanges = (
  originalEntriesByTab: PermissionEntriesByTab,
  draftEntriesByTab: PermissionEntriesByTab,
): IContainerPermissionChangeSetFromUI => { ... }
```

如果 Miriam 是新加的，那么这条草稿数据不存在于原始快照里，于是它会进入 `create` 数组。

对于 `people` 分支，代码会走到：

```ts
return {
  principalType: "people",
  principalId: entry.principalId,
  userPrincipalName: requireEntryField(entry.principalUserPrincipalName, {
    code: "missingUserPrincipalName",
    operation: "create people permission",
    fieldName: "principalUserPrincipalName",
    entryId: entry.id,
  }),
  role: entry.role,
};
```

所以前端最终算出来的变化大致是：

```ts
{
  create: [
    {
      principalType: "people",
      principalId: "miriamg@tenant.onmicrosoft.com",
      userPrincipalName: "MiriamG@tenant.onmicrosoft.com",
      role: "Manager"
    }
  ],
  update: [],
  remove: []
}
```

### 5.2 第二步：前端点击 Apply，调用后端接口

调用入口在 [src/services/containerPermissionApi.ts](../../src/services/containerPermissionApi.ts)：

```ts
export const applyContainerPermissionChanges = async (
  containerId: string,
  changes: IContainerPermissionChangeSetFromUI,
): Promise<PermissionEntriesByTab> => {
  const response = await sendAuthorizedRequest(
    `/api/containerPermissions/${encodeURIComponent(containerId)}/apply`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(changes),
    },
  );
};
```

这一步发给后端的请求体核心内容就是：

```json
{
  "create": [
    {
      "principalType": "people",
      "principalId": "miriamg@tenant.onmicrosoft.com",
      "userPrincipalName": "MiriamG@tenant.onmicrosoft.com",
      "role": "Manager"
    }
  ],
  "update": [],
  "remove": []
}
```

### 5.3 第三步：后端先把请求体解析成安全结构

后端入口还是 [server/containerPermissions/containerPermissionsHandlers.ts](../../server/containerPermissions/containerPermissionsHandlers.ts) 的 `applyContainerPermissionsToGraph(...)`，它会先调用：

```ts
const changeSet = parseContainerPermissionChangeSet(req.body);
```

真正解析发生在 [server/containerPermissions/containerPermissionsRequestParser.ts](../../server/containerPermissions/containerPermissionsRequestParser.ts)：

```ts
export const parseContainerPermissionChangeSet = (
  body: unknown,
): IContainerPermissionChangeSetFromUI | null => { ... }
```

对上面这份 JSON 来说，它会把 `req.body` 收口成后端认可的结构，并在 `people` 分支里强制校验：

1. `principalType` 必须是 `"people"` 或 `"groups"`
2. `role` 必须是支持的 UI 角色
3. `userPrincipalName` 在新增 `people` 时必须存在

也就是说，这一层是在做“HTTP 输入边界防守”。

### 5.4 第四步：后端按 create/update/remove 顺序应用变更

解析完成后，`applyContainerPermissionsToGraph(...)` 会调用：

```ts
await applyContainerPermissionChangeSet(graphClient, containerId, changeSet);
```

这个函数位于 [server/containerPermissions/containerPermissionsHandlers.ts](../../server/containerPermissions/containerPermissionsHandlers.ts)。

它的顺序是：

1. 先 `remove`
2. 再 `update`
3. 最后 `create`

对 Miriam 这个例子，因为只有新增，所以前两个阶段都不会执行，直接进入 `create`。

### 5.5 第五步：后端把前端 create 变化翻译成 Graph POST body

进入新增阶段时，代码会调用：

```ts
post(newGraphCreatePermissionBody(createChange));
```

转换函数在 [server/containerPermissions/containerPermissionsCommonAdapters.ts](../../server/containerPermissions/containerPermissionsCommonAdapters.ts)：

```ts
export const newGraphCreatePermissionBody = (
  createChange: IContainerPermissionCreateChange,
) => { ... }
```

对于 Miriam 这条数据，输入是：

```ts
{
  principalType: "people",
  principalId: "miriamg@tenant.onmicrosoft.com",
  userPrincipalName: "MiriamG@tenant.onmicrosoft.com",
  role: "Manager"
}
```

转换后发给 Graph 的请求体会是：

```json
{
  "roles": ["manager"],
  "grantedToV2": {
    "user": {
      "userPrincipalName": "MiriamG@tenant.onmicrosoft.com"
    }
  }
}
```

这里有两个关键转换：

1. `"Manager"` 被 `mapUiContainerPermissionRoleToGraph(...)` 转成了 Graph 需要的小写 `"manager"`
2. 前端自己的 `create` 结构，被翻译成了 Graph 要求的 `grantedToV2.user.userPrincipalName`

### 5.6 第六步：后端真正调用 Graph 创建权限

调用代码在 `applyContainerPermissionChangeSet(...)` 里：

```ts
await graphClient
  .api(getContainerPermissionsGraphPath(containerId))
  .version("v1.0")
  .post(newGraphCreatePermissionBody(createChange));
```

也就是：

1. 请求路径是 `/storage/fileStorage/containers/{containerId}/permissions`
2. 方法是 `POST`
3. 请求体是刚刚生成的 Graph 格式 JSON

如果 Graph 创建成功，这个 container 就会多出一条属于 Miriam 的 `permission` 记录。

### 5.7 第七步：后端不会自己猜结果，而是重新拉取最新列表

这是这个模块非常重要的一点。

`applyContainerPermissionsToGraph(...)` 在变更执行完后，不会直接把“我刚刚提交了什么”回给前端，而是会再次调用：

```ts
const entries = await fetchMapContainerPermissionFromGraphToEntries(
  graphClient,
  containerId,
);
```

这样做的好处是：

1. 返回给前端的是服务端确认后的真实最新状态
2. 如果 Graph 在写入后补充了新的 `permissionId`，前端能立刻拿到
3. 前端本地状态和服务端状态更容易重新对齐

### 5.8 第八步：前端拿到新的 permission 列表

假设 Graph 创建成功并返回的最新权限列表里，新增了一条 Miriam 记录，后端经过 `mapGraphPermissionToEntryOnUI(...)` 后，前端最终会拿到类似：

```ts
{
  id: "permission:NEW_PERMISSION_ID",
  permissionId: "NEW_PERMISSION_ID",
  principalId: "people:permission:NEW_PERMISSION_ID",
  principalUserPrincipalName: "MiriamG@tenant.onmicrosoft.com",
  principalName: "Miriam Graham",
  principalType: "people",
  description: "MiriamG@tenant.onmicrosoft.com",
  role: "Manager"
}
```

注意这里和草稿态最大的区别是：

1. 现在这条记录已经有服务端确认后的 `permissionId`
2. 它不再只是前端临时草稿，而是容器里真实存在的一条权限记录

---

## 6. 为什么中间一定要有“共同契约”和“转换层”

读到这里，你大概会发现：前端、后端、Graph 三边的数据长得并不一样。

这正是 `common/contracts/containerPermissionCommonContracts.ts` 和 `server/containerPermissions/containerPermissionsCommonAdapters.ts` 存在的原因。

### 6.1 共同契约解决的是“前后端怎么说话”

比如前端只需要稳定关心这些字段：

- `permissionId`
- `principalName`
- `principalType`
- `description`
- `role`

它不需要直接理解 Graph 的：

- `grantedToV2.user`
- `grantedToV2.group`
- `siteUser`
- `siteGroup`

### 6.2 转换层解决的是“Graph 怎么说，项目怎么接”

比如：

- Graph 角色是小写 `writer/manager`
- 前端角色是大写 `Writer/Manager`
- Graph 有时给 `user.id`，有时不给
- 新增 people 权限时，Graph 需要的是 `userPrincipalName`

这些都不适合散落在前端和 handler 各处判断，所以要集中在 adapter 层里统一翻译。

### 6.3 Readers 解决的是“边界数据不可信”

Graph 响应、`req.body`、`req.params` 本质上都可以看成 `unknown` 输入。

所以像 [server/containerPermissions/containerPermissionsReaders.ts](../../server/containerPermissions/containerPermissionsReaders.ts) 这样的工具函数，虽然小，但很有价值：

- `readGraphToRecord(...)`
- `readOptionalString(...)`
- `readRequiredString(...)`
- `readStringArray(...)`

它们的作用不是增加业务功能，而是让边界读取更稳定、更集中、更容易维护。
