"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { getComposio, SERVICES } from "./composio";
import { requireUser } from "./auth";

type ToolResult = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Response shaping helpers                                            */
/* ------------------------------------------------------------------ */

// Composio returns loosely-typed data; extract what we can defensively.
/* eslint-disable @typescript-eslint/no-explicit-any */

export function shapeEmails(data: any): {
  count: number;
  emails: { subject: string; from: string; snippet: string; date?: string }[];
} {
  const messages: any[] = data?.messages ?? data?.items ?? (Array.isArray(data) ? data : []);
  const emails = messages.slice(0, 12).map((m: any) => ({
    subject: m.subject ?? m.payload?.subject ?? "(no subject)",
    from: m.sender ?? m.from ?? m.payload?.from ?? "unknown",
    snippet: (m.preview?.body ?? m.snippet ?? m.messageText ?? "").slice(0, 140),
    date: m.messageTimestamp ?? m.date ?? undefined,
  }));
  return { count: messages.length, emails };
}

export function shapeEvents(data: any): {
  count: number;
  events: { title: string; start?: string; end?: string; location?: string; link?: string }[];
} {
  const items: any[] = data?.items ?? data?.events ?? (Array.isArray(data) ? data : []);
  const events = items.slice(0, 12).map((e: any) => ({
    title: e.summary ?? e.title ?? "(untitled)",
    start: e.start?.dateTime ?? e.start?.date ?? e.start ?? undefined,
    end: e.end?.dateTime ?? e.end?.date ?? e.end ?? undefined,
    location: e.location ?? undefined,
    link: e.htmlLink ?? undefined,
  }));
  return { count: items.length, events };
}

export function shapeNotes(data: any): {
  count: number;
  notes: { id?: string; title: string; url?: string; lastEdited?: string; isDatabase?: boolean }[];
} {
  const results: any[] = data?.results ?? data?.items ?? (Array.isArray(data) ? data : []);
  const notes = results.slice(0, 10).map((r: any) => {
    const titleProp =
      r.properties?.title?.title ?? r.properties?.Name?.title ?? r.title ?? [];
    const title = Array.isArray(titleProp)
      ? titleProp.map((t: any) => t.plain_text ?? "").join("") || "(untitled)"
      : String(titleProp ?? "(untitled)");
    return {
      id: r.id ?? undefined,
      title,
      url: r.url ?? undefined,
      lastEdited: r.last_edited_time ?? undefined,
      isDatabase: r.object === "database" || undefined,
    };
  });
  return { count: results.length, notes };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export const execute = action({
  args: {
    name: v.string(),
    arguments: v.any(),
  },
  handler: async (ctx, { name, arguments: rawArgs }): Promise<ToolResult> => {
    const userId = await requireUser(ctx);
    const args = (rawArgs ?? {}) as any;
    const log = (kind: string, label: string, detail?: string) =>
      ctx.runMutation(api.timeline.log, { kind, label, detail });
    const setObjective = (text: string, state: "idle" | "working" | "waiting_auth" = "working") =>
      ctx.runMutation(api.objective.set, { text, state });

    await log("tool_selected", "Tool selected", name.replace(/_/g, " "));

    const requireConnection = async (toolkit: string): Promise<ToolResult | null> => {
      const connections = await ctx.runQuery(api.connections.list, {});
      const conn = connections.find((c) => c.toolkit === toolkit);
      if (conn?.status === "connected") return null;
      const svc = SERVICES[toolkit];
      return {
        error: "not_connected",
        message: `${svc?.name ?? toolkit} is not connected yet. Offer to connect it — the user just needs to say "connect my ${svc?.name ?? toolkit}".`,
      };
    };

    const finish = async (result: ToolResult, objectiveDone = "Standing by") => {
      await log("results", "Results retrieved", name.replace(/_/g, " "));
      await setObjective(objectiveDone, "idle");
      return result;
    };

    try {
      switch (name) {
        /* ---------------- memory ---------------- */
        case "remember": {
          await setObjective("Updating memory");
          const { updated } = await ctx.runMutation(api.memory.remember, {
            category: args.category ?? "fact",
            key: String(args.key ?? "").trim() || "note",
            value: String(args.value ?? ""),
            source: "conversation",
          });
          await log("memory_updated", updated ? "Memory updated" : "Memory saved", `${args.key}: ${args.value}`);
          return finish({ ok: true, action: updated ? "updated" : "saved" });
        }

        case "recall": {
          await setObjective("Recalling memory");
          const facts = await ctx.runQuery(api.memory.list, {});
          const shaped = facts.map((f) => ({ category: f.category, key: f.key, value: f.value }));
          return finish({ facts: shaped, count: shaped.length });
        }

        case "forget": {
          await setObjective("Updating memory");
          const { forgotten } = await ctx.runMutation(api.memory.forget, {
            key: String(args.key ?? ""),
          });
          await log("memory_updated", forgotten ? "Memory removed" : "Nothing to forget", args.key);
          return finish({ ok: forgotten });
        }

        /* ---------------- todos (native, Convex-backed) ---------------- */
        case "add_todo": {
          await setObjective("Adding to-do");
          const dueAt = parseDueDate(args.due_date);
          const res = await ctx.runMutation(api.todos.add, {
            title: String(args.title ?? "Untitled to-do"),
            priority: normalizePriority(args.priority),
            dueAt,
            notes: args.notes ? String(args.notes) : undefined,
          });
          await log("completed", "To-do added", String(args.title));
          return finish({ ok: true, id: res.id, title: args.title, dueAt });
        }

        case "complete_todo": {
          await setObjective("Updating to-dos");
          const res = await ctx.runMutation(api.todos.complete, {
            title: String(args.title ?? ""),
          });
          if (res.ok) await log("completed", "To-do completed", res.title);
          return finish(res);
        }

        case "update_todo": {
          await setObjective("Updating to-dos");
          const res = await ctx.runMutation(api.todos.update, {
            title: String(args.title ?? ""),
            newTitle: args.new_title ? String(args.new_title) : undefined,
            priority: args.priority ? normalizePriority(args.priority) : undefined,
            dueAt: parseDueDate(args.due_date),
            notes: args.notes ? String(args.notes) : undefined,
            reopen: args.reopen === true,
          });
          if (res.ok) await log("completed", "To-do updated", res.title);
          return finish(res);
        }

        case "delete_todo": {
          await setObjective("Updating to-dos");
          const res = await ctx.runMutation(api.todos.remove, {
            title: String(args.title ?? ""),
          });
          if (res.ok) await log("completed", "To-do removed", res.title);
          return finish(res);
        }

        case "list_todos": {
          await setObjective("Reviewing to-dos");
          const { pending, done } = await ctx.runQuery(api.todos.list, {});
          return finish({
            pending: pending.map((t) => ({
              title: t.title,
              priority: t.priority,
              due: t.dueAt ? new Date(t.dueAt).toISOString() : undefined,
              notes: t.notes,
            })),
            recentlyDone: done.slice(0, 5).map((t) => t.title),
          });
        }

        /* ---------------- services ---------------- */
        case "list_services": {
          const connections = await ctx.runQuery(api.connections.list, {});
          return finish({
            services: Object.entries(SERVICES).map(([slug, svc]) => ({
              service: svc.name,
              slug,
              description: svc.description,
              status: connections.find((c) => c.toolkit === slug)?.status ?? "available",
            })),
          });
        }

        case "connect_service": {
          const slug = resolveServiceSlug(String(args.service ?? ""));
          if (!slug) {
            return {
              error: "unknown_service",
              message: `I can connect: ${Object.values(SERVICES).map((s) => s.name).join(", ")}.`,
            };
          }
          const res: any = await ctx.runAction(api.composio.initiateConnection, { toolkit: slug });
          if (!res.ok) return { error: "connection_failed", message: res.error };
          return {
            ok: true,
            status: "pending_auth",
            message: `An authentication window is opening for ${res.service}. Tell the user to complete sign-in there; you'll be notified when it succeeds.`,
          };
        }

        /* ---------------- gmail ---------------- */
        case "get_emails": {
          const blocked = await requireConnection("gmail");
          if (blocked) return blocked;
          await setObjective("Reading inbox");
          await log("executing", "Executing action", "Fetching Gmail messages");
          const composio = getComposio();
          const result = await composio.tools.execute("GMAIL_FETCH_EMAILS", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: {
              query: args.query ?? "is:unread",
              max_results: args.max_results ?? 10,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const shaped = shapeEmails(result.data);
          await ctx.runMutation(api.dashboard.setCard, {
            key: "emails",
            data: {
              unread: shaped.count,
              important: shaped.emails.slice(0, 4),
              lastSync: Date.now(),
            },
          });
          await ctx.runMutation(api.connections.touchSync, { toolkit: "gmail" });
          return finish(shaped);
        }

        case "send_email": {
          const blocked = await requireConnection("gmail");
          if (blocked) return blocked;
          const to = String(args.to ?? "").trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            return {
              error: "invalid_recipient",
              message: `"${to}" doesn't look like a valid email address. Ask the user to spell it out.`,
            };
          }
          await setObjective("Sending email");
          await log("executing", "Executing action", `Sending email to ${to}`);
          const composio = getComposio();
          const result = await composio.tools.execute("GMAIL_SEND_EMAIL", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: {
              recipient_email: to,
              subject: args.subject ?? "",
              body: args.body ?? "",
              cc: args.cc ?? undefined,
              is_html: false,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          await log("completed", "Email sent", `To ${to}: "${String(args.subject ?? "").slice(0, 60)}"`);
          await ctx.runMutation(api.connections.touchSync, { toolkit: "gmail" });
          return finish({ ok: true, to, subject: args.subject });
        }

        /* ---------------- calendar ---------------- */
        case "get_calendar_events": {
          const blocked = await requireConnection("googlecalendar");
          if (blocked) return blocked;
          await setObjective("Scanning calendar");
          await log("executing", "Executing action", "Listing calendar events");
          const composio = getComposio();
          const now = new Date();
          const endOfDay = new Date(now);
          endOfDay.setHours(23, 59, 59, 999);
          const result = await composio.tools.execute("GOOGLECALENDAR_EVENTS_LIST", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: {
              calendar_id: "primary",
              time_min: args.time_min ?? now.toISOString(),
              time_max: args.time_max ?? endOfDay.toISOString(),
              single_events: true,
              order_by: "startTime",
              max_results: args.max_results ?? 15,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const shaped = shapeEvents(result.data);
          await ctx.runMutation(api.dashboard.setCard, {
            key: "calendar",
            data: {
              todayCount: shaped.count,
              nextMeeting: shaped.events[0] ?? null,
              upcoming: shaped.events.slice(0, 5),
              lastSync: Date.now(),
            },
          });
          await ctx.runMutation(api.connections.touchSync, { toolkit: "googlecalendar" });
          return finish(shaped);
        }

        case "create_calendar_event": {
          const blocked = await requireConnection("googlecalendar");
          if (blocked) return blocked;
          await setObjective("Creating calendar event");
          await log("executing", "Executing action", `Creating "${args.summary}"`);
          const composio = getComposio();
          const durationMinutes = Number(args.duration_minutes ?? 30);
          const result = await composio.tools.execute("GOOGLECALENDAR_CREATE_EVENT", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: {
              summary: args.summary ?? "New event",
              description: args.description ?? "Created by Bubloo",
              start_datetime: args.start_datetime,
              event_duration_hour: Math.floor(durationMinutes / 60),
              event_duration_minutes: durationMinutes % 60,
              timezone: args.timezone ?? "UTC",
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          await log("completed", "Task completed", `Event "${args.summary}" created`);
          const data: any = result.data;
          return finish(
            {
              ok: true,
              title: args.summary,
              link: data?.htmlLink ?? data?.response_data?.htmlLink ?? undefined,
            },
            "Standing by"
          );
        }

        /* ---------------- notion ---------------- */
        case "search_notes": {
          const blocked = await requireConnection("notion");
          if (blocked) return blocked;
          await setObjective("Searching notes");
          await log("executing", "Executing action", `Searching Notion for "${args.query ?? ""}"`);
          const composio = getComposio();
          const result = await composio.tools.execute("NOTION_SEARCH_NOTION_PAGE", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: {
              query: args.query ?? "",
              page_size: args.max_results ?? 8,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const shaped = shapeNotes(result.data);
          await ctx.runMutation(api.dashboard.setCard, {
            key: "notes",
            data: {
              recent: shaped.notes.slice(0, 5),
              sources: ["Notion"],
              lastSync: Date.now(),
            },
          });
          await ctx.runMutation(api.connections.touchSync, { toolkit: "notion" });
          return finish(shaped);
        }

        case "read_note": {
          const blocked = await requireConnection("notion");
          if (blocked) return blocked;
          await setObjective("Reading note");
          const composio = getComposio();

          let pageId: string | undefined = args.page_id ? String(args.page_id) : undefined;
          let title: string | undefined = args.title ? String(args.title) : undefined;

          // No id given: resolve via search first.
          if (!pageId) {
            await log("executing", "Executing action", `Locating "${args.query ?? ""}" in Notion`);
            const search = await composio.tools.execute("NOTION_SEARCH_NOTION_PAGE", {
              userId: String(userId),
              dangerouslySkipVersionCheck: true,
              arguments: { query: args.query ?? "", page_size: 5 },
            });
            if (!search.successful) return { error: "tool_failed", message: search.error };
            const shaped = shapeNotes(search.data);
            const page = shaped.notes.find((n) => n.id && !n.isDatabase);
            if (!page) {
              return {
                error: "not_found",
                message: `No Notion page found matching "${args.query}". Try search_notes to see what's available.`,
              };
            }
            pageId = page.id;
            title = page.title;
          }

          await log("executing", "Executing action", `Reading "${title ?? pageId}"`);
          const result = await composio.tools.execute("NOTION_GET_PAGE_MARKDOWN", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: { page_id: pageId },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const data: any = result.data;
          const markdown: string =
            data?.markdown ?? data?.content ?? (typeof data === "string" ? data : JSON.stringify(data));
          await ctx.runMutation(api.connections.touchSync, { toolkit: "notion" });
          return finish({
            title,
            page_id: pageId,
            content: markdown.slice(0, 12000),
            truncated: markdown.length > 12000,
          });
        }

        /* ---------------- composio universal execution ---------------- */
        case "execute_composio_action": {
          const actionSlug = String(args.action ?? "").toUpperCase();
          const actionArgs = args.arguments ?? {};
          if (!actionSlug) {
            return { error: "missing_action", message: "Action slug is required (e.g. 'GITHUB_CREATE_AN_ISSUE', 'SLACK_SEND_MESSAGE')." };
          }
          await setObjective(`Executing ${actionSlug}`);
          await log("executing", "Executing Composio Action", actionSlug);
          const composio = getComposio();
          const result = await composio.tools.execute(actionSlug, {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: actionArgs,
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          return finish({
            ok: true,
            data: result.data,
          });
        }

        /* ---------------- briefing ---------------- */
        case "prepare_daily_briefing": {
          const briefing: any = await ctx.runAction(api.briefing.run, {});
          return briefing;
        }

        default:
          return { error: "unknown_tool", message: `Tool "${name}" is not implemented.` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await log("error", "Action failed", message.slice(0, 160));
      await setObjective("Standing by", "idle");
      return { error: "execution_error", message };
    }
  },
});

function normalizePriority(input: unknown): "high" | "normal" | "low" {
  const s = String(input ?? "normal").toLowerCase();
  if (s.includes("high") || s.includes("urgent")) return "high";
  if (s.includes("low")) return "low";
  return "normal";
}

function parseDueDate(input: unknown): number | undefined {
  if (!input) return undefined;
  const ts = Date.parse(String(input));
  return isNaN(ts) ? undefined : ts;
}

function resolveServiceSlug(input: string): string | null {
  const s = input.toLowerCase().trim();
  if (s.includes("gmail") || s.includes("mail") || s.includes("email")) return "gmail";
  if (s.includes("calendar")) return "googlecalendar";
  if (s.includes("notion") || s.includes("note")) return "notion";
  if (s.includes("github") || s.includes("git")) return "github";
  if (s.includes("slack")) return "slack";
  if (s.includes("drive") || s.includes("googledrive")) return "googledrive";
  if (s.includes("trello")) return "trello";
  if (s.includes("jira")) return "jira";
  if (s.includes("discord")) return "discord";
  if (s.includes("twitter") || s.includes("tweet") || s === "x") return "twitter";
  if (SERVICES[s]) return s;
  return null;
}
