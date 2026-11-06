# Task board

A to-do board in the sidebar's Tools, shared by the person and their bots.

## What the person sees

- **Running for you**: every handed-on job that is queued, running or waiting (from the coordinator), then every
  conversation mid-turn that no job already covers. Each row names the bot, and the bot that handed the job on;
  a click opens its thread. Polled every 3 seconds, like the Team map.
- **To do / In progress / Done**: the board's tasks. A bot's task shows the bot that claimed it, a progress bar and
  its latest progress line. A person's task has none of that: add, rename, tick done, reopen, delete.

## How bots maintain it

One agents tool, `task_board`, with `action`:

| action | who | effect |
|---|---|---|
| `list` | any bot | open tasks (`include_done` for finished ones), each with id and revision |
| `add` | any bot | a new task; `claim: true` starts it at 0% owned by the caller |
| `claim` | any bot | takes a task; refused when done or owned by someone else |
| `progress` | owner only | whole-number percent 0–100 and/or a short note |
| `done` | owner only | finished, 100% |
| `release` | owner only | back to To do, progress cleared |

Any action takes an optional `revision`; a stale one is refused (409), so two writers never overwrite each other.
The person may change anything; moving a task back to To do drops its claim and progress.

## Storage and wire

- `~/.openmausbot/board.json` (mode 0600), at most 500 tasks. An unreadable file is never overwritten.
- Person routes: `GET /api/board` (tasks + running), `POST /api/board`, `PATCH /api/board/:id`, `DELETE /api/board/:id`.
  Tasks and running work of bots the viewer cannot see are left out.
- Bot route: `POST /api/internal/board`, allowed outside the fence; the caller is the turn's own bot and thread.

## Code

`shared/board.ts` (types), `server/board.ts` (store and rules), `server/routes/board.ts` (routes, running work),
`server/drivers/agents-board-tool.ts` (the tool), `src/components/TaskBoardPage.tsx` (the page).
