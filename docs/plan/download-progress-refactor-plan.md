## Plan: ZIP下载进度条重构与节流修正（含中止功能）

### 目标

将下载进度体验改为"整体加权进度 + 进行中可中止 + 完成后手动关闭"，并修复前端进度事件发射节奏。

**具体需求：**

- 整体进度按 preparing 25%、downloading 65%、zipping 10% 计算
- 阶段文案合并为 Downloading and zipping
- 右侧并排显示 [中止/关闭链接] 与 [整体百分比 0-100%]（进行中显示 Abort，完成后显示 Dismiss）
- 完成后不自动消失，由用户手动 Dismiss
- 进度事件更新改为严格 1 秒节流，仅文件切换时允许即时刷新

---

## 实现步骤

### Phase 1: 进度模型与状态设计（阻塞后续步骤）

#### 1.1 在 `src/components/files.tsx` 定义整体进度映射规则

**更新 `getArchiveProgressBarValue()` 函数，实现加权进度计算：**

- `preparing` 阶段：占整体进度 0-25%
  - 公式：`0.25 * (processedFiles / totalFiles)`
- `downloading` 阶段：占整体进度 25-90%（预留 10% 给 zipping）
  - 公式：`0.25 + (0.65 * (downloadedBytes / totalBytes))`
- `zipping` 阶段：占整体进度 90-100%
  - 公式：`0.25 + 0.65 + (0.10 * (processedFiles / totalFiles))`
- `done` 阶段：固定 100%（返回 1）

#### 1.2 在 `src/components/files.tsx` 调整下载状态字段

**修改 `IDownloadProgress` 接口：**

```typescript
interface IDownloadProgress {
  phase: "idle" | "preparing" | "downloading" | "zipping" | "done" | "failed";
  isActive: boolean;
  backendProgress: IJobProgress | null;
  clientProgress: IArchiveClientProgress | null;
  isCompleted: boolean;
  errorMessage: string;
  shouldAutoHide: boolean; // ← 新增，控制是否自动消失（改为 false，由用户手动控制）
  abortHandler: (() => void) | null; // ← 新增，中止函数引用
  isAborted: boolean; // ← 新增，标记用户是否已中止
}
```

**调整 `startZipDownload()` 函数：**

- 移除完成后 4 秒的 `setTimeout` 自动重置逻辑
- 初始化 `shouldAutoHide: false`、`abortHandler: null`、`isAborted: false`

#### 1.3 在 `src/services/spembedded.ts` 增加中止支持机制

**修改 `downloadArchiveFromManifest()` 签名和实现：**

```typescript
async downloadArchiveFromManifest(
  manifest: IArchiveManifest,
  saveTarget: IArchiveSaveTarget,
  onProgress: (progress: IArchiveClientProgress) => void,
): Promise<() => void> {  // ← 返回中止函数
  // ... 实现细节见下方
}
```

**在函数内新增中止机制：**

- 添加 `shouldAbort` 标志（初始 false）
- 定义 `abort()` 函数，设置 `shouldAbort = true`、清理所有定时器、中止流资源、重置回调
- 在轮询循环（`downloadPollRef.setInterval`）检查 `shouldAbort`，如为 true 则 `clearInterval`
- 在流式下载循环检查 `shouldAbort`，如为 true 则 break 并触发清理
- 返回 `abort` 函数供组件调用

---

### Phase 2: UI 展示与交互改造（依赖 Phase 1）

#### 2.1 在 `src/components/files.tsx` 改造进度文案生成

**重写 `getArchiveProgressText()` 函数：**

- 合并 `downloading` 与 `zipping` 阶段文案为 `"Downloading and zipping"`
- 所有阶段的进度百分比需要基于整体进度计算（而非阶段内百分比）
- 文件名显示需截断：仅保留前 32 字符，超出部分用 `"..."` 代替

**示例输出：**

```
Preparing manifest: 3/10 (30%)
Downloading and zipping: [filename truncated to 32 chars]...
Downloading and zipping: [another file]...
```

#### 2.2 在 `src/components/files.tsx` 改造进度区布局

**修改进度区域的 JSX 结构（当前位置约 1376-1407 行）：**

布局改为：

```
[进度条]
左侧文案区                              右侧链接 + 百分比区
"Downloading and zipping: file..." | [Abort] 50%
```

**具体实现：**

- 左侧：使用 `<Text>` 显示 `getArchiveProgressText()` 输出（文件名截断到 32 字符 + `...`）
- 右侧：并排显示
  - **进行中**（`isActive=true`）：显示 `[Abort]` 链接
  - **完成**（`isCompleted=true`）：显示 `[Dismiss]` 链接
  - 在链接右侧显示整体百分比（0-100），格式为 `XX%`

**使用 Flexbox 布局：**

```typescript
display: "flex",
justifyContent: "space-between",
alignItems: "center"
```

#### 2.3 新增 Abort 链接交互

**在 `src/components/files.tsx` 中添加 `onAbortClick()` 函数：**

```typescript
const onAbortClick = () => {
  if (downloadProgress.abortHandler) {
    downloadProgress.abortHandler();
    setDownloadProgress((prev) => ({
      ...prev,
      isActive: false,
      isAborted: true,
      phase: "idle", // 或保留当前状态，之后消失
    }));
  }
};
```

**在进度区 JSX 中条件渲染 Abort 链接：**

```typescript
{downloadProgress.isActive && (
  <Link onClick={onAbortClick} style={{ cursor: "pointer" }}>
    Abort
  </Link>
)}
```

#### 2.4 新增 Dismiss 链接交互

**在 `src/components/files.tsx` 中添加 `onDismissClick()` 函数：**

```typescript
const onDismissClick = () => {
  setDownloadProgress({
    phase: "idle",
    isActive: false,
    backendProgress: null,
    clientProgress: null,
    isCompleted: false,
    errorMessage: "",
    shouldAutoHide: false,
    abortHandler: null,
    isAborted: false,
  });
};
```

**在进度区 JSX 中条件渲染 Dismiss 链接：**

```typescript
{downloadProgress.isCompleted && (
  <Link onClick={onDismissClick} style={{ cursor: "pointer" }}>
    Dismiss
  </Link>
)}
```

---

### Phase 3: 服务层节流修正与中止实现（可与 Phase 2 并行）

#### 3.1 在 `src/services/spembedded.ts` 重构 emitProgress/flushProgress 节流

**核心调整（位置约 440-500 行）：**

```typescript
const emitProgress = (
  stage: IArchiveClientProgress["stage"],
  currentItem: string,
  force = false,
) => {
  pendingProgress = {
    stage,
    totalFiles,
    processedFiles,
    totalBytes,
    downloadedBytes,
    zippedBytes,
    currentItem,
  };

  const now = Date.now();
  const itemChanged = currentItem !== lastCurrentItem;
  lastCurrentItem = currentItem;

  // 策略：强制或文件切换 → 立即发射并重置计时窗口
  if (force || itemChanged) {
    if (pendingProgressTimer) {
      clearTimeout(pendingProgressTimer);
      pendingProgressTimer = null;
    }
    flushProgress();
    return;
  }

  // 常规更新：检查是否已达到 1 秒间隔
  const elapsed = now - lastProgressEmitAt;
  if (elapsed >= PROGRESS_EMIT_INTERVAL_MS) {
    if (pendingProgressTimer) {
      clearTimeout(pendingProgressTimer);
      pendingProgressTimer = null;
    }
    flushProgress();
    return;
  }

  // 未达到间隔：设置延迟定时器
  if (!pendingProgressTimer) {
    pendingProgressTimer = setTimeout(() => {
      pendingProgressTimer = null;
      flushProgress();
    }, PROGRESS_EMIT_INTERVAL_MS - elapsed);
  }
};
```

**关键修改：**

- 明确 `itemChanged` 分支必须立即 flush 并清理 pending timer
- 每次 `flushProgress()` 会更新 `lastProgressEmitAt`，确保下一次计时从 0 开始
- 避免嵌套定时器或重复触发

#### 3.2 在 `src/services/spembedded.ts` 增加中止机制

**在 `downloadArchiveFromManifest()` 开头添加中止相关变量：**

```typescript
let shouldAbort = false;
const abort = () => {
  shouldAbort = true;
  // 清理定时器和流资源（详见下方）
};
```

**在轮询循环（约 520-570 行）检查中止：**

```typescript
downloadPollRef.current = setInterval(async () => {
  if (shouldAbort) {
    clearInterval(downloadPollRef.current!);
    downloadPollRef.current = null;
    return;
  }
  // ... 轮询逻辑
}, 800);
```

**在流式下载循环中检查中止：**

```typescript
for (const item of manifest.items) {
  if (shouldAbort) {
    break; // 立即停止循环
  }
  // ... 下载逻辑
}
```

**在 `abort()` 函数中补充 cleanup 逻辑：**

```typescript
const abort = () => {
  shouldAbort = true;
  // 清理轮询定时器
  if (downloadPollRef.current) {
    clearInterval(downloadPollRef.current);
    downloadPollRef.current = null;
  }
  // 中止进行中的流（response reader）
  // 清理所有 pending timer
  if (pendingProgressTimer) {
    clearTimeout(pendingProgressTimer);
    pendingProgressTimer = null;
  }
  // 关闭磁盘写入流（如果存在）
  if (writable) {
    writable.abort().catch((err) => console.error("Stream abort error:", err));
  }
};
```

**在函数末尾返回 abort 函数：**

```typescript
return abort;
```

#### 3.3 在 `src/components/files.tsx` 中捕获并保存 abort 函数

**在 `startZipDownload()` 中修改调用逻辑：**

```typescript
const abortFn = await spEmbedded.downloadArchiveFromManifest(
  manifest,
  finalSaveTarget,
  (clientProgress) => {
    setDownloadProgress((prev) => ({
      ...prev,
      // ... 其他字段
      abortHandler: abortFn, // ← 保存 abort 函数
    }));
  },
);

// 或在初始化后立即保存
setDownloadProgress((prev) => ({
  ...prev,
  abortHandler: abortFn,
}));
```

#### 3.4 在 `src/services/spembedded.ts` 保持 finally 中定时器清理一致性

**确保 finally 块包含所有必要的清理：**

```typescript
finally {
  // 清理 pending timer
  if (pendingProgressTimer) {
    clearTimeout(pendingProgressTimer);
    pendingProgressTimer = null;
  }
  // 确保 downloadPollRef 也被清理
  if (downloadPollRef.current) {
    clearInterval(downloadPollRef.current);
    downloadPollRef.current = null;
  }
}
```

---

### Phase 4: 联调与边界验证（依赖 Phase 2/3）

#### 4.1 验证阶段切换与进度推进

**测试用例：**

1. 启动下载，观察进度从 0% 开始
2. 准备阶段：进度在 0-25% 范围内推进，结束后应约为 25%
3. 下载开始：进度从 25% 继续推进至 90%
4. 压缩开始：进度从 90% 推进至 100%
5. 完成：进度条显示 100%

#### 4.2 验证节流节奏

**测试用例：**

1. 同一文件下载中，UI 进度条更新频率约为 1 次/秒
2. 切换到新文件时，进度条应立即刷新显示新文件名
3. 检查浏览器开发者工具网络面板，确认无无限频繁的 API 调用

#### 4.3 验证中止功能

**测试用例：**

1. 下载进行中点击 Abort 链接
2. 预期行为：
   - 下载立即停止（不再有新文件请求）
   - 进度区消失或显示中止状态
   - 浏览器网络面板无新请求
   - 后端无残留的流式下载连接

#### 4.4 验证完成态与关闭行为

**测试用例：**

1. 下载完成，进度条显示 100%，文案为 "Download Completed"
2. 等待 10+ 秒，进度条不应自动消失
3. 点击 Dismiss 链接后，进度区立即消失
4. 启动新下载任务，进度条恢复正常显示

#### 4.5 验证中止后新任务启动

**测试用例：**

1. 中止一个正在进行的下载
2. 立即启动新的下载任务
3. 预期：新任务状态清晰，无前一任务的干扰

---

## 相关文件

### 核心修改文件

- **[src/components/files.tsx](src/components/files.tsx)**

  - 调整 `IDownloadProgress` 接口（新增 `shouldAutoHide`, `abortHandler`, `isAborted`）
  - 重写 `getArchiveProgressBarValue()` 实现加权进度
  - 改造 `getArchiveProgressText()` 合并文案、截断文件名
  - 改造进度区 JSX 布局：左侧文案，右侧 [Abort/Dismiss] + 百分比
  - 新增 `onAbortClick()` 和 `onDismissClick()` 处理函数
  - 移除 `setTimeout(4000)` 自动隐藏逻辑
  - 在 `startZipDownload()` 中捕获并保存 abort 函数

- **[src/services/spembedded.ts](src/services/spembedded.ts)**
  - 重构 `emitProgress()` 和 `flushProgress()` 节流逻辑
  - 在 `downloadArchiveFromManifest()` 中实现 `shouldAbort` 标志和 `abort()` 函数
  - 在轮询循环和下载循环检查 `shouldAbort`
  - 在 `abort()` 中补充 cleanup（timer、流资源）
  - 修改返回类型为包含 abort 函数
  - 保持 finally 块 cleanup 一致性

### 可选补充文件

- **[src/common/types.ts](src/common/types.ts)**
  - 仅在需要时补充类型定义（预期本次可不改）

---

## 验收标准（Acceptance Criteria）

1. ✅ 整体进度按 25/65/10 权重正确映射，数值 0-100%
2. ✅ 进度文案为 "Downloading and zipping"，文件名截断到 32 字符加 "..."
3. ✅ 右侧并排显示 [Abort] + 百分比（进行中），[Dismiss] + 百分比（完成）
4. ✅ 进行中点击 Abort 后，下载立即停止，进度区消失，无残留网络请求
5. ✅ 完成后不自动消失，点击 Dismiss 才消失
6. ✅ UI 更新频率：同文件约 1 次/秒，文件切换时即时刷新
7. ✅ 中止后启动新下载，状态清理完全无干扰

---

## 备注

- 本计划范围内仅改前端页面层与前端服务层，不涉及后端 API 协议变更
- 中止功能中止的是前端的下载和压缩流程，后端的准备任务无需主动中断（轮询停止后会自然结束）
- 文件名截断逻辑采用简单的"前 32 字符 + ..."，若后续需要更智能的截断（如保留扩展名）可迭代改进
