import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { Board } from "../board.ts";
import type { HandoffView } from "../coordinator.ts";
import { createBoardInternalRoutes, runningWork, type BoardBot } from "./board.ts";

const handoff = (over: Partial<HandoffView>): HandoffView => ({
  id: "h1", rootId: "r", threadId: "t-job", botId: "b2", key: "k", text: "Summarise the Q3 numbers\nmore detail", createdAt: 1,
  status: "running", result: "", reported: false, executions: 1, approvalGranted: false, kind: "assignment", restarts: 0,
  mode: "work", reply: "resume", ...over,
});

const bots: BoardBot[] = [
  { id: "b1", name: "Chief", tasks: [{ threadId: "t-main", title: "Plan the launch", busy: true }] },
  { id: "b2", name: "Analyst", tasks: [{ threadId: "t-job", title: "job", busy: true }, { threadId: "t-idle", title: "idle", busy: false }] },
  { id: "b3", name: "Hidden", hidden: true, tasks: [{ threadId: "t-h", title: "secret", busy: true }] },
];

describe("runningWork", () => {
  it("lists handed-on jobs with who handed them, then busy conversations not already covered", () => {
    const source = handoff({ id: "src", botId: "b1", threadId: "t-main", status: "source" });
    const work = runningWork(bots, [source, handoff({ parentId: "src", lastProgressAt: 9 })]);
    expect(work).toEqual([
      { id: "handoff:h1", kind: "handoff", botId: "b2", botName: "Analyst", threadId: "t-job", title: "Summarise the Q3 numbers", state: "running", fromBotName: "Chief", lastProgressAt: 9 },
      { id: "thread:t-main", kind: "thread", botId: "b1", botName: "Chief", threadId: "t-main", title: "Plan the launch", state: "running" },
    ]);
  });

  it.each([["completed"], ["failed"], ["cancelled"], ["source"]] as const)("leaves out %s handoffs", (status) => {
    expect(runningWork([], [handoff({ status })])).toEqual([]);
  });

  it("leaves out one-way notices and hidden bots", () => {
    expect(runningWork(bots.slice(1), [handoff({ mode: "notify" })]).map((row) => row.id)).toEqual(["thread:t-job"]);
  });
});

describe("board internal route", () => {
  const call = async (board: Board, body: unknown, botId = "b1") => {
    const out: { status?: number; body?: Record<string, unknown> } = {};
    const route = createBoardInternalRoutes({ board, botName: (id) => (id === "b1" ? "Chief" : "Analyst") });
    await route({
      method: "POST", path: "/api/internal/board", res: {} as never, botId, threadId: "t1", readBody: async () => body,
      json: ((_res: unknown, status: number, payload: Record<string, unknown>) => { out.status = status; out.body = payload; }) as never,
    });
    return out;
  };

  it("adds, claims, reports and lists for the calling bot", async () => {
    const board = new Board({ file: join(mkdtempSync(join(tmpdir(), "board-")), "board.json") });
    expect((await call(board, { action: "add", title: "Write intro", claim: true })).status).toBe(200);
    const [task] = board.list();
    expect(task.owner).toEqual({ kind: "bot", botId: "b1", name: "Chief", threadId: "t1" });
    expect((await call(board, { action: "progress", id: task.id, progress: 50, note: "half" })).status).toBe(200);
    expect((await call(board, { action: "progress", id: task.id, progress: 60 }, "b2")).status).toBe(403);
    expect(String((await call(board, { action: "list" })).body?.text)).toContain("50% half");
  });

  it("explains a missing id and an unknown action", async () => {
    const board = new Board({ file: join(mkdtempSync(join(tmpdir(), "board-")), "board.json") });
    expect((await call(board, { action: "claim" })).body?.error).toContain('"id"');
    expect((await call(board, { action: "nuke" })).status).toBe(400);
  });
});
