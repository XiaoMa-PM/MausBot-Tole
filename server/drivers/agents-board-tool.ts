import type { ToolCallContext, ToolCallResult } from "./agents-call.ts";
import type { Json } from "./agents-client.ts";

export const BOARD_TOOL_NAMES: ReadonlySet<string> = new Set(["task_board"]);

export async function callBoardTool(args: Json, context: ToolCallContext): Promise<ToolCallResult> {
  const { ok, body } = await context.client.apiResponse("/api/internal/board", { method: "POST", body: JSON.stringify(args) });
  return ok ? { text: String(body.text ?? "") } : { text: String(body.error ?? "The board did not change. Try again shortly."), isError: true };
}

export const BOARD_TOOL_DEFINITIONS = [
  {
    name: "task_board",
    description:
      "The person's to-do board, shared with them in the sidebar. list: open items with ids. add: an item (claim true when you start it now). claim: take an item to work on. progress: report percent and a short note on an item you claimed. done: finish it. release: give it back. When you take on multi-step work for the person, add and claim it, report progress at milestones, and mark it done.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["list", "add", "claim", "progress", "done", "release"] },
        id: { type: "string", description: "Item id from list or add; all actions but list and add." },
        title: { type: "string", maxLength: 200, description: "add: the item in the person's words." },
        note: { type: "string", maxLength: 4000, description: "add: details. progress and done: one short line on where it stands." },
        claim: { type: "boolean", description: "add: claim it at once." },
        progress: { type: "integer", minimum: 0, maximum: 100, description: "progress: percent done." },
        revision: { type: "integer", description: "Optional: the revision you read; refused if the item changed since." },
        include_done: { type: "boolean", description: "list: also finished items." },
      },
      required: ["action"],
    },
  },
];
