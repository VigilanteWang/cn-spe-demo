# AGENTS.md

This file provides shared instructions for any coding agent or developer tool working in this repository. It is intentionally tool-agnostic and complements the human-facing README files.

## Project Overview

- Project name: `spe-demo`
- Purpose: SharePoint Embedded demo for container and file management.
- Audience: junior developers, so readability and educational value matter.
- Stack:
  - Frontend: React 18 + TypeScript + Fluent UI v9 + Microsoft Graph Toolkit
  - Backend: Node.js + TypeScript + Restify
  - Auth: MSAL browser/node with Microsoft Graph and OBO flow

## Working Principles

- Keep changes small, targeted, and easy to review.
- Prefer fixing the root cause instead of adding superficial patches.
- Preserve the existing project structure and naming unless a change requires otherwise.
- Do not introduce `any`; keep TypeScript strict and explicit.
- When touching unfamiliar areas, read the nearest code and related tests first.

## Comment And Documentation Rules

- Write all newly added code comments in Simplified Chinese.
- Product names, library names, service names, and technical terms may remain in English.
- Do not delete existing comments in further changes. Only revise them when necessary or add new comments.
- Add standard JSDoc in Chinese for new exported functions, components, interfaces, and types.
- Add short Chinese comments above non-obvious logic, especially for API calls, auth flows, data transformation, error handling, and conditional branches.
- Keep explanations junior-developer friendly and focus on why the code exists, not only what it does.

## Frontend Conventions

- Use React 18 function components and Hooks.
- Prefer `@fluentui/react-components` for UI.
- Prefer `@microsoft/mgt-react` for Microsoft 365 integration when it fits; use `@microsoft/microsoft-graph-client` for custom Graph requests.
- Keep components readable and split reusable logic into hooks or utilities when duplication appears.

## Backend Conventions

- Follow RESTful patterns with Restify.
- Keep route registration, middleware, and handler logic reasonably separated.
- Wrap async flows in `try...catch` and log meaningful errors.
- For MSAL-related code, handle token caching and silent-acquisition fallback carefully.

## Validation

- Install dependencies: `npm install`
- Run frontend dev server: `npm run dev:frontend`
- Run backend dev server: `npm run dev:backend`
- Run backend debug mode: `npm run dev:backend:debug`
- Run full dev mode: `npm run dev`
- Run tests: `npm test -- --run`
- Build frontend: `npm run build:frontend`
- Build backend: `npm run build:backend`
- Build production bundle: `npm run build:prod`

Run the narrowest relevant validation after each substantive change. Prefer targeted tests first, then broader checks when needed.

## Key Paths

- Frontend app entry: `src/index.tsx`
- Main app shell: `src/App.tsx`
- File management UI: `src/components/files/`
- Backend entry: `server/index.ts`
- Auth logic: `server/auth.ts`
- SharePoint Embedded docs: `docs/spe/sharepoint-embedded-guide.md`

## Notes For Agents

- Root `AGENTS.md` applies to the whole repository.
- If a more specific `AGENTS.md` is added in a subdirectory, the nearest file should take precedence for that area.
- User instructions and direct task requirements override this file.
