declare module "*.css";

/**
 * 扩展 React 的 input 元素属性类型，添加 webkitdirectory 非标准属性。
 * 该属性允许 <input type="file"> 选择整个文件夹，
 * 是 W3C 标准扩展属性，主流浏览器均支持但 TypeScript 默认不包含。
 * 这里通过声明合并（Declaration Merging）安全地添加，避免使用 `as any`。
 */
declare namespace React {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
  }
}
