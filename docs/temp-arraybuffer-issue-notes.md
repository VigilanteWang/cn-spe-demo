# 临时笔记：ArrayBuffer 类型问题复盘（待后续整理）

> 目的：记录近期 `Uint8Array` / `BlobPart` / `ArrayBufferLike` 相关的 TypeScript 类型问题，供后续统一整理到正式文档。

## 1. 问题现象

典型报错（语义）：

- `Uint8Array<ArrayBufferLike>` 不能赋给 `BlobPart`
- 原因链路会指向 `ArrayBufferLike` 不能赋给 `ArrayBuffer`

出现位置（本次）：

- 向 `writable.write(...)` 写入压缩块
- `new Blob(fallbackChunks, ...)` 构造回退下载对象

## 2. 关键类型概念

- `ArrayBuffer`：标准二进制缓冲区。
- `SharedArrayBuffer`：可跨线程共享的缓冲区。
- `ArrayBufferLike`：更宽的缓冲区概念，可能包含 `ArrayBuffer` 与 `SharedArrayBuffer`。
- `Uint8Array`：`ArrayBufferView` 的一种，表示“对底层缓冲区的字节视图”。
- `BufferSource`：`ArrayBuffer | ArrayBufferView`。

## 3. 为什么会触发类型冲突

- 某些库或上下文中，`Uint8Array` 的底层 buffer 可能被推断到更宽泛的 `ArrayBufferLike`。
- DOM 类型定义在部分 API 上要求更严格（偏向标准 `ArrayBuffer`）。
- 因此会出现“运行时常常可用，但 TypeScript 编译不通过”的情况。

## 4. 本次采用的修复策略

### 4.1 统一写入参数类型

将写入函数签名统一为：

- `write(data: BufferSource | Blob | string)`

目的：更贴近浏览器 `FileSystemWritableFileStream.write` 的语义。

### 4.2 显式转换为标准 ArrayBuffer

新增工具函数（示意）：

```ts
const toArrayBuffer = (chunk: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(chunk.byteLength);
  copy.set(chunk);
  return copy.buffer;
};
```

写入与回退路径都使用该转换。

## 5. 性能与内存取舍

- 该转换会增加一次按 chunk 的内存拷贝。
- 但主要内存风险通常在：
  - Blob 回退模式累计整个 ZIP
  - 非流式分支使用 `response.arrayBuffer()`
- 结论：这是“类型安全优先”的稳妥方案，代价可控但并非零成本。

## 6. 后续优化备忘

- 评估是否可在保证类型安全前提下减少一次拷贝。
- 对大文件场景增加阈值保护，避免 Blob 回退导致内存峰值过高。
- 增加下载取消与失败重试机制，提高长任务稳定性。
