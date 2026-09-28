import { mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./auth";

/**
 * Per-user reset utilities. Only touch the calling user's rows — other
 * operators' data is never affected.
 */

type UserTable = "messages" | "timelineEvents" | "dashboard" | "todos" | "memoryFacts";

/** Tables holding conversation / demo state, safe to clear wholesale. */
const SESSION_TABLES: UserTable[] = [
  "messages",
  "timelineEvents",
  "dashboard",
  "todos",
  "memoryFacts",
];

async function clearTable(
  ctx: MutationCtx,
  table: UserTable,
  userId: Id<"users">
): Promise<number> {
  const rows = await ctx.db
    .query(table)
    .filter((q) => q.eq(q.field("userId"), userId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

/**
 * Put the service cards back to the untouched state. Rows are patched rather
 * than deleted so the cards keep rendering without waiting for a syncConnections
 * pass on the next page load.
 */
async function clearConnections(ctx: MutationCtx, userId: Id<"users">): Promise<number> {
  const rows = await ctx.db
    .query("connections")
    .withIndex("by_user_toolkit", (q) => q.eq("userId", userId))
    .collect();
  for (const row of rows) {
    await ctx.db.patch(row._id, {
      status: "available",
      connectedAccountId: undefined,
      authUrl: undefined,
      accountLabel: undefined,
      lastSync: undefined,
      error: undefined,
    });
  }
  return rows.length;
}

/**
 * Drop pending/complete OAuth state only, leaving the transcript, to-dos, and
 * memory intact. Use this to re-run the connection demo from a clean slate.
 */
export const connections = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return { connections: await clearConnections(ctx, userId) };
  },
});

/** Wipe the calling user's Jarvis state and restore first-run singletons. */
export const everything = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const cleared: Record<string, number> = {};
    for (const table of SESSION_TABLES) {
      cleared[table] = await clearTable(ctx, table, userId);
    }
    cleared.connections = await clearConnections(ctx, userId);

    const now = Date.now();
    const objective = await ctx.db
      .query("objective")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (objective) {
      await ctx.db.patch(objective._id, {
        text: "Standing by",
        state: "idle",
        updatedAt: now,
      });
    }
    const voice = await ctx.db
      .query("voiceState")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (voice) {
      await ctx.db.patch(voice._id, {
        orbState: "idle",
        sessionActive: false,
        updatedAt: now,
      });
    }
    await ctx.db.insert("timelineEvents", {
      userId,
      kind: "completed",
      label: "Bubloo core online",
      detail: "All systems nominal",
      createdAt: now,
    });

    return cleared;
  },
});
