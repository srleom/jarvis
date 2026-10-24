# Jarvis

Monorepo: `orchestrator/` (Node server, runs locally behind ngrok), `web/` (Next.js dashboard on Vercel plus the Convex backend in `web/convex/`).

## Tooling

Prettier at the root (`.prettierrc.json`), ESLint per package. `orchestrator/` installs TypeScript 6 as `typescript` (typescript-eslint doesn't support 7 yet) and TypeScript 7 as `@typescript/native`; `tsc` is still 7.

## After making changes

Do these before you finish a task, not just the code edit.

1. **Check**: run `pnpm check` from the repo root (Prettier, typecheck, ESLint for `orchestrator/` and `web/`, including `web/convex/`). Fix every issue it reports; `pnpm fix` auto-applies formatting and safe lint fixes. Don't silence a rule or add `eslint-disable` to get it passing unless the rule is wrong for that code, and say so if you do.
2. **Commit** with a Conventional Commit message.
3. **Convex changes** (anything under `web/convex/`): deploy with `cd web && npx convex dev --once`. This pushes to the dev deployment in `web/.env.local`. Do not run `npx convex deploy` (prod) unless the user asks.
4. **Web changes** (anything under `web/` other than `web/convex/`, or Convex changes the web app depends on): push to `origin` so Vercel rebuilds. Pushing to `main` updates production. Ask before pushing if the user hasn't said to.
5. **Orchestrator changes** (`orchestrator/`): nothing deploys it. Tell the user to restart it.

Deploy Convex before pushing web code that calls new Convex functions, otherwise the live site breaks until the backend catches up.

In the final message, say which of these steps you did and which you left for the user.
