# AGENTS.md

This file provides shared instructions for any coding agent or developer tool working in this repository. It is intentionally tool-agnostic and complements the human-facing README files.

## Project Overview

- Project name: `cn-spe-demo`
- Purpose: SharePoint Embedded demo for container, file, container-permission, and item-permission management.
- Audience: junior developers, so readability, traceability, and educational value matter.
- Current stack:
  - Frontend: React 18 + TypeScript + Vite + Fluent UI v9 + Microsoft Graph Toolkit
  - Backend: Node.js + TypeScript + Restify
  - Auth: MSAL browser/node with Microsoft Graph and OBO flow
  - Quality: ESLint flat config + Prettier + Vitest

## Current Architecture Snapshot

- The frontend is feature-oriented:
  - `src/components/containers/` for container list/create flows
  - `src/components/files/` for file browsing, upload, preview, delete, and archive download UX
  - `src/components/permissions/` for permission dialog state, diffing, and principal search
- The backend is split by responsibility:
  - `server/index.ts` is the composition root and route registry
  - `server/common/` contains shared backend error and scope utilities
  - `server/containerPermissions/` handles container-level permission reads and writes
  - `server/itemPermissions/` handles item-level permission reads and writes
  - `server/permissionsCore/` contains permission-shared Graph readers and identity adapters
  - `server/download/` and `server/downloadHandlers.ts` support archive download preparation
- Shared HTTP contracts live in `common/contracts/`. Frontend and backend should both depend on these contracts instead of redefining payload shapes locally.

## Source Of Truth Rules

- Prefer the live code over older docs when they disagree.
- For runtime and tooling behavior, trust these files first:
  - `package.json` for scripts
  - `eslint.config.mjs` for lint scope and ignores
  - `server/index.ts` for actual API routes and route-level conventions
  - `common/contracts/` for cross-layer request/response shapes
  - nearest feature README, tests, and implementation files for local design intent
- Do not assume older README text is still accurate. For example, the repo now uses Vite and Vitest, not CRA-era tooling.

## Working Principles

- Keep changes small, targeted, and easy to review.
- Prefer fixing the root cause instead of adding superficial patches.
- Preserve the existing project structure and naming unless a change requires otherwise.
- Do not introduce `any`; keep TypeScript strict and explicit.
- When touching unfamiliar areas, read the nearest code and related tests first.
- Keep route/controller code thin. Push parsing, mapping, and Graph-specific logic into the existing feature modules.
- Reuse existing shared contracts, adapters, readers, and diff utilities before adding new abstractions.
- Do not manually edit generated outputs such as `build/` or `server/dist/` unless the task explicitly requires generated artifacts.
- Temporary probes or validation helpers belong under `temp/` or docs temp areas, not mixed into runtime modules.

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
- Keep components readable and extract reusable logic into hooks or utilities when duplication appears.
- Prefer following the existing feature structure instead of introducing a new abstraction layer too early.
- Keep frontend responsibilities focused on UI, local interaction state, and client-side data shaping.
- When a flow already depends on backend OBO, server-side normalization, or stable backend error mapping, prefer keeping that responsibility on the backend.

## Backend Conventions

- Follow RESTful patterns with Restify.
- Keep route registration, middleware, and handler logic reasonably separated.
- Use the existing unified error flow and keep API error shapes stable for the frontend.
- Respect the current Restify async handler style; do not introduce mixed async/callback handler signatures.
- For MSAL-related code, handle token caching and silent-acquisition fallback carefully.
- Keep Graph payload narrowing, identity extraction, and role mapping close to the backend boundary instead of leaking raw Graph shapes across layers.
- Prefer extending existing modules and shared helpers before creating parallel implementations.

## Validation

- Install dependencies: `npm install`
- Run frontend dev server: `npm run dev:frontend`
- Run backend dev server: `npm run dev:backend`
- Run backend debug mode: `npm run dev:backend:debug`
- Run full dev mode: `npm run dev`
- Run lint: `npm run lint`
- Auto-fix lint issues: `npm run lint:fix`
- Run tests: `npm test -- --run`
- Build frontend: `npm run build:frontend`
- Build backend: `npm run build:backend`
- Build production bundle: `npm run build:prod`

Validation guidance:

- Run the narrowest relevant validation after each substantive change.
- Prefer targeted Vitest runs first when you are changing one module, then broader checks when needed.
- Use the repo scripts for linting. Do not replace them with broad `eslint .` sweeps; this repo intentionally scopes lint targets through `eslint.config.mjs` and `package.json`.
- If you change shared contracts, permission mapping, or route behavior, at least run the relevant tests plus `npm run lint`.

## Key Paths

- Frontend app entry: `src/index.tsx`
- Main app shell: `src/App.tsx`
- Main containers page: `src/components/containers/index.tsx`
- File management UI: `src/components/files/`
- Permission UI: `src/components/permissions/`
- Shared frontend service wrappers: `src/services/`
- Shared cross-layer contracts: `common/contracts/`
- Backend entry: `server/index.ts`
- Unified backend error handling: `server/common/errorResponse.ts`
- Container permission backend: `server/containerPermissions/`
- Item permission backend: `server/itemPermissions/`
- Permission-shared backend helpers: `server/permissionsCore/`
- Auth logic: `server/auth.ts`
- SharePoint Embedded docs: `docs/spe/sharepoint-embedded-guide.md`

## Notes For Agents

- Root `AGENTS.md` applies to the whole repository.
- If a more specific `AGENTS.md` is added in a subdirectory, the nearest file should take precedence for that area.
- User instructions and direct task requirements override this file.
