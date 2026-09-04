# 🗺️ Roadmap

> **Languages**: English | [简体中文](./ROADMAP.md)
>
> This file aggregates all **planned / in-progress** features and refactors. Each entry links to a dedicated design document under `doc/` (covering requirements, approach, impact, and acceptance criteria).
>
> **Convention for agent appends**: copy the "Entry template" at the bottom and append a new row, keeping the table fields and status enum consistent with existing rows; fill the design-doc path when one exists, otherwise use `—`.

## Status enum

| Status | Meaning |
|--------|---------|
| 💡 Idea | Idea only, not yet designed |
| 🚧 Planned | Design complete (doc exists), awaiting implementation |
| 🔧 In Progress | Currently being implemented |
| ✅ Done | Completed (kept for record; can be archived in the "Done" section below) |

## Planned list

| Status | Entry | Design doc | Blocking decision / Notes |
|--------|-------|-----------|----------------------------|
| 🚧 Planned | MCP bridge: routing & authentication refactor | [doc/en/mcp-bridge-routing-auth.md](doc/en/mcp-bridge-routing-auth.md) | TBD: actual deployment is "single extension" vs "multiple browsers / multiple profiles", which decides the routing strategy (by profile / active tab / sticky ownership) |

## Done

(None yet)

---

### Entry template (for agent appends; copy and replace placeholders)

| 💡 Idea | <entry name> | <design doc path or `—`> | <blocking decision / notes> |
