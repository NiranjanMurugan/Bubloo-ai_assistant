import { Composio } from "@composio/core";

let composioInstance: Composio | null = null;

export function getComposioClient(apiKey?: string): Composio | null {
  const key = apiKey || process.env.COMPOSIO_API_KEY;
  if (!key) return null;

  if (!composioInstance || (apiKey && apiKey !== process.env.COMPOSIO_API_KEY)) {
    composioInstance = new Composio({ apiKey: key });
  }
  return composioInstance;
}

export interface ComposioAppInfo {
  name: string;
  displayName: string;
  icon: string;
  description: string;
}

export const POPULAR_COMPOSIO_APPS: ComposioAppInfo[] = [
  {
    name: "gmail",
    displayName: "Gmail",
    icon: "mail",
    description: "Read, search, draft, and send emails via Google Workspace",
  },
  {
    name: "googlecalendar",
    displayName: "Google Calendar",
    icon: "calendar",
    description: "Schedule events, view agenda, and manage invites",
  },
  {
    name: "github",
    displayName: "GitHub",
    icon: "git-branch",
    description: "Manage repositories, issues, pull requests, and commits",
  },
  {
    name: "slack",
    displayName: "Slack",
    icon: "message-square",
    description: "Send channel messages, direct messages, and read threads",
  },
  {
    name: "notion",
    displayName: "Notion",
    icon: "file-text",
    description: "Create and search pages, databases, and workspace notes",
  },
  {
    name: "googledrive",
    displayName: "Google Drive",
    icon: "folder",
    description: "Upload, download, search, and organize cloud documents",
  },
  {
    name: "trello",
    displayName: "Trello",
    icon: "trello",
    description: "Manage boards, lists, and task cards",
  },
  {
    name: "jira",
    displayName: "Jira",
    icon: "check-square",
    description: "Track issues, sprints, and project tickets",
  },
  {
    name: "discord",
    displayName: "Discord",
    icon: "message-circle",
    description: "Send messages and notifications to Discord servers",
  },
  {
    name: "twitter",
    displayName: "X (Twitter)",
    icon: "share-2",
    description: "Post tweets, search tweets, and check notifications",
  },
];

/**
 * Initiate an OAuth connection link for a user and application.
 */
export async function createComposioConnection(
  userId: string,
  appName: string,
  apiKey?: string
): Promise<{ redirectUrl?: string; error?: string }> {
  try {
    const composio = getComposioClient(apiKey);
    if (!composio) {
      return { error: "COMPOSIO_API_KEY is not configured" };
    }

    const existing = await composio.authConfigs.list({ toolkit: appName });
    let authConfigId = existing.items?.[0]?.id;
    if (!authConfigId) {
      const created = await composio.authConfigs.create(appName, {
        type: "use_composio_managed_auth",
      });
      authConfigId = created.id;
    }

    const connectionRequest = await composio.connectedAccounts.link(
      String(userId),
      authConfigId
    );

    if (connectionRequest.redirectUrl) {
      return { redirectUrl: connectionRequest.redirectUrl };
    }
    return { error: "No redirect URL generated" };
  } catch (err: any) {
    console.error(`Failed to create Composio connection for ${appName}:`, err);
    return { error: err.message || "Failed to initiate connection" };
  }
}

/**
 * Check connected accounts for a specific user.
 */
export async function getComposioConnections(
  userId: string,
  apiKey?: string
): Promise<{ connections: any[]; error?: string }> {
  try {
    const composio = getComposioClient(apiKey);
    if (!composio) {
      return { connections: [], error: "COMPOSIO_API_KEY is not configured" };
    }

    const accounts = await composio.connectedAccounts.list({
      userIds: [String(userId)],
    });

    return { connections: accounts.items || [] };
  } catch (err: any) {
    console.error("Failed to list Composio connected accounts:", err);
    return { connections: [], error: err.message };
  }
}

/**
 * Execute an action using Composio
 */
export async function executeComposioAction(
  userId: string,
  actionSlug: string,
  params: Record<string, any>,
  apiKey?: string
): Promise<any> {
  try {
    const composio = getComposioClient(apiKey);
    if (!composio) {
      return { error: "COMPOSIO_API_KEY is not configured" };
    }

    const result = await composio.tools.execute(actionSlug.toUpperCase(), {
      userId: String(userId),
      dangerouslySkipVersionCheck: true,
      arguments: params,
    });

    return result;
  } catch (err: any) {
    console.error(`Composio action execution failed for ${actionSlug}:`, err);
    return { error: err.message || "Execution failed" };
  }
}
