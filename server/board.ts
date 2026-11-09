// INPUT: Validated board mutations and the persisted board file.
// OUTPUT: Revision-checked tasks with persisted status and priority.
// POS: Task board storage and ownership rules.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BOARD_LIMITS, BOARD_PRIORITIES, BOARD_STATUSES, type BoardPriority, type BoardActor, type BoardStatus, type BoardTask } from "../shared/board.ts";
import { OwnedFile } from "./atomic.ts";
import { DATA_DIR } from "./config.ts";
import { saveSoon } from "./save-batch.ts";

export class BoardError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface BoardEdit {
  title?: unknown;
  note?: unknown;
  status?: unknown;
  priority?: unknown;
  revision?: unknown;
}

const text = (value: unknown, field: string, max: number, required: boolean): string | undefined => {
  if (value === undefined || value === null) {
    if (required) throw new BoardError(400, `${field} is required, e.g. {"${field}": "Book the venue"}.`);
    return undefined;
  }
  const clean = typeof value === "string" ? value.trim() : "";
  if (required && !clean) throw new BoardError(400, `${field} must be non-empty text, e.g. {"${field}": "Book the venue"}.`);
  if (clean.length > max) throw new BoardError(400, `${field} is at most ${max} characters.`);
  return clean;
};

const statusOf = (value: unknown): BoardStatus | undefined => {
  if (value === undefined || value === null) return undefined;
  const status = BOARD_STATUSES.find((candidate) => candidate === value);
  if (!status) throw new BoardError(400, `status is one of ${BOARD_STATUSES.join(", ")}, e.g. {"status": "done"}.`);
  return status;
};

const priorityOf = (value: unknown): BoardPriority => {
  if (value === undefined) return "medium";
  const priority = BOARD_PRIORITIES.find((candidate) => candidate === value);
  if (!priority) throw new BoardError(400, `priority is one of ${BOARD_PRIORITIES.join(", ")}.`);
  return priority;
};

const sameBot = (actor: BoardActor | undefined, botId: string) => actor?.kind === "bot" && actor.botId === botId;

function loadTask(raw: unknown): BoardTask | null {
  if (!raw || typeof raw !== "object") return null;
  const task = raw as Partial<BoardTask>;
  if (typeof task.id !== "string" || typeof task.title !== "string" || !BOARD_STATUSES.includes(task.status as BoardStatus)) return null;
  if (typeof task.revision !== "number" || typeof task.createdAt !== "number" || typeof task.updatedAt !== "number") return null;
  return structuredClone({ ...task, priority: priorityOf(task.priority) } as BoardTask);
}

export class Board {
  private readonly file: string;
  private readonly disk: OwnedFile;
  private readonly now: () => number;
  private tasks: BoardTask[] = [];
  /** Saves are refused while unreadable, so an empty board never overwrites the file. */
  private unreadable = false;

  constructor(options: { file?: string; now?: () => number } = {}) {
    this.file = options.file ?? join(DATA_DIR, "board.json");
    this.disk = new OwnedFile(this.file, { mode: 0o600 });
    this.now = options.now ?? Date.now;
    try {
      const raw = readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw) as { tasks?: unknown };
      if (!Array.isArray(parsed?.tasks)) throw new Error("Invalid board file");
      this.disk.loaded(raw);
      this.tasks = parsed.tasks.flatMap((task) => loadTask(task) ?? []);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.unreadable = true;
        console.error(`board: ignoring unreadable ${this.file}: ${error instanceof SyntaxError ? "invalid JSON" : String((error as Error).message)}`);
      }
    }
  }

  list(): BoardTask[] {
    return this.tasks.map((task) => structuredClone(task));
  }

  get(id: string): BoardTask | undefined {
    const task = this.tasks.find((candidate) => candidate.id === id);
    return task && structuredClone(task);
  }

  add(by: BoardActor, input: { title?: unknown; note?: unknown; priority?: unknown }, claim = false): BoardTask {
    if (this.tasks.length >= BOARD_LIMITS.tasks) throw new BoardError(409, `The board holds at most ${BOARD_LIMITS.tasks} tasks. Delete finished ones first.`);
    const at = this.now();
    const note = text(input.note, "note", BOARD_LIMITS.note, false);
    const task: BoardTask = {
      id: randomUUID(),
      title: text(input.title, "title", BOARD_LIMITS.title, true)!,
      ...(note ? { note } : {}),
      status: claim ? "doing" : "todo",
      priority: priorityOf(input.priority),
      revision: 1,
      createdBy: by,
      ...(claim ? { owner: by, ...(by.kind === "bot" ? { progress: 0 } : {}) } : {}),
      createdAt: at,
      updatedAt: at,
    };
    this.tasks = [...this.tasks, task];
    this.save();
    return structuredClone(task);
  }

  /** The person may change anything; status "todo" also releases a claim. */
  editByPerson(id: string, edit: BoardEdit): BoardTask {
    return this.change(id, edit.revision, (task) => {
      const title = text(edit.title, "title", BOARD_LIMITS.title, false);
      const note = text(edit.note, "note", BOARD_LIMITS.note, false);
      const status = statusOf(edit.status);
      let next: BoardTask = { ...task, ...(title ? { title } : {}), ...(edit.priority !== undefined ? { priority: priorityOf(edit.priority) } : {}) };
      if (note !== undefined) next = note ? { ...next, note } : withoutKeys(next, "note");
      if (status && status !== task.status) next = moveTo(next, status, this.now(), { kind: "person" });
      return next;
    });
  }

  claim(id: string, bot: Extract<BoardActor, { kind: "bot" }>, revision?: unknown): BoardTask {
    return this.change(id, revision, (task) => {
      if (task.status === "done") throw new BoardError(409, "That task is done. Ask the person to reopen it first.");
      if (task.owner && !sameBot(task.owner, bot.botId)) {
        throw new BoardError(409, `Already claimed by ${task.owner.kind === "bot" ? task.owner.name : "the person"}.`);
      }
      return { ...task, status: "doing", owner: bot, progress: task.progress ?? 0 };
    });
  }

  progress(id: string, botId: string, input: { progress?: unknown; note?: unknown; revision?: unknown }): BoardTask {
    return this.change(id, input.revision, (task) => {
      this.mustOwn(task, botId);
      if (task.status !== "doing") throw new BoardError(409, "Only a task in progress takes progress.");
      const value = input.progress;
      if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100)) {
        throw new BoardError(400, 'progress is a whole number from 0 to 100, e.g. {"progress": 40}.');
      }
      const note = text(input.note, "note", BOARD_LIMITS.progressNote, false);
      if (value === undefined && note === undefined) throw new BoardError(400, 'Send progress, note or both, e.g. {"progress": 40, "note": "Drafted 2 of 5 sections"}.');
      return { ...task, ...(typeof value === "number" ? { progress: value } : {}), ...(note !== undefined ? { progressNote: note } : {}) };
    });
  }

  complete(id: string, botId: string, input: { note?: unknown; revision?: unknown }): BoardTask {
    return this.change(id, input.revision, (task) => {
      this.mustOwn(task, botId);
      const note = text(input.note, "note", BOARD_LIMITS.progressNote, false);
      return { ...moveTo(task, "done", this.now(), task.owner!), ...(note ? { progressNote: note } : {}) };
    });
  }

  release(id: string, botId: string, revision?: unknown): BoardTask {
    return this.change(id, revision, (task) => {
      this.mustOwn(task, botId);
      return moveTo(task, "todo", this.now(), task.owner!);
    });
  }

  remove(id: string): boolean {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((task) => task.id !== id);
    if (this.tasks.length === before) return false;
    this.save();
    return true;
  }

  private mustOwn(task: BoardTask, botId: string): void {
    if (!sameBot(task.owner, botId)) throw new BoardError(403, "Claim the task first: only the bot that claimed it reports on it.");
  }

  private change(id: string, revision: unknown, apply: (task: BoardTask) => BoardTask): BoardTask {
    const current = this.tasks.find((task) => task.id === id);
    if (!current) throw new BoardError(404, "No task on the board has that id. List the board for current ids.");
    if (revision !== undefined && revision !== null && revision !== current.revision) {
      throw new BoardError(409, `The task changed since you read it (revision ${current.revision} now). Read it again and retry.`);
    }
    const next: BoardTask = { ...apply(structuredClone(current)), revision: current.revision + 1, updatedAt: this.now() };
    this.tasks = this.tasks.map((task) => (task.id === id ? next : task));
    this.save();
    return structuredClone(next);
  }

  private save(): void {
    saveSoon(this, () => {
      if (this.unreadable) return;
      this.disk.write(`${JSON.stringify({ version: 1, tasks: this.tasks }, null, 2)}\n`);
    });
  }
}

function withoutKeys<K extends keyof BoardTask>(task: BoardTask, ...keys: K[]): BoardTask {
  const next = { ...task };
  for (const key of keys) delete next[key];
  return next;
}

function moveTo(task: BoardTask, status: BoardStatus, at: number, by: BoardActor): BoardTask {
  if (status === "todo") return { ...withoutKeys(task, "owner", "progress", "progressNote", "doneAt"), status };
  if (status === "doing") return { ...withoutKeys(task, "doneAt"), status, owner: task.owner ?? by };
  return { ...task, status, doneAt: at, ...(task.owner?.kind === "bot" ? { progress: 100 } : {}) };
}
