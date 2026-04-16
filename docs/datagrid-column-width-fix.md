# DataGrid 列宽重置问题修复说明

> 目标读者：初级前端开发者  
> 涉及文件：`src/components/files.tsx`

---

## 一、问题描述

用户调整 DataGrid 的列宽后，只要点击文件名或勾选某一行，列宽就会**自动还原为默认值**。

---

## 二、根本原因：React 函数组件的执行机制

### 2.1 每次 re-render = 函数体重新执行

React 函数组件本质上是一个普通函数。每当某个 `useState` 的 setter 被调用（如 `setPreviewOpen(true)` 或 `setSelectedRows(...)`），React 就会**重新调用整个组件函数**。

```tsx
export const Files = (props) => {
  // 每次 re-render，以下所有 const 都是全新声明
  const columns = [ createTableColumn(...), ... ];  // 新数组，新内存地址
  const columnSizingOptions = { ... };              // 新对象，新内存地址
  ...
};
```

### 2.2 Fluent UI DataGrid 如何检测"列定义是否变化"

DataGrid 内部维护着列宽状态，其伪代码如下：

```tsx
// Fluent UI 内部（简化）
const [columnWidths, setColumnWidths] = useState(
  () => initWidthsFromColumns(columns), // 初次挂载时根据 columns 初始化
);

useEffect(() => {
  setColumnWidths(initWidthsFromColumns(columns)); // columns 引用变化时重新初始化
}, [columns]); // ← 用引用相等（Object.is）判断是否变化
```

### 2.3 触发链路

```
点击文件名
  → setCurrentPreviewFile(driveItem)   ← 触发 re-render
  → Files() 函数重新执行
  → columns = [...]          新数组  地址 0xAAA → 0xBBB
  → DataGrid 收到新 columns  prop 变化
  → 内部 useEffect deps 检测到引用改变（0xAAA ≠ 0xBBB）
  → 重置所有列宽为 defaultWidth  ← 用户调整的宽度丢失
```

勾选行触发 `setSelectedRows` → 同样的链路 → 同样的问题。

---

## 三、修复方案：稳定所有传入 DataGrid 的引用

### 修复思路图

```
Bug: columns 引用每次 re-render 都变化
         ↓ 直接修复
useMemo(() => [...], [navigateToFolder])     ← 根本改动
         ↓ 但 useMemo 需要 deps 稳定才有意义
navigateToFolder 必须稳定
         ↓
useCallback(async () => {...}, [loadItems])
         ↓ 但 useCallback 需要捕获的函数稳定
loadItems 必须稳定
         ↓
useCallback(async () => {...}, [props.container.id])
         ↓ 顺带：loadItems 稳定后，useEffect([props]) 变得语义不精确
useEffect deps 改为 [loadItems]              ← 一致性清理

columnSizingOptions 提至模块级常量           ← 同类问题，一并修复
```

---

## 四、逐项代码讲解

### 4.1 补充 Hook 导入

```diff
- import React, { useState, useEffect, useRef } from "react";
+ import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
```

新增的两个 Hook：

- `useCallback`：缓存**函数引用**，只在 deps 变化时重建。
- `useMemo`：缓存**计算结果**（数组/对象），只在 deps 变化时重算。

---

### 4.2 `columnSizingOptions` 提至模块级常量

**改动前（组件内部）：**

```tsx
export const Files = (props) => {
  ...
  const columnSizingOptions = {   // 每次 render 都是新对象
    driveItemName: { minWidth: 150, defaultWidth: 250, idealWidth: 200 },
    ...
  };
};
```

**改动后（组件外部）：**

```tsx
// 模块级常量——只在模块加载时创建一次，引用永远不变
const columnSizingOptions = {
  driveItemName: { minWidth: 150, defaultWidth: 250, idealWidth: 200 },
  lastModifiedTimestamp: { minWidth: 150, defaultWidth: 150 },
  lastModifiedBy:        { minWidth: 150, defaultWidth: 150 },
  actions:               { minWidth: 300, defaultWidth: 320 },
};

export const Files = (props) => { ... };
```

**为什么有效**：模块级变量只在模块首次加载时初始化一次，之后所有 render 共享同一个对象引用，DataGrid 拿到相同引用 → 不重置。

---

### 4.3 `loadItems` 加 `useCallback`

**改动前：**

```tsx
const loadItems = async (itemId?, folderName?) => {
  const driveId = props.container.id;  // 每次 render 都是新函数
  ...
};
```

**改动后：**

```tsx
const loadItems = useCallback(async (itemId?, folderName?) => {
  const driveId = props.container.id;  // 通过闭包捕获当前 render 的值
  ...
}, [props.container.id]);  // ← 只有 container.id 变化时才重建
```

**`useCallback` 的工作原理：**

React 在 Fiber（组件内部数据结构）上为每个 hook 维护一个缓存节点：

```
render #1: container.id = "abc"
  → useCallback 创建 loadItems_v1，缓存到 Fiber
  → 返回 loadItems_v1（地址 0x001）

render #2: container.id = "abc"（不变）
  → useCallback 比较 deps：Object.is("abc", "abc") = true
  → 直接返回缓存的 loadItems_v1（地址仍为 0x001）✅

render #3: container.id = "xyz"（变了，切换容器）
  → deps 对比失败：Object.is("abc", "xyz") = false
  → 创建新的 loadItems_v2（地址 0x002）✅ 捕获新 container.id
```

---

### 4.4 `useEffect` deps 改为 `[loadItems]`

**改动前：**

```tsx
useEffect(() => {
  loadItems();
}, [props]); // ← 监听 props 对象引用
```

**改动后：**

```tsx
// 注意：必须放在 loadItems 声明之后（useCallback 产生的 const 有暂时性死区 TDZ）
useEffect(() => {
  loadItems();
}, [loadItems]); // ← 监听 loadItems 引用
```

**为什么 `[props]` 有问题：**

父组件每次 re-render，即使容器没切换，也会传入一个新的 `props` 对象：

```
父组件因为自身 state 变化而 re-render：
  props_v1 = { container: { id: "abc" } }  地址 0xAAA
  props_v2 = { container: { id: "abc" } }  地址 0xBBB   ← 内容相同，引用不同

Object.is(0xAAA, 0xBBB) = false → effect 重跑 → 多余的 API 请求
```

**为什么 `[loadItems]` 正确：**

`loadItems` 由 `useCallback([props.container.id])` 保证只在容器切换时重建。effect 跟着 `loadItems` 走，等价于"容器切换时重载"，但不会因为父组件无关 re-render 而触发。

**`useEffect` 必须移到 `loadItems` 声明之后的原因：**

`useCallback` 的结果是一个 `const`，在 JavaScript 中 `const`/`let` 存在**TDZ**：

```js
console.log(x); // ReferenceError: Cannot access 'x' before initialization
const x = 1;
```

把 `useEffect` 放在 `const loadItems = useCallback(...)` 之后，就避免了 TDZ 问题。（旧代码是 `const loadItems = async function`，在 JavaScript 引擎执行前整个函数体会被提升，不存在这个问题。）

---

### 4.5 `navigateToFolder` 加 `useCallback`

**改动前：**

```tsx
const navigateToFolder = async (targetFolderId, targetFolderName) => {
  await loadItems(targetFolderId, targetFolderName);  // 每次 render 新函数
  ...
};
```

**改动后：**

```tsx
const navigateToFolder = useCallback(async (targetFolderId, targetFolderName) => {
  await loadItems(targetFolderId, targetFolderName);
  ...
}, [loadItems]);  // ← loadItems 稳定，navigateToFolder 也就稳定
```

这是稳定性链条的中间环节：`loadItems` 稳定 → `navigateToFolder` deps 不变 → `navigateToFolder` 稳定 → 下一步 `useMemo` 才有意义。

---

### 4.6 `columns` 改为 `useMemo`（根本修复）

**改动前：**

```tsx
const columns: TableColumnDefinition<IDriveItemExtended>[] = [
  createTableColumn({ columnId: "driveItemName", ... }),
  ...
];  // 每次 render 都是新数组
```

**改动后：**

```tsx
// 只在 navigateToFolder 或 styles 引用变化时重算，正常交互中永远是同一个数组引用
const columns = useMemo<TableColumnDefinition<IDriveItemExtended>[]>(() => [
  createTableColumn({ columnId: "driveItemName", ... }),
  ...
], [navigateToFolder, styles]);
```

**为什么 deps 只有 `navigateToFolder` 和 `styles`：**

- `navigateToFolder`：columns 的 `renderCell` 里调用了它（文件夹点击跳转）
- `styles`：columns 的 `renderCell` 里用到了 `styles.actionsButtonGroup`
- `setCurrentPreviewFile`、`setPreviewOpen` 等 setter：React 保证 `useState` 的 setter 永远是同一个引用，不需要加入 deps

---

## 五、稳定性链条总结

```
props.container.id（原始 string，值比较）
        ↓ useCallback dep
loadItems 引用稳定
        ↓ useCallback dep
navigateToFolder 引用稳定
        ↓ useMemo dep
columns 数组引用稳定
        ↓ DataGrid prop 不变
DataGrid 不重置列宽 ✅

columnSizingOptions（模块级常量）
        ↓ 天然稳定
DataGrid 不重置列宽 ✅
```

---

## 六、验证方法

1. 手动拖动 DataGrid 任意列宽
2. 点击文件名打开预览 → 关闭预览 → 列宽应**保持不变** ✅
3. 勾选任意一行文件 → 列宽应**保持不变** ✅
4. 在容器列表切换到另一个容器 → 列宽**重置**（符合预期，容器变了） ✅

---

## 七、延伸阅读

- [React 官方文档：useCallback](https://react.dev/reference/react/useCallback)
- [React 官方文档：useMemo](https://react.dev/reference/react/useMemo)
- [React 官方文档：useEffect](https://react.dev/reference/react/useEffect)
- [MDN：TDZ](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Statements/let#%E6%9A%82%E6%97%B6%E6%80%A7%E6%AD%BB%E5%8C%BA)
