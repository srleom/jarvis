# Jarvis

Monorepo: `orchestrator/` (Node server, runs locally behind ngrok), `web/` (Next.js dashboard on Vercel plus the Convex backend in `web/convex/`).

## Tooling

Prettier at the root (`.prettierrc.json`), ESLint per package. `orchestrator/` installs TypeScript 6 as `typescript` (typescript-eslint doesn't support 7 yet) and TypeScript 7 as `@typescript/native`; `tsc` is still 7.

## After making changes

Do these before you finish a task, not just the code edit.

1. **Format, lint, fix**: run `pnpm fix` from the repo root first (auto-applies Prettier formatting and safe ESLint fixes), then `pnpm check` (Prettier, typecheck, ESLint for `orchestrator/` and `web/`, including `web/convex/`). Fix every remaining issue by hand and re-run `pnpm check` until it passes clean. Don't silence a rule or add `eslint-disable` to get it passing unless the rule is wrong for that code, and say so if you do.
2. **Do not commit or push.** The user commits and pushes themselves. Leave changes uncommitted in the working tree.
3. **Convex changes** (anything under `web/convex/`): deploy with `cd web && npx convex dev --once`. This pushes to the dev deployment in `web/.env.local`. Do not run `npx convex deploy` (prod) unless the user asks.
4. **Orchestrator changes** (`orchestrator/`): nothing deploys it. Tell the user to restart it.

Convex has to be deployed before web code that calls new Convex functions goes live, otherwise the live site breaks until the backend catches up. Remind the user of this order when both changed.

In the final message, say which of these steps you did and which you left for the user.
