# Container Permission 共同契约、包装层与 `read*` 模式说明

## 1. 背景

这次重构之前，`Container Permission` 后端逻辑主要集中在一个大文件里。  
当我们沿着“前端弹窗 -> 后端 API -> Microsoft Graph”这条链路读代码时，会看到很多“对象转换”和很多 `read*` 方法，第一眼很容易觉得它们像是在重复包一层。

真正的问题不是“为什么有包装”，而是：

- 必要的包装和可读性包装混在一起了
- 前后端各自维护了一份很像的类型
- `read* / map* / parse* / normalize*` 都堆在一个地方，边界不明显

所以这次重构的目标不是把所有中间层删掉，而是把它们分层、命名、归档，让我们一眼能看出：

1. 哪些是前后端共同契约
2. 哪些是后端为了适配 Graph 必须做的转换
3. 哪些 `read*` 方法本质上是在做“边界防腐层”

为了让这些概念不悬空，下面全文都用同一份真实的 Graph 返回对象举例。

## 2. 示例：Graph List fileStorageContainer Permission 的原始 JSON

下面这份对象，就是调用 Graph 的 `List permissions` 后，后端可能拿到的原始响应：

```json
{
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#storage/fileStorage/containers('b%21tS3mD-xg_EqBuMkNIy_Q85wPs41jU5hBsxXZTsn4gN04XpRkGb3mQ66tfaaDuAMZ')/permissions",
  "value": [
    {
      "id": "X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
      "roles": ["writer"],
      "grantedToV2": {
        "user": {
          "displayName": "Alex Wilber",
          "email": "AlexW@<tenantname>.onmicrosoft.com",
          "userPrincipalName": "alexw@<tenantname>.onmicrosoft.com"
        }
      }
    },
    {
      "id": "X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
      "roles": ["writer"],
      "grantedToV2": {
        "group": {
          "displayName": "U.S. Sales Members",
          "email": "U.S.Sales@<tenantname>.onmicrosoft.com",
          "id": "7eba5343-2fd9-4885-a294-8af3a59677b5"
        }
      }
    }
  ]
}
```

这份 JSON 很重要，因为它能直接说明：

- Graph 返回的不是我们前端直接想消费的 `IContainerPermissionEntry`
- `value` 里的每一项 shape 并不完全统一
- `user` 和 `group` 的字段并不完全一样
- 有些字段前端必须保留，有些字段只是 Graph 协议细节

---

## 3. 总体关系图

现在这个模块里常见的对象层次可以理解成：

```text
前端本地 UI 模型
  ↓
共同契约 common/contracts/containerPermissionCommonContracts.ts
  ↓
后端内部模型 server/containerPermissions/*
  ↓
Microsoft Graph 原始对象
```

结合上面的 JSON，可以把链路想得更具体一些：

```text
Graph GET /permissions 原始响应
  -> response.value[0] / response.value[1]
  -> normalizeGraphPermissionIdentity(...)
  -> mapGraphPermissionToEntry(...)
  -> IContainerPermissionEntry[]
  -> 前端 entries / draft state
```

最关键的区分是：

- Graph 原始对象：例如 `grantedToV2.user.email`
- 共同契约对象：例如 `IContainerPermissionEntry.description`
- 后端内部中间对象：例如 `IGraphPermissionIdentity`

也就是说，Graph 返回对象不是直接穿到前端，而是先被“收口”和“翻译”。

---

## 4. 用这份 JSON 走一遍完整链路

### 第一步：Graph 返回整个响应对象

在 [`containerPermissionsHandlers.ts`](../../server/containerPermissions/containerPermissionsHandlers.ts) 里，`fetchContainerPermissionEntries(...)` 会先拿到类似上面那份原始响应。

它真正关心的是：

```ts
const responseRecord = readRecord(response);
const permissionItems = responseRecord.value;
```

如果把上面的 JSON 代进去：

- `response`：就是整份 Graph JSON 对象
- `responseRecord.value`：就是长度为 2 的数组
- `permissionItems[0]`：就是 Alex Wilber 那条权限
- `permissionItems[1]`：就是 `U.S. Sales Members` 那条权限

如果 `value` 不是数组，这里会直接按空数组处理，而不是让前端崩掉。

### 第二步：`mapGraphPermissionToEntry(...)` 把单条 Graph 权限翻译成共同契约

在 [`containerPermissionsCommonAdapters.ts`](../../server/containerPermissions/containerPermissionsCommonAdapters.ts) 里，核心函数是：

```ts
export const mapGraphPermissionToEntry = (
  permission: unknown,
): IContainerPermissionEntry => { ... }
```

先看第一个 `user` 示例输入：

```json
{
  "id": "X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
  "roles": ["writer"],
  "grantedToV2": {
    "user": {
      "displayName": "Alex Wilber",
      "email": "AlexW@<tenantname>.onmicrosoft.com",
      "userPrincipalName": "alexw@<tenantname>.onmicrosoft.com"
    }
  }
}
```

经过 `mapGraphPermissionToEntry(...)` 后，输出会接近：

```ts
{
  id: "permission:X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
  permissionId: "X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
  principalId:
    "people:permission:X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
  principalUserPrincipalName: "alexw@<tenantname>.onmicrosoft.com",
  principalName: "Alex Wilber",
  principalType: "people",
  description: "AlexW@<tenantname>.onmicrosoft.com",
  role: "Writer"
}
```

这里要注意：

- `permissionId` 来自 Graph 原始 `id`
- `role` 从 Graph 的 `"writer"` 被映射成 UI 契约里的 `"Writer"`
- 这个 `user` 示例里没有 `user.id`，所以 `principalId` 会退化成 `createFallbackPrincipalId("people", permissionId)`

再看第二个 `group` 示例输入：

```json
{
  "id": "X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
  "roles": ["writer"],
  "grantedToV2": {
    "group": {
      "displayName": "U.S. Sales Members",
      "email": "U.S.Sales@<tenantname>.onmicrosoft.com",
      "id": "7eba5343-2fd9-4885-a294-8af3a59677b5"
    }
  }
}
```

输出会接近：

```ts
{
  id: "permission:X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
  permissionId: "X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
  principalId: "7eba5343-2fd9-4885-a294-8af3a59677b5",
  principalUserPrincipalName: undefined,
  principalName: "U.S. Sales Members",
  principalType: "groups",
  description: "U.S.Sales@<tenantname>.onmicrosoft.com",
  role: "Writer"
}
```

这里又能看出一个很关键的区别：

- `group` 分支直接有稳定的 `id`
- 所以 `principalId` 可以直接用真实 group object id
- `groups` 不需要 `principalUserPrincipalName`

### 第三步：整个 GET 接口最终返回什么

`fetchContainerPermissionEntries(...)` 会把 `value` 数组 `map(mapGraphPermissionToEntry)`，所以后端最终返回给前端的结构是：

```ts
const responseBody: IContainerPermissionsResponse = {
  entries: [
    {
      id: "permission:X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
      permissionId:
        "X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
      principalId:
        "people:permission:X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20",
      principalUserPrincipalName: "alexw@<tenantname>.onmicrosoft.com",
      principalName: "Alex Wilber",
      principalType: "people",
      description: "AlexW@<tenantname>.onmicrosoft.com",
      role: "Writer",
    },
    {
      id: "permission:X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
      permissionId:
        "X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
      principalId: "7eba5343-2fd9-4885-a294-8af3a59677b5",
      principalName: "U.S. Sales Members",
      principalType: "groups",
      description: "U.S.Sales@<tenantname>.onmicrosoft.com",
      role: "Writer",
    },
  ],
};
```

这就是共同契约真正发挥作用的地方：前端后面只看 `entries`，不再直接理解 Graph 的 `grantedToV2.user/group` 细节。

---

## 5. 什么是共同契约，为什么放在 `common/contracts`

共同契约文件是 [`containerPermissionCommonContracts.ts`](../../common/contracts/containerPermissionCommonContracts.ts)。

它描述的不是“Graph 长什么样”，而是“前后端通过 HTTP 交互时，彼此承诺的数据长什么样”。

还是用上面的 Graph 示例来看，`IContainerPermissionEntry` 里这些字段为什么存在：

- `permissionId`
  来自 Graph 原始权限项的 `id`
- `principalName`
  对应 `displayName`，例如 `"Alex Wilber"` 或 `"U.S. Sales Members"`
- `description`
  通常取 `email` 或 `userPrincipalName`
- `principalType`
  不直接来自单一字段，而是后端根据 `user/siteUser/group/siteGroup` 分支推导出来
- `role`
  是把 Graph 的小写角色转成 UI 用的大写角色

也就是说，共同契约不是把 Graph JSON 原样搬运，而是把“前端真正需要稳定消费的信息”整理出来。

不应该放进共同契约的内容包括：

- Graph 原始响应 shape，例如 `grantedToV2.user`
- 后端内部中间对象，例如 `IGraphPermissionIdentity`
- 只服务某一层的本地状态

一句话记忆：

**共同契约描述的是“前后端怎么说话”，不是“Graph 原始对象长什么样”。**

---

## 6. 为什么不能把中间对象全删掉

很多同学会问：既然有共同契约，能不能直接把 Graph 返回对象传给前端？

拿这份 JSON 来看，这样做并不合适。

### 1. `user` 和 `group` 的 shape 不统一

在示例 JSON 里：

- 第一条权限用的是 `grantedToV2.user`
- 第二条权限用的是 `grantedToV2.group`

这意味着前端如果直接消费 Graph 数据，就必须到处写这种判断：

```ts
if (permission.grantedToV2?.user) { ... }
if (permission.grantedToV2?.group) { ... }
```

而现在后端只做一次统一，前端永远读：

```ts
entry.principalType;
entry.principalName;
entry.description;
```

### 2. `people` 不一定有稳定 `id`

在示例里的 `user` 权限对象中：

```json
"user": {
  "displayName": "Alex Wilber",
  "email": "AlexW@<tenantname>.onmicrosoft.com",
  "userPrincipalName": "alexw@<tenantname>.onmicrosoft.com"
}
```

这里并没有 `id`。  
如果前端直接把这个 Graph 对象拿来当列表主键或 diff 锚点，就会不稳定。

所以后端才会生成：

```ts
createFallbackPrincipalId("people", permissionId);
```

也就是：

```ts
"people:permission:X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20";
```

### 3. Graph role 和 UI role 不是一套命名

示例 JSON 里角色是：

```json
"roles": ["writer"]
```

但前端共同契约里是：

```ts
role: "Writer";
```

如果没有映射层，前后端就会在大小写和角色枚举上反复纠缠。

所以正确做法不是“删光中间层”，而是：

- 保留真正必要的边界
- 让每个边界只做一件事
- 用文件名把职责说清楚

---

## 7. `normalizeGraphPermissionIdentity(...)` 到底在做什么

这个函数在 [`containerPermissionsCommonAdapters.ts`](../../server/containerPermissions/containerPermissionsCommonAdapters.ts) 里。

它的职责不是“把整条 permission 转完”，而是先把 Graph 里不同形状的 identity 收口成统一对象。

### 例子 1：输入是 `user`

输入：

```json
{
  "displayName": "Alex Wilber",
  "email": "AlexW@<tenantname>.onmicrosoft.com",
  "userPrincipalName": "alexw@<tenantname>.onmicrosoft.com"
}
```

输出会接近：

```ts
{
  graphId: undefined,
  displayName: "Alex Wilber",
  description: "AlexW@<tenantname>.onmicrosoft.com",
  userPrincipalName: "alexw@<tenantname>.onmicrosoft.com"
}
```

### 例子 2：输入是 `group`

输入：

```json
{
  "displayName": "U.S. Sales Members",
  "email": "U.S.Sales@<tenantname>.onmicrosoft.com",
  "id": "7eba5343-2fd9-4885-a294-8af3a59677b5"
}
```

输出会接近：

```ts
{
  graphId: "7eba5343-2fd9-4885-a294-8af3a59677b5",
  displayName: "U.S. Sales Members",
  description: "U.S.Sales@<tenantname>.onmicrosoft.com",
  userPrincipalName: undefined
}
```

这样后面的 `mapGraphPermissionToEntry(...)` 就不用再关心它最初是 `user` 还是 `group` 的字段形状了。

---

## 8. `read*` 模式到底在保护什么

`read*` 方法主要在 [`containerPermissionsReaders.ts`](../../server/containerPermissions/containerPermissionsReaders.ts)。

它们的本质不是业务逻辑，而是“边界读取工具”。

### `readRecord(...)`

函数签名：

```ts
readRecord(value: unknown): Record<string, unknown>
```

把 Graph 整个响应对象传进去：

```ts
const responseRecord = readRecord(graphResponse);
```

如果 `graphResponse` 真的是对象，就返回这个对象的可读形式；如果不是对象，就返回 `{}`。

结合上面的 JSON：

- 输入：整份 Graph 返回对象
- 输出：可以安全执行 `responseRecord.<key>` 的对象

### `readStringArray(...)`

在示例里：

```ts
const roles = readStringArray(permissionRecord.roles);
```

如果输入是：

```json
["writer"]
```

输出就是：

```ts
["writer"];
```

如果 Graph 以后异常返回了别的形状，例如 `null` 或混杂数组，这里至少不会让主流程直接炸掉。

### `readRequiredString(...)`

在 `mapGraphPermissionToEntry(...)` 里有：

```ts
const permissionId = readRequiredString(permissionRecord.id, "permission id");
```

代入第一条示例数据：

- 输入值：`"X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20"`
- 输出值：同一个字符串

如果 Graph 某次返回里缺了 `id`，这里会立即抛错，而不是让后面带着脏数据继续跑。

### `readOptionalString(...)`

在 `normalizeGraphPermissionIdentity(...)` 里有：

```ts
const userPrincipalName = readOptionalString(record.userPrincipalName);
```

代入两个示例：

- 对 `user` 输入，输出是 `"alexw@<tenantname>.onmicrosoft.com"`
- 对 `group` 输入，输出是 `undefined`

这就很符合“可选字段”的语义。

一句话概括：

**`read*` 不是在决定业务，而是在保证主流程读到的是干净、可预测的数据。**

---

## 9. `parse*` 函数的作用

`parseContainerPermissionChangeSet(...)` 在 [`containerPermissionsRequestParser.ts`](../../server/containerPermissions/containerPermissionsRequestParser.ts) 里。

它处理的不是 Graph GET 响应，而是前端提交的 Apply 请求体。

例如，上面 `group` 那条 Graph 权限被映射成：

```ts
{
  permissionId: "X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
  principalId: "7eba5343-2fd9-4885-a294-8af3a59677b5",
  principalType: "groups",
  role: "Writer"
}
```

如果前端把它改成 `Reader`，可能发给后端的 `update` 就是：

```json
{
  "create": [],
  "update": [
    {
      "permissionId": "X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
      "role": "Reader"
    }
  ],
  "remove": []
}
```

这时 `parseContainerPermissionChangeSet(req.body)` 的输入就是上面这个请求体，输出是：

```ts
{
  create: [],
  update: [
    {
      permissionId:
        "X2M6MG8uY3xmZWRlcmF0ZWRkaXJlY3RvcnljbGFpbXByb3ZpZGVyfDdlYmE1MzQzLTJmZDktNDg4NS1hMjk0LThhZjNhNTk2NzdiNQ",
      role: "Reader"
    }
  ],
  remove: []
}
```

再比如，如果前端要删除 Alex 那条权限，请求体可能是：

```json
{
  "create": [],
  "update": [],
  "remove": [
    {
      "permissionId": "X2k6MCMuZnxtZW1iZXJzaGlwfGFsZXh3QDNjdHNyMi5vbm1pY3Jvc29mdC5jb20"
    }
  ]
}
```

也就是说：

- `parse*` 负责把前端请求体读干净
- `map* / normalize*` 负责把 Graph 响应体读干净
- 它们都属于边界防腐层，只是面向的边界不同

---

## 10. `createGraphCreatePermissionBody(...)` 的输入输出例子

这个函数同样在 [`containerPermissionsCommonAdapters.ts`](../../server/containerPermissions/containerPermissionsCommonAdapters.ts) 里。

它负责把共同契约里的新增差异，翻译成 Graph 创建权限时要的请求体。

### 例子 1：新增一个 people 权限

输入：

```ts
{
  principalType: "people",
  principalId: "some-local-id",
  userPrincipalName: "alexw@<tenantname>.onmicrosoft.com",
  role: "Writer"
}
```

输出：

```ts
{
  roles: ["writer"],
  grantedToV2: {
    user: {
      userPrincipalName: "alexw@<tenantname>.onmicrosoft.com"
    }
  }
}
```

这里可以和上面的 Graph 读取示例互相对照：

- 读取回来时，people 记录里常见的是 `displayName/email/userPrincipalName`
- 写回去时，Graph 真正要求的是 `grantedToV2.user.userPrincipalName`

### 例子 2：新增一个 groups 权限

输入：

```ts
{
  principalType: "groups",
  principalId: "7eba5343-2fd9-4885-a294-8af3a59677b5",
  role: "Writer"
}
```

输出：

```ts
{
  roles: ["writer"],
  grantedToV2: {
    group: {
      id: "7eba5343-2fd9-4885-a294-8af3a59677b5"
    }
  }
}
```

这和上面的 `group` 示例也能对上：

- 读取时，后端从 Graph `group.id` 里拿到真实 group id
- 新增时，后端再把这个 id 按 Graph 规定写回 `grantedToV2.group.id`

---

## 11. 重构后的文件地图与阅读顺序

建议按下面顺序读：

```text
common/contracts/containerPermissionCommonContracts.ts
  -> 先看共同契约，理解前后端对外约定的数据结构

src/components/permissions/models/permissionModels.ts
  -> 再看前端本地模型，理解 UI 额外维护了什么

src/components/permissions/services/containerPermissionDiff.ts
  -> 看前端如何从 entries 算出 change set

src/services/containerPermissionApi.ts
  -> 看前端如何请求后端

server/containerPermissions/containerPermissionsHandlers.ts
  -> 看后端主流程如何串联读取、apply、回读

server/containerPermissions/containerPermissionsRequestParser.ts
  -> 看前端请求体如何被 parse 和校验

server/containerPermissions/containerPermissionsCommonAdapters.ts
  -> 看共同契约和 Graph 之间如何互转

server/containerPermissions/containerPermissionsReaders.ts
  -> 看 `read*` 如何做边界防腐

server/containerPermissions/containerPermissionsError.ts
  -> 看错误如何被标准化
```

如果你是第一次接触这个模块，最值得先抓住的两个入口是：

1. `common/contracts/containerPermissionCommonContracts.ts`
2. `server/containerPermissions/containerPermissionsHandlers.ts`

因为一个告诉你“双方约定了什么”，另一个告诉你“整条链路怎么跑”。

---

## 12. 给初级同学的阅读建议

### 建议 1：看到类型先问“它属于哪一层”

拿这次例子来说：

- Graph 原始 `grantedToV2.user.email` 属于 Graph 协议层
- `IGraphPermissionIdentity` 属于后端内部适配层
- `IContainerPermissionEntry.description` 属于共同契约层

只要先分清层次，很多“为什么又包了一层”的困惑会立刻变少。

### 建议 2：看到 `map* / parse* / normalize*` 时，先问“它在把谁翻译成谁”

例如：

- `mapGraphPermissionToEntry`
  是 `Graph permission -> IContainerPermissionEntry`
- `normalizeGraphPermissionIdentity`
  是 `Graph user/group shape -> 统一 identity`
- `parseContainerPermissionChangeSet`
  是 `前端原始请求体 -> 已校验 change set`

### 建议 3：不要把 `read*` 当业务逻辑

`readRecord(...)`、`readRequiredString(...)` 这些函数，并没有在决定“权限应该怎么改”。  
它们只是在做更基础的事：

- 安全读取
- 容错
- 提前失败

真正的业务决策仍然在更高层，比如：

- 为什么 people 创建要用 `userPrincipalName`
- 为什么 `entry.id` 不直接等于 `principalId`
- 为什么 Apply 时要先删、再改、后建

### 建议 4：读代码时，尽量把真实例子代进去

比如读到：

```ts
normalizeGraphPermissionIdentity(grantedToV2.user);
```

脑子里就直接代入：

```json
{
  "displayName": "Alex Wilber",
  "email": "AlexW@<tenantname>.onmicrosoft.com",
  "userPrincipalName": "alexw@<tenantname>.onmicrosoft.com"
}
```

再问自己：“这个函数最后会产出什么统一字段？”  
这样会比只盯着类型签名更容易真正理解系统设计。
