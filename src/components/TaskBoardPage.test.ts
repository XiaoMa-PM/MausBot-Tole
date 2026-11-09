// @vitest-environment happy-dom
// INPUT: Synthetic board snapshots and pointer events.
// OUTPUT: Task board interaction regression checks.
// POS: Renderer acceptance for manual moves and priority controls.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardSnapshot } from "../../shared/board";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/state/store", () => ({ api, openThread: vi.fn(), useStore: () => ({ state: {}, dispatch: vi.fn() }) }));
vi.mock("@/lib/thread-preferences", () => ({ useShowThreads: () => true }));
vi.mock("@/components/DesktopCapabilities", () => ({ useCaptionChrome: () => ({ dragProps: {} }) }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
import { TaskBoardPage } from "./TaskBoardPage";

let root: Root;
let host: HTMLDivElement;
let snapshot: BoardSnapshot;

beforeEach(async () => {
  snapshot = { running: [], tasks: [{ id: "one", title: "Plan", status: "todo", priority: "medium", revision: 1, createdBy: { kind: "person" }, createdAt: 1, updatedAt: 1 }] };
  api.mockReset().mockImplementation(async () => structuredClone(snapshot));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(TaskBoardPage)));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const pointer = (target: Element, type: string, pointerType = "mouse", x = 0, y = 0) => {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType, button: 0, clientX: x, clientY: y }));
};
const handle = () => host.querySelector<HTMLButtonElement>('[aria-label="board.task.drag"]')!;
const target = () => host.querySelector('[data-board-column="doing"]')!;

function prepareDrag() {
  handle().setPointerCapture = vi.fn();
  vi.spyOn(document, "elementFromPoint").mockReturnValue(target());
}

describe("task board interactions", () => {
  it.each(["mouse", "touch"])("moves a manual card using %s pointer events with its revision", async (kind) => {
    prepareDrag();
    await act(async () => {
      pointer(handle(), "pointerdown", kind);
      pointer(handle(), "pointermove", kind, 100, 100);
      pointer(handle(), "pointerup", kind, 100, 100);
    });
    const write = api.mock.calls.find(([, options]) => options?.method === "PATCH");
    expect(write?.[0]).toBe("/api/board/one");
    expect(JSON.parse(write?.[1].body)).toEqual({ status: "doing", revision: 1 });
  });

  it.each(["pointercancel", "outside", "click", "escape"])("does not move on %s", async (kind) => {
    prepareDrag();
    if (kind === "outside") vi.mocked(document.elementFromPoint).mockReturnValue(null);
    await act(async () => {
      pointer(handle(), "pointerdown");
      if (kind === "escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      pointer(handle(), kind === "pointercancel" ? "pointercancel" : "pointerup", "touch", kind === "click" ? 0 : 100, kind === "click" ? 0 : 100);
    });
    expect(api.mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(0);
  });

  it("saves a card priority without moving it", async () => {
    const select = host.querySelectorAll("select")[1]!;
    await act(async () => { select.value = "high"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    const write = api.mock.calls.find(([, options]) => options?.method === "PATCH");
    expect(JSON.parse(write?.[1].body)).toEqual({ priority: "high", revision: 1 });
  });

  it("does not give bot-owned cards a drag handle", async () => {
    snapshot.tasks = [{ ...snapshot.tasks[0]!, owner: { kind: "bot", botId: "bot", name: "Worker" } }];
    act(() => root.unmount()); root = createRoot(host);
    await act(async () => root.render(createElement(TaskBoardPage)));
    expect(handle()).toBeNull();
  });
});
