# Graph Error 精确序列化收敛实施说明（2026-06-15）

## 目标

- 让 Graph error 在跨 HTTP 返回前被精确序列化。
- `headers` 输出为普通对象，格式对齐 `HeadersList.entries` 展开后的 key-value 形态。
- `date` 不再被序列化成 `{}`，而是稳定输出为字符串。
- 尽量通过删改和职责收口完成，不再叠加一层并行逻辑。

## 当前问题

当前有四个相关函数，但职责有重叠：

- `serializeUnknownValue(...)`
- `serializeAppError(...)`
- `extractGraphOriginError(...)`
- `buildGraphCauseSnapshot(...)`

真正的问题不是“它们都在做序列化”，而是：

1. Graph 专项拍平逻辑只在 `buildGraphCauseSnapshot(...)` 里。
2. 但标准 `Error` 形态的 Graph error 在运行时不会走这个函数。
3. 最后 `serializeAppError(...)` 又对 `originError.cause` 走了一次通用 `serializeUnknownValue(...)`。
4. `Date` / `Headers` 在通用序列化里没有 Graph 专项投影，所以最后容易变成 `{}`。

这会导致：

- HAR 里能看到 HTTP response header 的 `Date`
- 但错误响应体里的 `originError.cause.date` 和 `originError.cause.headers` 丢形

## 设计结论

采用下面这条边界最清晰、改动也最小：

1. 运行时继续优先保留真实 `Error`
2. 只在 `serializeAppError(...)` 这个 HTTP 边界，对 Graph `originError.cause` 做专项投影
3. `buildGraphCauseSnapshot(...)` 成为 Graph cause 的最终 plain object 生成器
4. `serializeUnknownValue(...)` 继续保留通用兜底职责，不承载 Graph 语义

也就是说：

- Graph 识别仍由 `extractGraphOriginError(...)` 负责
- Graph 最终序列化形状由 `buildGraphCauseSnapshot(...)` 负责
- `serializeAppError(...)` 负责决定“什么时候该用 Graph 专项快照，而不是通用序列化”

## 具体改法

### 1. 收敛 `serializeAppError(...)`

在 `common/appError.ts` 里改 `serializeAppError(...)`：

- 当前逻辑：
  - `originError.cause` 存在时，一律 `serializeUnknownValue(error.originError.cause)`
- 改成：
  - 若 `error.originError?.source === "microsoft-graph"`
  - 并且 `originError.cause` 是 `Error` 或普通对象
  - 则走 Graph 专项快照构建
  - 否则仍走通用 `serializeUnknownValue(...)`

建议做法：

- 从 `common/graphError.ts` 导出一个可复用的 Graph cause 序列化入口
- 最好直接复用 `buildGraphCauseSnapshot(...)`，避免再造并行 helper
- 如果名字不适合导出，可以小幅改名为更明确的公共 helper，但不要再多建一层包装

目标结果：

- Graph error 的 `originError.cause` 在 HTTP 响应里总是 plain object
- 非 Graph error 的 `originError.cause` 仍保持现有通用序列化行为

### 2. 收窄 `extractGraphOriginError(...)`

在 `common/graphError.ts` 中保留现有主职责：

- 判断是否像 Graph error
- 提取 `codePath`
- 提取 `retryAfter`
- 保留 `source: "microsoft-graph"`

但不要再让它承担“最终 HTTP 快照长什么样”的职责。

保留这条规则：

- 若输入不是 `Error`，仍可用 `buildGraphCauseSnapshot(...)` 兜底生成 `cause`
- 若输入是标准 `Error`，运行时继续保留真实 `Error`

这样能保住当前运行时语义，同时把“最终返回给前端的样子”统一推迟到 `serializeAppError(...)`

### 3. 精简并强化 `buildGraphCauseSnapshot(...)`

这个函数保留，但职责要明确成：

- 输入：Graph 风格错误值
- 输出：最终适合放进 `originError.cause` 的 plain object

构造顺序保持：

1. 先从原始异常保留基础上下文
2. 再用 Graph 专项逻辑覆盖关键字段

关键字段要求：

- `name`
- `message`
- `statusCode`
- `code`
- `date`
- `body`
- `headers`

其中重点处理：

#### `headers`

- 如果是 `Headers` 实例，转成普通对象
- 输出形态必须类似：

```ts
{
  "cache-control": "no-store, no-cache",
  "client-request-id": "...",
  "content-type": "application/json",
  "date": "Mon, 15 Jun 2026 11:43:13 GMT",
  "request-id": "...",
}
```

- 不返回 `Headers`
- 不返回 entries 数组
- 不保留 prototype 或内部私有结构

#### `date`

- 如果 `record.date` 是 `Date`，转成字符串
- 如果是非空字符串，原样保留
- 如果外层没有，则回退到 `innerError.date`
- 不再把 `Date` 交给会产出 `{}` 的普通对象递归逻辑

建议格式：

- `Date` 实例统一使用 `toISOString()`
- 已经是字符串的 Graph header/body 时间值保持原样

### 4. 给 `serializeUnknownValue(...)` 只做最小增强

`serializeUnknownValue(...)` 不做 Graph 专项逻辑，但建议补一个很小的通用分支：

- `value instanceof Date` 时直接返回 `value.toISOString()`

这样有两个好处：

- 即使未来别的错误路径里带 `Date`，也不会再变成 `{}`
- 改动小，不会把 `Headers` 这种 Graph 专项行为扩散进通用层

不要在这里加入 `Headers` 专项处理。

原因：

- `Headers` 的目标输出格式是这次 Graph 场景的明确诉求
- 放进通用层会扩大语义面
- 当前最小方案里，`Headers` 继续由 Graph 专项逻辑负责更合理

## 建议删改方向

优先删改，不加新层：

1. 删掉 `serializeAppError(...)` 中对 Graph cause 的“一刀切通用序列化”
2. 把 Graph cause 最终投影职责集中到 `buildGraphCauseSnapshot(...)`
3. 保留 `extractGraphOriginError(...)` 的识别职责，不扩张
4. 通用层只补 `Date` 的最小支持

不建议这轮做的事：

- 不要把所有特殊对象的序列化都堆进 `serializeUnknownValue(...)`
- 不要新增第二套 `serializeGraphErrorCause(...)` / `normalizeGraphCause(...)` 并行体系，除非导出 `buildGraphCauseSnapshot(...)` 的名字明显不合适
- 不要修改 `AppErrorShape` / `IOriginError` 的 envelope
- 不要试图在前端恢复 `Date` / `Headers` 实例

## 测试要求

重点改 `server/common/errors.test.ts`，至少覆盖下面场景：

1. 标准 `Error` 形态的 Graph error
   - 带 `statusCode`
   - 带 `headers: Headers`
   - 带 `date: Date`
   - 断言最终 `originError.cause.headers` 是普通对象
   - 断言最终 `originError.cause.date` 是字符串

2. 普通对象形态的 Graph error
   - `body` 是 JSON 字符串
   - 仍然保留 `codePath`
   - 仍然能得到 `cause.code`

3. 非 Graph error
   - `originError.cause` 仍走原有通用序列化
   - 不应被误套 Graph 专项字段投影

4. 通用 `serializeUnknownValue(...)`
   - 新增 `Date -> ISO string` 回归用例

## 实施顺序

1. 先改 `common/graphError.ts`
   - 明确 `buildGraphCauseSnapshot(...)` 的最终职责
   - 保证 `headers` / `date` 输出稳定

2. 再改 `common/appError.ts`
   - 调整 `serializeAppError(...)` 对 Graph cause 的分支
   - 给 `serializeUnknownValue(...)` 补最小 `Date` 支持

3. 最后补测试
   - `server/common/errors.test.ts`
   - `common/appError.test.ts`

## 成功标准

- `createContainer` 这类后端 Graph 调用失败时，返回前端的错误体中：
  - `originError.source === "microsoft-graph"`
  - `originError.cause.headers` 为普通对象
  - `originError.cause.date` 为字符串
  - `originError.cause.body` 保留原始 Graph body
- 非 Graph 错误响应行为不出现明显回归
- 整体代码比现在更收敛，不新增新的重复 helper 链
