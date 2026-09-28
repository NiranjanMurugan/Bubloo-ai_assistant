import { mutation } from "./_generated/server";
import { requireUser } from "./auth";

/** Idempotent per-user bootstrap: make sure singleton rows exist. */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const objective = await ctx.db
      .query("objective")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!objective) {
      await ctx.db.insert("objective", {
        userId,
        text: "Standing by",
        state: "idle",
        updatedAt: Date.now(),
      });
    }
    const voice = await ctx.db
      .query("voiceState")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!voice) {
      await ctx.db.insert("voiceState", {
        userId,
        orbState: "idle",
        sessionActive: false,
        updatedAt: Date.now(),
      });
    }
    const events = await ctx.db
      .query("timelineEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!events) {
      await ctx.db.insert("timelineEvents", {
        userId,
        kind: "completed",
        label: "Bubloo core online",
        detail: "All systems nominal",
        createdAt: Date.now(),
      });
    }
  },
});
