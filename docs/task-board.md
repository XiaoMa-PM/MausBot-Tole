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

## Upstream synchronization (2026-11-09)

The 0.1.150 synchronization keeps the board in the desktop tools, Simple mode tools and phone bar.
The internal board route remains behind the active turn capability check, alongside the upstream lending,
meetings and turn cancellation routes. Simple mode follows the upstream group order with Board between
Automations and Team map.

Against upstream `1d72099d5c05cdadcd01a579508e27dbb97afa26`, generated full catalog profiles add exactly
1,234 bytes for `task_board`; bridged profiles add 12 bytes for its discoverable name. Budget baselines
use measured profile sizes and retain the existing 2% limits.

An isolated fake-engine server passed board HTTP create, complete, reopen, list and delete checks.
Type checking and the production build passed (exit 0). The combined board, menu, lazy-screen,
catalog, proxy and outside-fence regression run passed 362 tests in eight files. Package identity and
signature acceptance remains pending.

## Dragging and priority (2026-11-09)

- Person-owned or unclaimed cards have a dedicated pointer drag handle. Mouse and touch dragging onto
  To do / In progress / Done sends the existing revision-checked PATCH; dropping outside a column or
  cancelling (including Escape) makes no write. Scrolling remains available outside the handle. State buttons remain usable.
- Bot-owned cards have no drag handle. Running-for-you rows remain derived from actual executions.
- Priority is high / medium / low, default medium. New-item and card selectors configure it; a visible label
  persists after refresh. Existing records with no priority read as medium. No sorting or filtering is added.
- API validates priority at add/edit boundaries. Tests cover defaults, three levels, invalid values, stale
  revision and reload persistence; interaction acceptance covers actual mouse and touch cross-column moves.
- Implementation: extend board wire/store, add priority controls and pointer handling, run focused tests,
  type/build checks and isolated interaction acceptance, then commit/push and rebuild the arm64 package.

### Current acceptance evidence

Storage/routes and initial renderer regressions passed 115 tests (including Escape cancellation) in five files. The isolated real renderer
saved a high-priority item, changed it to low and moved it across columns through DOM pointer sequences;
a page reload retained Done / low / revision 4. These sequences replaced pointer capture, so they do not
prove native mouse capture or physical touch gestures. The mounted browser has no lower-level mouse or
touch inputs; native gesture acceptance remains outstanding. Escape cancellation has a separate regression
case. Type checking passed (exit 0). Production build and the new candidate package remain pending. Native gestures require user acceptance.
