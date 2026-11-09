import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { Board, BoardError } from "./board.ts";

const writer = { kind: "bot" as const, botId: "b1", name: "Writer" };
const other = { kind: "bot" as const, botId: "b2", name: "Other" };

function fresh() {
  const file = join(mkdtempSync(join(tmpdir(), "board-")), "board.json");
  let clock = 1_000;
  return { file, board: new Board({ file, now: () => ++clock }) };
}

const refused = (run: () => unknown, status: number) => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BoardError);
    expect((error as BoardError).status).toBe(status);
    return (error as BoardError).message;
  }
  throw new Error("expected a refusal");
};

describe("Board", () => {
  it("keeps a person's task without progress and persists it", () => {
    const { file, board } = fresh();
    const task = board.add({ kind: "person" }, { title: "  Buy milk  " });
    expect(task).toMatchObject({ title: "Buy milk", status: "todo", revision: 1 });
    const done = board.editByPerson(task.id, { status: "done" });
    expect(done).toMatchObject({ status: "done", revision: 2 });
    expect(done.progress).toBeUndefined();
    expect(new Board({ file }).list()).toEqual([done]);
  });

  it("lets a bot claim, report progress and finish", () => {
    const { board } = fresh();
    const task = board.add({ kind: "person" }, { title: "Draft report" });
    expect(board.claim(task.id, writer)).toMatchObject({ status: "doing", progress: 0, owner: writer });
    expect(board.progress(task.id, "b1", { progress: 40, note: "2 of 5 sections" })).toMatchObject({ progress: 40, progressNote: "2 of 5 sections" });
    expect(board.complete(task.id, "b1", {})).toMatchObject({ status: "done", progress: 100 });
  });

  it("adds a claimed task for a bot in one step", () => {
    const { board } = fresh();
    expect(board.add(writer, { title: "Research" }, true)).toMatchObject({ status: "doing", owner: writer, createdBy: writer, progress: 0 });
  });

  it("refuses another bot's claim and progress", () => {
    const { board } = fresh();
    const task = board.add({ kind: "person" }, { title: "Draft" });
    board.claim(task.id, writer);
    expect(refused(() => board.claim(task.id, other), 409)).toContain("Writer");
    refused(() => board.progress(task.id, "b2", { progress: 10 }), 403);
    refused(() => board.complete(task.id, "b2", {}), 403);
  });

  it("refuses a stale revision", () => {
    const { board } = fresh();
    const task = board.add({ kind: "person" }, { title: "Draft" });
    board.editByPerson(task.id, { title: "Draft v2" });
    refused(() => board.claim(task.id, writer, 1), 409);
    expect(board.claim(task.id, writer, 2).revision).toBe(3);
  });

  it("drops claim and progress when the person moves a task back to todo", () => {
    const { board } = fresh();
    const task = board.add({ kind: "person" }, { title: "Draft" });
    board.claim(task.id, writer);
    board.progress(task.id, "b1", { progress: 60 });
    const back = board.editByPerson(task.id, { status: "todo" });
    expect(back.owner).toBeUndefined();
    expect(back.progress).toBeUndefined();
  });

  it.each([
    [{ progress: 101 }, 400],
    [{ progress: 1.5 }, 400],
    [{}, 400],
  ])("validates progress %j", (input, status) => {
    const { board } = fresh();
    const task = board.add(writer, { title: "x" }, true);
    refused(() => board.progress(task.id, "b1", input), status);
  });

  it("refuses an empty title and a done claim", () => {
    const { board } = fresh();
    refused(() => board.add({ kind: "person" }, { title: "  " }), 400);
    const task = board.add({ kind: "person" }, { title: "x" });
    board.editByPerson(task.id, { status: "done" });
    refused(() => board.claim(task.id, writer), 409);
  });

  it("never overwrites an unreadable file", () => {
    const { file } = fresh();
    writeFileSync(file, "{not json");
    const board = new Board({ file });
    board.add({ kind: "person" }, { title: "x" });
    expect(readFileSync(file, "utf8")).toBe("{not json");
  });
});

describe("board priority and manual moves", () => {
  it("defaults priority to medium and persists priority edits and cross-column moves", () => {
    const { file, board } = fresh();
    const task = board.add({ kind: "person" }, { title: "Plan" });
    expect(task.priority).toBe("medium");
    const doing = board.editByPerson(task.id, { status: "doing", priority: "high", revision: task.revision });
    expect(doing).toMatchObject({ status: "doing", priority: "high", owner: { kind: "person" } });
    const done = board.editByPerson(task.id, { status: "done", priority: "low", revision: doing.revision });
    expect(new Board({ file }).get(task.id)).toMatchObject({ status: "done", priority: "low" });
    expect(board.editByPerson(task.id, { status: "todo", revision: done.revision }).owner).toBeUndefined();
    refused(() => board.editByPerson(task.id, { priority: "high", revision: task.revision }), 409);
  });

  it.each(["high", "medium", "low"])("creates a %s priority item", (priority) => {
    const { board } = fresh();
    expect(board.add({ kind: "person" }, { title: "Plan", priority }).priority).toBe(priority);
  });

  it("rejects invalid priority when adding or editing", () => {
    const { board } = fresh();
    refused(() => board.add({ kind: "person" }, { title: "Plan", priority: "urgent" }), 400);
    const task = board.add({ kind: "person" }, { title: "Plan" });
    refused(() => board.editByPerson(task.id, { priority: 1 }), 400);
    expect(board.get(task.id)?.priority).toBe("medium");
  });
});
