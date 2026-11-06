import type { ServerResponse } from "node:http";

import type { BoardRunning, BoardSnapshot, BoardTask } from "../../shared/board.ts";
import type { json as sendJson } from "../harness/http.ts";
import { BoardError, type Board } from "../board.ts";
import type { HandoffView } from "../coordinator.ts";
import { PASS, type RouteHandler } from "./table.ts";

const BOARD = "/api/board";
const INTERNAL = "/api/internal/board";
const TITLE_MAX = 140;

export interface BoardBot { id: string; name: string; hidden?: boolean; tasks: readonly { threadId: string; title?: string; busy?: boolean }[] }

export interface BoardRouteDeps {
  board: Board;
  bots: () => readonly BoardBot[];
  handoffs: () => readonly HandoffView[];
  botVisible: (auth: Parameters<RouteHandler>[0]["auth"], botId: string) => boolean;
}

const firstLine = (value: string) => {
  const line = value.trim().split("\n").find((part) => part.trim())?.trim() ?? "";
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
};

const HANDOFF_STATE: Partial<Record<HandoffView["status"], BoardRunning["state"]>> = {
  queued: "queued", running: "running", waiting: "waiting", resume: "waiting",
};

/** Handed-on jobs first, then conversations mid-turn that no job already covers. */
export function runningWork(bots: readonly BoardBot[], handoffs: readonly HandoffView[]): BoardRunning[] {
  const named = new Map(bots.filter((bot) => !bot.hidden).map((bot) => [bot.id, bot]));
  const nodes = new Map(handoffs.map((handoff) => [handoff.id, handoff]));
  const covered = new Set<string>();
  const jobs = handoffs.flatMap((handoff): BoardRunning[] => {
    const state = HANDOFF_STATE[handoff.status], bot = named.get(handoff.botId);
    if (!state || !bot || handoff.mode === "notify") return [];
    covered.add(handoff.threadId);
    const from = handoff.parentId ? named.get(nodes.get(handoff.parentId)?.botId ?? "")?.name : undefined;
    return [{
      id: `handoff:${handoff.id}`, kind: "handoff", botId: bot.id, botName: bot.name, threadId: handoff.threadId,
      title: firstLine(handoff.text) || bot.name, state,
      ...(from && from !== bot.name ? { fromBotName: from } : {}),
      ...(handoff.startedAt ? { startedAt: handoff.startedAt } : {}),
      ...(handoff.lastProgressAt ? { lastProgressAt: handoff.lastProgressAt } : {}),
    }];
  });
  const turns = [...named.values()].flatMap((bot) => bot.tasks
    .filter((task) => task.busy === true && !covered.has(task.threadId))
    .map((task): BoardRunning => ({
      id: `thread:${task.threadId}`, kind: "thread", botId: bot.id, botName: bot.name, threadId: task.threadId,
      title: firstLine(task.title ?? "") || bot.name, state: "running",
    })));
  return [...jobs, ...turns];
}

const fail = (res: ServerResponse, json: typeof sendJson, error: unknown) => {
  if (error instanceof BoardError) return void json(res, error.status, { error: error.message });
  throw error;
};

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

export function createBoardRoutes(deps: BoardRouteDeps): RouteHandler {
  return async ({ method, path, res, json, readBody, req, auth }) => {
    if (path !== BOARD && !path.startsWith(`${BOARD}/`)) return PASS;
    try {
      if (path === BOARD && method === "GET") {
        const visible = (botId: string) => deps.botVisible(auth, botId);
        const snapshot: BoardSnapshot = {
          tasks: deps.board.list().filter((task) => [task.createdBy, task.owner].every((actor) => actor?.kind !== "bot" || visible(actor.botId))),
          running: runningWork(deps.bots(), deps.handoffs()).filter((work) => visible(work.botId)),
        };
        return void json(res, 200, snapshot);
      }
      if (path === BOARD && method === "POST") {
        const body = record(await readBody(req));
        return void json(res, 201, { task: deps.board.add({ kind: "person" }, body, body.mine === true) });
      }
      const id = path.slice(BOARD.length + 1);
      if (!/^[\w-]+$/.test(id)) return PASS;
      if (method === "PATCH") return void json(res, 200, { task: deps.board.editByPerson(id, record(await readBody(req))) });
      if (method === "DELETE") return deps.board.remove(id) ? void json(res, 200, { ok: true }) : void json(res, 404, { error: "No such task." });
      return PASS;
    } catch (error) {
      return fail(res, json, error);
    }
  };
}

export interface BoardInternalContext {
  method: string;
  path: string;
  res: ServerResponse;
  json: typeof sendJson;
  botId: string;
  threadId: string;
  readBody: () => Promise<unknown>;
}

const ACTIONS = ["list", "add", "claim", "progress", "done", "release"] as const;

const line = (task: BoardTask) => {
  const owner = task.owner ? ` · ${task.owner.kind === "bot" ? task.owner.name : "the person"}` : "";
  const progress = task.progress !== undefined && task.status === "doing" ? ` · ${task.progress}%${task.progressNote ? ` ${task.progressNote}` : ""}` : "";
  return `- [${task.status}] ${task.title} (id ${task.id}, revision ${task.revision})${owner}${progress}`;
};

export function createBoardInternalRoutes(deps: { board: Board; botName: (botId: string) => string | undefined }) {
  return async (ctx: BoardInternalContext): Promise<typeof PASS | void> => {
    const { res, json } = ctx;
    if (ctx.path !== INTERNAL || ctx.method !== "POST") return PASS;
    const body = record(await ctx.readBody());
    const action = ACTIONS.find((candidate) => candidate === (body.action ?? "list"));
    if (!action) return void json(res, 400, { error: `action is one of ${ACTIONS.join(", ")}, e.g. {"action": "list"}.` });
    const me = { kind: "bot" as const, botId: ctx.botId, name: deps.botName(ctx.botId) ?? "A bot", threadId: ctx.threadId };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (action !== "list" && action !== "add" && !id) return void json(res, 400, { error: `${action} needs id, e.g. {"action": "${action}", "id": "<id from list>"}.` });
    try {
      if (action === "list") {
        const open = deps.board.list().filter((task) => task.status !== "done" || body.include_done === true);
        return void json(res, 200, { text: open.length ? open.map(line).join("\n") : "The board is empty." });
      }
      const task = action === "add" ? deps.board.add(me, { title: body.title, note: body.note }, body.claim === true)
        : action === "claim" ? deps.board.claim(id, me, body.revision)
          : action === "progress" ? deps.board.progress(id, ctx.botId, { progress: body.progress, note: body.note, revision: body.revision })
            : action === "done" ? deps.board.complete(id, ctx.botId, { note: body.note, revision: body.revision })
              : deps.board.release(id, ctx.botId, body.revision);
      return void json(res, 200, { text: `Board updated; the person sees it now.\n${line(task)}` });
    } catch (error) {
      return fail(res, json, error);
    }
  };
}
