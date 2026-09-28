"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { Composio } from "@composio/core";
import { requireUser } from "./auth";

export const SERVICES: Record<string, { name: string; description: string }> = {
  gmail: { name: "Gmail", description: "Read, search, draft, and send emails" },
  googlecalendar: { name: "Google Calendar", description: "View, schedule, and manage calendar events" },
  notion: { name: "Notion", description: "Search, read, and create notes and documents" },
  github: { name: "GitHub", description: "Manage repositories, issues, PRs, and commits" },
  slack: { name: "Slack", description: "Send and read messages across Slack channels" },
  googledrive: { name: "Google Drive", description: "Search, read, and manage Google Drive files" },
  trello: { name: "Trello", description: "Manage boards, cards, and to-do lists" },
  jira: { name: "Jira", description: "Track issues, tickets, and project sprints" },
  discord: { name: "Discord", description: "Send announcements and messages to Discord channels" },
  twitter: { name: "X (Twitter)", description: "Post updates and search tweets" },
};

export function getComposio() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error("COMPOSIO_API_KEY is not set in Convex environment variables");
  }
  return new Composio({ apiKey });
}

/** Find (or create) a Composio-managed auth config for a toolkit. */
async function getOrCreateAuthConfigId(
  composio: Composio,
  toolkit: string
): Promise<string> {
  const existing = await composio.authConfigs.list({ toolkit });
  const item = existing.items?.[0];
  if (item) return item.id;
  const created = await composio.authConfigs.create(toolkit, {
    type: "use_composio_managed_auth",
  });
  return created.id;
}

/**
 * Start an OAuth connection for a toolkit. Returns the hosted auth URL and
 * flips the connection card into pending_auth. The client opens the URL in a
 * popup and then polls checkConnection.
 */
export const initiateConnection = action({
  args: { toolkit: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const toolkit = args.toolkit.toLowerCase();
    const service = SERVICES[toolkit];
    if (!service) {
      return { ok: false as const, error: `Unknown service "${args.toolkit}". Available: ${Object.keys(SERVICES).join(", ")}` };
    }

    const composio = getComposio();

    await ctx.runMutation(api.objective.set, {
      text: `Waiting for ${service.name} authentication`,
      state: "waiting_auth",
    });
    await ctx.runMutation(api.timeline.log, {
      kind: "auth_requested",
      label: "Authentication requested",
      detail: `${service.name} OAuth flow initiated`,
    });

    try {
      const authConfigId = await getOrCreateAuthConfigId(composio, toolkit);
      const connectionRequest = await composio.connectedAccounts.link(
        String(userId),
        authConfigId
      );
      const redirectUrl = connectionRequest.redirectUrl ?? undefined;

      await ctx.runMutation(api.connections.upsert, {
        toolkit,
        name: service.name,
        status: "pending_auth",
        connectedAccountId: connectionRequest.id,
        authUrl: redirectUrl,
      });

      return { ok: true as const, redirectUrl, service: service.name };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(api.connections.upsert, {
        toolkit,
        name: service.name,
        status: "error",
        error: message,
      });
      await ctx.runMutation(api.objective.set, { text: "Standing by", state: "idle" });
      return { ok: false as const, error: message };
    }
  },
});

/**
 * Poll whether a pending connection has become active. On success, update
 * connections, memory, timeline, and objective.
 */
export const checkConnection = action({
  args: { toolkit: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const toolkit = args.toolkit.toLowerCase();
    const service = SERVICES[toolkit];
    if (!service) return { connected: false };

    const composio = getComposio();
    try {
      const accounts = await composio.connectedAccounts.list({
        userIds: [String(userId)],
        toolkitSlugs: [toolkit],
      });
      const active = accounts.items?.find(
        (a: { status: string }) => a.status === "ACTIVE"
      );
      if (!active) return { connected: false };

      await ctx.runMutation(api.connections.upsert, {
        toolkit,
        name: service.name,
        status: "connected",
        connectedAccountId: active.id,
        lastSync: Date.now(),
      });
      await ctx.runMutation(api.timeline.log, {
        kind: "connected",
        label: "Connection successful",
        detail: `${service.name} is now linked`,
      });
      await ctx.runMutation(api.memory.remember, {
        category: "service",
        key: `connected ${service.name.toLowerCase()}`,
        value: `${service.name} account linked and available`,
        source: "connection flow",
      });
      await ctx.runMutation(api.objective.set, { text: "Standing by", state: "idle" });
      return { connected: true };
    } catch {
      return { connected: false };
    }
  },
});

/** Refresh this user's connection statuses from Composio (used on app start). */
export const syncConnections = action({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    // Always make sure the three known services exist as cards.
    const existing = await ctx.runQuery(api.connections.list, {});
    for (const [slug, svc] of Object.entries(SERVICES)) {
      if (!existing.find((c) => c.toolkit === slug)) {
        await ctx.runMutation(api.connections.upsert, {
          toolkit: slug,
          name: svc.name,
          status: "available",
        });
      }
    }
    if (!process.env.COMPOSIO_API_KEY) return { synced: false };
    try {
      const composio = getComposio();
      const accounts = await composio.connectedAccounts.list({
        userIds: [String(userId)],
      });
      for (const account of accounts.items ?? []) {
        const slug = (account.toolkit?.slug ?? "").toLowerCase();
        const svc = SERVICES[slug];
        if (svc && account.status === "ACTIVE") {
          await ctx.runMutation(api.connections.upsert, {
            toolkit: slug,
            name: svc.name,
            status: "connected",
            connectedAccountId: account.id,
          });
        }
      }
      return { synced: true };
    } catch {
      return { synced: false };
    }
  },
});
