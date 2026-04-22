# 本次会话改动说明 —— 面向初级开发者

> **阅读建议**：如果你刚接手这个项目，可以按章节顺序阅读；如果只关心某个具体问题，直接跳到对应小节。

---

## 目录

1. [背景：为什么要做这些改动](#1-背景为什么要做这些改动)
2. [改动一：框架升级 — CRA → Vite，TypeScript 4 → 5](#2-改动一框架升级--cra--vite-typescript-4--5)
3. [改动二：后端崩溃修复 — Restify 异步处理器签名错误](#3-改动二后端崩溃修复--restify-异步处理器签名错误)
4. [改动三：TypeScript 严格错误处理 — 告别 `any`](#4-改动三typescript-严格错误处理--告别-any)
5. [改动四：CORS 安全加固 — 从"反射任意域"到"白名单校验"](#5-改动四cors-安全加固--从反射任意域到白名单校验)
6. [改动五：VS Code 开发工具链修复](#6-改动五vs-code-开发工具链修复)
7. [改动六：其他代码质量改进](#7-改动六其他代码质量改进)
8. [变更文件速查表](#8-变更文件速查表)

---

## 1. 背景：为什么要做这些改动

这个项目最初使用 **Create React App（CRA）+ TypeScript 4.9.5 + ES2015 目标** 搭建前端，使用 **Restify + 旧版 TypeScript 配置** 搭建后端。随着项目依赖库版本的升级（Restify 从 v8 升到 v9/v11，TypeScript 生态持续演进），原有配置积累了多处"隐形地雷"，主要体现在：

- 后端启动即崩溃（Restify 9+ 的破坏性变更）
- 前端无法在 VS Code 中调试（开发工具配置过时）
- `AbortSignal.any` 等现代 API 报 TypeScript 类型错误（目标版本太旧）
- 安全隐患（CORS 回显任意域、错误对象类型不安全）

本次会话系统性地解决了这些问题。

---

## 2. 改动一：框架升级 — CRA → Vite，TypeScript 4 → 5

### 2.1 为什么要换掉 Create React App？

**CRA（Create React App）** 是几年前流行的 React 项目脚手架，它底层依赖 Webpack 4/5 和一套 `react-scripts` 工具链。问题在于：

- CRA 已经停止主动维护
- 启动速度慢（Webpack 需要把所有文件打包后才能提供服务）
- 和新版 ESLint（v9 flat config）不兼容

**Vite** 是现代前端构建工具的主流选择：

- 开发服务器几乎秒开（利用浏览器原生 ES Module，只按需编译被访问的文件）
- 构建输出更小更快
- 与 TypeScript 5、ESLint 9 flat config 原生兼容

### 2.2 具体变更了什么

#### `vite.config.ts`（新文件）

```typescript
export default defineConfig({
  plugins: [react()], // React JSX 转换 + 热更新
  server: { port: 3000 }, // 与原 CRA 端口保持一致，不破坏已有的 CORS 配置
  build: { outDir: "build", sourcemap: true },
});
```

#### `index.html`（新文件，移到项目根目录）

CRA 把 `index.html` 放在 `public/` 目录，并通过 `%PUBLIC_URL%` 注入路径；  
Vite 要求 `index.html` 在项目根目录，并用 `<script type="module" src="/src/index.tsx">` 声明入口：

```html
<!-- Vite 以 ES Module 方式加载，type="module" 是必须的 -->
<script type="module" src="/src/index.tsx"></script>
```

#### `tsconfig.json`（前端）

| 配置项             | 旧值                              | 新值                              | 原因                                                          |
| ------------------ | --------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| `target`           | `ES2015`                          | `ES2020`                          | 解锁现代 API 类型（如 `AbortSignal.any`），兼容所有主流浏览器 |
| `lib`              | `["dom","dom.iterable","esnext"]` | `["ES2020","DOM","DOM.Iterable"]` | 与 target 对齐                                                |
| `module`           | `Node16`                          | `ESNext`                          | Vite 使用 ES Module，应配 `ESNext`                            |
| `moduleResolution` | `node16`                          | `bundler`                         | Vite 使用 bundler 模式解析路径，与 Node16 解析行为不同        |
| `noEmit`           | `true`                            | `true`                            | Vite 负责编译，TypeScript 只做类型检查，不输出 `.js` 文件     |

#### `src/react-app-env.d.ts`

原来是 CRA 专用的引用声明：

```typescript
/// <reference types="react-scripts" />
```

换成 Vite 对应的，并补全所有前端环境变量的类型定义（从 `REACT_APP_*` 改为 `VITE_*`）：

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLIENT_ENTRA_APP_CLIENT_ID: string;
  // ... 所有 VITE_ 开头的环境变量
}
```

> **为什么从 `process.env.REACT_APP_*` 改为 `import.meta.env.VITE_*`？**  
> CRA 在构建时会把 `process.env.REACT_APP_XXX` 替换成字面量值；Vite 改用浏览器原生的 ES Module 方案，环境变量通过 `import.meta.env` 注入，且必须以 `VITE_` 为前缀。

#### `src/common/config.ts`

所有 `process.env.REACT_APP_*` 替换为 `import.meta.env.VITE_*`：

```typescript
// 旧写法（CRA）
const value = process.env["REACT_APP_CLIENT_ENTRA_APP_CLIENT_ID"];

// 新写法（Vite）
const value = import.meta.env["VITE_CLIENT_ENTRA_APP_CLIENT_ID"] as
  | string
  | undefined;
```

#### `server/tsconfig.json`（后端）

| 配置项         | 旧值                                      | 新值         | 原因                                                                |
| -------------- | ----------------------------------------- | ------------ | ------------------------------------------------------------------- |
| `target`       | `ES2015`                                  | `ES2022`     | Node 20 完整支持 ES2022，可使用顶层 `await`、class static blocks 等 |
| `lib`          | `["es5","es6","dom","es2015.collection"]` | `["ES2022"]` | 后端只跑在 Node，不需要 DOM 类型                                    |
| `skipLibCheck` | 无                                        | `true`       | 跳过第三方 `.d.ts` 的类型检查，避免 `@lit/task` 等包的兼容性报错    |

---

## 3. 改动二：后端崩溃修复 — Restify 异步处理器签名错误

### 3.1 问题现象

启动后端后，任何 API 请求都会导致服务器抛出以下错误并崩溃：

```
AssertionError [ERR_ASSERTION]: Handler accepts a third argument (the 'next'
callback) but is also an async function. This is not allowed in Restify 9+.
```

### 3.2 根本原因：Restify 9.0.0 的破坏性变更

在 Restify 8 及更早版本，下面这种写法是合法的：

```typescript
// Restify ≤ 8 的旧写法（现在不再允许）
server.get("/api/example", async (req, res, next) => {
  await doSomething();
  next(); // 告诉框架"我处理完了，继续下一个"
});
```

从 **Restify 9.0.0** 开始，框架明确区分两种处理器风格：

| 风格                   | 签名               | 通知框架完成的方式                    |
| ---------------------- | ------------------ | ------------------------------------- |
| **async/Promise 风格** | `async (req, res)` | 函数返回的 Promise resolve 即视为完成 |
| **callback 风格**      | `(req, res, next)` | 显式调用 `next()`                     |

**两者不能混用。** 如果你写了 `async (req, res, next)`，Restify 会检测到你接收了 `next` 参数（函数的 `.length === 3`），同时又是 `async` 函数，直接抛出 `AssertionError`。这是框架为了防止"异步函数内忘记等 `await` 就调用 `next()`"这类 bug 而故意加的保护。

### 3.3 修复方法

**涉及文件：`server/index.ts`**

将所有路由处理器的 `next` 参数移除，并删除所有 `return next()` 调用：

```typescript
// ❌ 修复前（触发 Restify 断言错误）
server.get("/api/listContainers", async (req, res, next) => {
  try {
    await listContainers(req, res);
  } catch (error: any) {
    res.send(500, { message: `Error: ${error.message}` });
  }
  next(); // ← 不能出现在 async 函数里
});

// ✅ 修复后
server.get("/api/listContainers", async (req, res) => {
  try {
    await listContainers(req, res);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.send(500, { message: `Error: ${msg}` });
  }
  // 不需要 next()，async 函数返回即视为处理完毕
});
```

> **一个记忆技巧**：在 Restify 9+ 中，看到 `async` 就不要写 `next`；看到 `next` 就不要写 `async`。

受影响的路由共 6 个：

- `GET /api/listContainers`
- `POST /api/createContainer`
- `POST /api/deleteItems`
- `POST /api/downloadArchive/start`
- `GET /api/downloadArchive/progress/:jobId`
- `GET /api/downloadArchive/manifest/:jobId`

同时在文件头部新增了一段 JSDoc 注释（`Handler 风格说明`），向后续开发者解释这个约定，防止同样的错误再次发生。

---

## 4. 改动三：TypeScript 严格错误处理 — 告别 `any`

### 4.1 问题：`catch (error: any)` 是不安全的

项目开启了 TypeScript `strict` 模式，其中包含 `useUnknownInCatchVariables: true`，意味着 `catch` 块中捕获的错误值类型是 `unknown`，而不是 `any`。

旧代码把它当 `any` 来用：

```typescript
} catch (error: any) {
  res.send(500, { message: `Error: ${error.message}` }); // ← 如果 error 不是 Error 对象呢？
}
```

这有两个问题：

1. **类型不安全**：任何值都可以被 `throw`（字符串、数字、`null`...），直接访问 `.message` 可能返回 `undefined` 或直接报错
2. **明确违反 strict 模式精神**：用 `any` 绕过了 TypeScript 的保护

### 4.2 修复方法：类型收窄

所有 `catch` 块统一改为以下模式：

```typescript
} catch (error: unknown) {
  // 先判断是不是 Error 对象，再访问 .message；否则转为字符串
  const msg = error instanceof Error ? error.message : String(error);
  res.send(500, { message: `Error: ${msg}` });
}
```

> **`instanceof Error` 是什么？**  
> `instanceof` 是 JavaScript 的运算符，用来检查一个值是否是某个类的实例。`error instanceof Error` 检查 `error` 是否是 `Error` 类（或其子类）的实例，只有这时才能安全地访问 `.message`。

**涉及文件**：`server/index.ts`、`server/listContainers.ts`、`server/downloadArchive.ts`、`src/components/files.tsx`、`src/services/spembedded.ts`

---

## 5. 改动四：CORS 安全加固 — 从"反射任意域"到"白名单校验"

### 5.1 什么是 CORS？

**CORS（跨域资源共享）** 是浏览器的安全机制。当前端（`http://localhost:3000`）请求后端（`http://localhost:3001`）时，浏览器会先发一个"预检请求"询问后端"你允许这个来源吗？"。后端需要在响应头中回答：

```
Access-Control-Allow-Origin: http://localhost:3000
```

### 5.2 问题：旧代码回显任意域

旧代码直接把请求头里的 `Origin` 字段原样写回响应头：

```typescript
// ❌ 旧写法 — 安全隐患
server.pre((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.header("origin")); // ← 任意域都通过了！
  // ...
});
```

这意味着任何域（包括恶意域）都能拿到 CORS 授权，可能导致 CSRF 攻击。

### 5.3 修复方法：白名单校验

**涉及文件：`server/index.ts`**

```typescript
// 从环境变量读取允许的来源列表，默认只允许本地开发服务器
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

server.pre((req, res, next) => {
  const origin = req.header("origin") ?? "";
  // ✅ 只有在白名单内的 Origin 才设置 CORS 响应头
  if (ALLOWED_ORIGINS.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  // ...
});
```

> **生产环境配置**：部署时通过环境变量 `CORS_ALLOWED_ORIGINS` 设置允许的域，多个域用逗号分隔：  
> `CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com`

---

## 6. 改动五：VS Code 开发工具链修复

### 6.1 `.vscode/tasks.json` — 前端任务识别卡住

**问题**：在 VS Code 中启动调试时，会一直显示"正在等待 preLaunchTask dev:frontend..."，永远不结束。

**原因**：`tasks.json` 里配置了 `problemMatcher`，VS Code 通过匹配终端输出来判断任务是否启动完成。旧配置使用的是 CRA/Webpack 的输出模式：

```json
"beginsPattern": "Starting the development server",  // Webpack 的输出
"endsPattern": "Compiled successfully|webpack compiled"  // Webpack 的完成标志
```

换成 Vite 后，终端输出变了，VS Code 匹配不到，就一直等待。

**修复**：更新为 Vite 的实际输出：

```json
"beginsPattern": "VITE",          // Vite 启动时输出 "VITE v6.x.x"
"endsPattern": "ready in"         // Vite 完成时输出 "ready in xxx ms"
```

---

### 6.2 `.vscode/launch.json` — Chrome 调试器无法命中断点

**问题一：`pwa-chrome` 类型已弃用**

旧配置使用了 `"type": "pwa-chrome"`，这是旧版 VS Code 的调试器类型，已被废弃。更新为：

```json
"type": "chrome"  // 当前的正确值
```

**问题二：Vite 的 sourceMap 路径格式不同**

Chrome 调试器需要 `sourceMapPathOverrides` 来将浏览器中加载的虚拟路径映射回本地文件。CRA 和 Vite 使用不同的路径格式：

```json
// 新增：Vite 特有的虚拟路径前缀映射
"sourceMapPathOverrides": {
  "/@fs/*": "${workspaceFolder}/*",       // Vite 用 /@fs/ 服务绝对路径文件
  "/src/*": "${workspaceFolder}/src/*"   // 项目内 src 目录
}
```

没有这个配置，VS Code 无法找到源文件，断点就无效了。

---

### 6.3 `.vscode/settings.json` — 从空白到完整配置

旧文件内容是空的 `{}`，现在补全了以下实用配置：

```json
{
  // 使用项目本地安装的 TypeScript，避免 VS Code 内置版本与项目不兼容
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,

  // 保存文件时自动修复 ESLint 能自动处理的问题（如多余空行、未使用的变量等）
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },

  // 保存文件时自动格式化（使用 Prettier）
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,

  // 自动导入时优先使用相对路径，与项目风格一致
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

---

## 7. 改动六：其他代码质量改进

### 7.1 `src/global.d.ts` — 扩展 `webkitdirectory` 属性类型

**问题**：`<input webkitdirectory="">` 允许用户选择整个文件夹，但这是非标准 HTML 属性，TypeScript 默认不认识它，导致类型错误。

旧代码用 `as any` 绕过：

```typescript
// ❌ 旧写法 — 用 any 绕过类型检查
<input {...({ webkitdirectory: "" } as any)} />
```

**修复**：通过 TypeScript 的**声明合并（Declaration Merging）**安全地扩展 React 的属性接口：

```typescript
// src/global.d.ts
declare namespace React {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
  }
}
```

这样就可以直接写：

```typescript
// ✅ 修复后 — 类型安全，没有 any
<input webkitdirectory="" type="file" multiple />
```

> **什么是声明合并？**  
> TypeScript 允许对同一个 `interface` 进行多次声明，编译器会自动把它们合并成一个。这里我们"追加"了 `webkitdirectory` 属性到 React 已有的 `InputHTMLAttributes` 接口里，而不需要修改 React 源码。

---

### 7.2 `src/components/files.tsx` — 移除 `isomorphic-fetch` 和 `any` 类型

**移除 `isomorphic-fetch`**：

```typescript
// ❌ 旧写法 — 不必要的 polyfill
require("isomorphic-fetch");
```

`isomorphic-fetch` 是一个为旧版 Node.js 和 IE 提供 `fetch` 的 polyfill。现代浏览器和 Node 18+ 都内置了 `fetch`，无需这个包。

**替换 `any` 类型的 Graph 客户端参数**：

```typescript
// ❌ 旧写法
const createFolderIfNotExists = async (graphClient: any, ...) => { ... }

// ✅ 修复后 — 定义最小接口，明确描述所需方法
interface IGraphApiClient {
  api(path: string): {
    get(): Promise<{ value: DriveItem[] }>;
    post(data: object): Promise<DriveItem>;
  };
}
const createFolderIfNotExists = async (graphClient: IGraphApiClient, ...) => { ... }
```

> **为什么不直接用 `Client` 类型？**  
> 项目同时依赖 `@microsoft/microsoft-graph-client` 和 `@microsoft/mgt-element`，两个包都有自己的 `Client` 类型定义，内部有私有字段冲突。用一个只描述"我实际需要的方法"的最小接口，既类型安全又彻底回避了包冲突。

---

### 7.3 `src/components/containers.tsx` — 移除 `props: any`

```typescript
// ❌ 旧写法
export const Containers = (props: any) => { ... }

// ✅ 修复后
interface IContainersProps {
  // 当前无属性，预留未来扩展
}
export const Containers = (_props: IContainersProps) => { ... }
```

> 参数名前加 `_` 是 TypeScript 约定，表示"这个参数存在但当前不使用"，避免编译器报"未使用变量"的警告。

---

## 8. 变更文件速查表

| 文件                            | 类型 | 改动摘要                                                               |
| ------------------------------- | ---- | ---------------------------------------------------------------------- |
| `vite.config.ts`                | 新增 | Vite 构建配置，替代 `react-scripts`                                    |
| `index.html`                    | 新增 | Vite 入口 HTML，移到项目根目录                                         |
| `tsconfig.json`                 | 修改 | 目标 ES2020，moduleResolution bundler，适配 Vite                       |
| `src/react-app-env.d.ts`        | 修改 | 替换为 Vite 类型引用，补全 `VITE_*` 环境变量类型                       |
| `src/common/config.ts`          | 修改 | `process.env.REACT_APP_*` → `import.meta.env.VITE_*`                   |
| `src/global.d.ts`               | 修改 | 声明合并扩展 `webkitdirectory` 属性                                    |
| `src/components/containers.tsx` | 修改 | `props: any` → `IContainersProps` 接口                                 |
| `src/components/files.tsx`      | 修改 | 移除 `isomorphic-fetch`，`any` → `IGraphApiClient`，`catch` 类型安全化 |
| `src/services/spembedded.ts`    | 修改 | `catch` 类型 `any` → `unknown`                                         |
| `server/index.ts`               | 修改 | 6 个路由删除 `next` 参数，CORS 白名单，`catch` 类型安全化              |
| `server/listContainers.ts`      | 修改 | `catch` 类型 `any` → `unknown`                                         |
| `server/downloadArchive.ts`     | 修改 | `catch` 类型 `any` → `unknown`                                         |
| `server/tsconfig.json`          | 修改 | 目标 ES2022，lib 去掉 DOM，加 `skipLibCheck`                           |
| `.vscode/tasks.json`            | 修改 | 前端任务匹配模式从 Webpack 改为 Vite                                   |
| `.vscode/launch.json`           | 修改 | `pwa-chrome` → `chrome`，新增 Vite sourceMapPathOverrides              |
| `.vscode/settings.json`         | 修改 | 从空白配置补全 TS/ESLint/Prettier 相关设置                             |

---

_文档生成时间：基于本次会话所有代码变更_
