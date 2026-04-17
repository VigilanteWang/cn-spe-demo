# GitHub Copilot Agent Instructions

You are assisting with the development of `spe-demo`, a SharePoint Embedded demonstration project. The project consists of a frontend (React + Fluent UI + Microsoft Graph Toolkit) and a backend (Node.js + Restify), fully written in TypeScript. The target audience includes junior developers, making code readability, educational value, and comprehensive documentation critical.
When generating code, providing suggestions, or explaining logic, you MUST strictly adhere to the following rules:

## 1. Language & Commenting Specifications (Core Requirement)

- **Mandatory Chinese Comments**: ALL generated code comments (including JSDoc and inline comments) MUST be written in Simplified Chinese. The ONLY exceptions are product names, library names, service names, or specific technical terms (e.g., React, Fluent UI, Restify, Microsoft Graph, API, Token), which must remain in English.
- **Junior Developer Friendly**: Code and explanations must be easy to understand. For slightly complex business logic, you must provide comments explaining "Why" and "What" is being done.
- **JSDoc Standards**: All newly created functions, components, interfaces, and types MUST include standard JSDoc comments. Specify `@param` and `@returns`, and briefly explain their purpose in Chinese.
- **Inline Comments for Key Logic**: When making API calls, transforming data, handling authentication (MSAL), or processing conditional branches, you must add single-line comments (`//`) in Chinese above the code.

## 2. Architecture & Tech Stack Alignment

- **Frontend (React)**:
  - Use React 18 functional components and Hooks (e.g., `useState`, `useEffect`, `useCallback`).
  - Prioritize `@fluentui/react-components` (Fluent UI v9) for UI construction, strictly following its official styling and layout best practices.
  - When handling Microsoft 365 data, prioritize `@microsoft/mgt-react` components; use `@microsoft/microsoft-graph-client` for custom requests.
- **Backend (Node.js + Restify)**:
  - Build RESTful APIs following best practices based on the `restify` framework.
  - Ensure middleware and route handler logic are separated to keep the code modular.
- **Authentication**:
  - Code involving `@azure/msal-browser` or `@azure/msal-node` must properly handle Token caching and fallback logic for silent acquisition failures.

## 3. Code Quality & Best Practices

- **Strict TypeScript**: The use of `any` type is strictly forbidden. Explicit `interface` or `type` must be defined. Write safe, defensive code leveraging TypeScript's strict mode (`strict: true`).
- **Error Handling**: Comprehensive `try...catch` blocks must be included for both frontend async requests and backend route controllers. When catching errors, explain the expected error scenario in the comments and log meaningful error messages.
- **Modern JavaScript**: Fully utilize ES6+ features such as destructuring, optional chaining (`?.`), and nullish coalescing (`??`) to keep code concise.
- **Modular & DRY**: Avoid duplicate code. If logic can be extracted into generic utility functions or custom Hooks, proactively separate them.

## 4. Example Code Style

Please refer to the following style when generating code:

```typescript
/**
 * 格式化并处理从 Microsoft Graph 获取的用户数据
 * @param {User[]} users - 从 Graph API 返回的原始用户列表
 * @param {string} filterDomain - 需要过滤的特定域名
 * @returns {FormattedUser[]} 处理后的标准化用户数组
 */
export const processGraphUsers = (
  users: User[],
  filterDomain: string,
): FormattedUser[] => {
  // 如果输入为空，则提前返回以避免后续解构报错
  if (!users || users.length === 0) {
    return [];
  }

  // 过滤出属于目标域名的用户，并提取必要字段
  return users
    .filter((user) => user.mail?.endsWith(`@${filterDomain}`))
    .map((user) => ({
      id: user.id ?? "unknown-id",
      displayName: user.displayName ?? "未命名用户",
      email: user.mail ?? "",
    }));
};
```
