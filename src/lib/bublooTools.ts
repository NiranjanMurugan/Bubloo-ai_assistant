/**
 * Tool definitions and persona instructions for the Realtime & Gemini sessions.
 * Shared between the token route (session config) and the client.
 */

export const BUBLOO_INSTRUCTIONS = `You are Bubloo, a voice-first AI chief of staff — calm, precise, quietly witty, with the composed confidence of a seasoned British aide. Address the user as "sir" sparingly and naturally.

Voice style:
- Speak in short, information-dense sentences. This is a spoken conversation, not an essay.
- Never read raw data structures aloud. Synthesize: "Three unread emails, one from Sarah about the launch."
- When interrupted, stop gracefully and address the new request immediately.

Operational rules:
- Use tools proactively. If the user asks about email, calendar, or notes, call the matching tool rather than guessing.
- When the user states a preference, fact about themselves, project, or favorite tool — even in passing — call "remember" to store it. Confirm briefly: "Noted."
- If a tool reports a service is not connected, offer to connect it. If the user agrees, call "connect_service".
- After initiating a connection, tell the user an authentication window is opening and to complete sign-in there.
- "What can you connect to?" → call "list_services" and summarize.
- You CAN read Notion page contents: "search_notes" finds pages (returns their ids), "read_note" retrieves a page's full content. When asked what's inside a note or to read it back, call "read_note" — never claim you cannot access page contents.
- "Prepare me for today" or any daily-briefing request → call "prepare_daily_briefing", then deliver a confident executive summary of its results.
- If asked what you know about the user, call "recall" and summarize warmly.
- To-dos live natively in this platform (not Notion). Manage them with "add_todo", "complete_todo", "update_todo", "delete_todo", and "list_todos". Be proactive: if an email or meeting clearly implies an action item, offer to add it as a to-do. When the user references a to-do loosely ("the launch thing"), call "list_todos" first to find the right title.
- Sending email: draft the message yourself from the user's intent, then read back the recipient, subject, and a one-line gist and ask for confirmation BEFORE calling "send_email". Never send without explicit verbal confirmation. If the user dictates a recipient address, repeat it back character-perfect. After sending, confirm briefly.
- PC control: You have direct control over the user's Windows PC.
  - When the user asks to open any program, app, or setting (e.g. "open notepad", "open settings", "open my pc" or "this pc", "open calculator", "open file explorer", "open task manager", "open browser"), immediately call "open_application".
  - When the user asks to adjust sound ("volume up", "volume down", "mute", "unmute"), lock the screen, or take a screenshot, call "control_system".
  - When the user asks to open a website or browse the web, call "open_url".
  - Acknowledge PC control actions concisely and politely: "Opening Notepad now, sir." or "Volume increased."
- Integrations & Composio:
  - You can connect to and interact with external services via Composio (Gmail, Google Calendar, Notion, GitHub, Slack, Google Drive, Trello, Jira, Discord, Twitter/X).
  - To check status or connect new apps, call "list_services" or "connect_service".
  - For specialized actions on GitHub, Slack, Trello, Jira, etc., call "execute_composio_action" with the appropriate action slug (e.g., 'GITHUB_CREATE_AN_ISSUE', 'GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER', 'SLACK_SEND_MESSAGE', 'TRELLO_CREATE_CARD', 'DISCORD_SEND_MESSAGE').
- Report failures honestly and suggest the next step. Never invent data.`;

export const JARVIS_INSTRUCTIONS = BUBLOO_INSTRUCTIONS;

export const BUBLOO_TOOLS = [
  {
    type: "function",
    name: "open_application",
    description:
      "Open an application, window, or system utility on the user's Windows PC (e.g. 'notepad', 'settings', 'this pc' / 'my pc', 'calculator', 'explorer', 'paint', 'task manager', 'terminal').",
    parameters: {
      type: "object",
      properties: {
        app_name: {
          type: "string",
          description:
            "Name of the application or destination, e.g. 'notepad', 'settings', 'this pc', 'calculator', 'explorer', 'paint', 'task manager', 'browser'.",
        },
        target: {
          type: "string",
          description: "Optional argument, file path, or URL to open with the app.",
        },
      },
      required: ["app_name"],
    },
  },
  {
    type: "function",
    name: "control_system",
    description:
      "Control PC hardware/system state such as volume up/down, mute/unmute, screen lock, or screenshot on the user's Windows PC.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "volume_up",
            "volume_down",
            "mute",
            "unmute",
            "lock",
            "screenshot",
            "task_manager",
          ],
          description: "System control action to execute.",
        },
        steps: {
          type: "number",
          description: "Optional number of volume step increments (default 5).",
        },
      },
      required: ["action"],
    },
  },
  {
    type: "function",
    name: "open_url",
    description:
      "Open a website URL or web search in the user's default browser.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full URL to open (e.g. 'https://youtube.com', 'https://google.com').",
        },
      },
      required: ["url"],
    },
  },
  {
    type: "function",
    name: "get_emails",
    description:
      "Fetch emails from the user's connected Gmail account. Defaults to unread messages.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Gmail search query, e.g. 'is:unread', 'from:sarah', 'subject:invoice'. Default 'is:unread'.",
        },
        max_results: { type: "number", description: "Max messages to fetch (default 10)." },
      },
    },
  },
  {
    type: "function",
    name: "send_email",
    description:
      "Send an email from the user's connected Gmail account. ONLY call this after the user has verbally confirmed the recipient, subject, and message content.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address." },
        subject: { type: "string" },
        body: {
          type: "string",
          description:
            "Plain-text email body. Write it well-formed and professional unless told otherwise; sign off as the user would.",
        },
        cc: {
          type: "array",
          items: { type: "string" },
          description: "Optional CC addresses.",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    type: "function",
    name: "get_calendar_events",
    description:
      "List events from the user's Google Calendar. Defaults to the rest of today.",
    parameters: {
      type: "object",
      properties: {
        time_min: { type: "string", description: "ISO 8601 lower bound. Defaults to now." },
        time_max: {
          type: "string",
          description: "ISO 8601 upper bound. Defaults to end of today.",
        },
        max_results: { type: "number" },
      },
    },
  },
  {
    type: "function",
    name: "create_calendar_event",
    description: "Create a new Google Calendar event.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title." },
        start_datetime: {
          type: "string",
          description:
            "Event start in ISO 8601 local time, e.g. '2026-08-05T14:00:00'. Resolve relative dates like 'tomorrow at 2 PM' yourself using the current date/time.",
        },
        duration_minutes: { type: "number", description: "Duration in minutes (default 30)." },
        description: { type: "string" },
        timezone: { type: "string", description: "IANA timezone, e.g. 'Asia/Kolkata'." },
      },
      required: ["summary", "start_datetime"],
    },
  },
  {
    type: "function",
    name: "search_notes",
    description: "Search the user's Notion workspace for pages and documents.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text. Empty string returns recent pages." },
        max_results: { type: "number" },
      },
    },
  },
  {
    type: "function",
    name: "read_note",
    description:
      "Read the full content of a Notion page (rendered as Markdown) so you can summarize it or read it back aloud. Provide page_id if known (from search_notes results), otherwise a query to find the page by title.",
    parameters: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "Notion page UUID, if already known." },
        query: { type: "string", description: "Page title to search for when no page_id is available." },
        title: { type: "string", description: "Display title, if known." },
      },
    },
  },
  {
    type: "function",
    name: "remember",
    description:
      "Store a fact about the user in long-term memory. Use whenever the user states a preference, project, tool choice, or personal fact.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["preference", "project", "fact", "context", "service"],
        },
        key: {
          type: "string",
          description: "Short stable identifier, e.g. 'favorite editor', 'current project'.",
        },
        value: { type: "string", description: "The fact itself, e.g. 'Cursor'." },
      },
      required: ["category", "key", "value"],
    },
  },
  {
    type: "function",
    name: "recall",
    description: "Retrieve everything Bubloo remembers about the user.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "forget",
    description: "Remove a remembered fact by its key.",
    parameters: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
  {
    type: "function",
    name: "add_todo",
    description:
      "Add a to-do item to the user's native task list. Use when the user asks to add, track, or be reminded of something to do.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, action-oriented title." },
        priority: { type: "string", enum: ["high", "normal", "low"] },
        due_date: {
          type: "string",
          description:
            "Optional due date/time in ISO 8601 WITH timezone offset, e.g. '2026-08-05T18:00:00+05:30'. Resolve relative phrases like 'by Friday evening' yourself using the current date/time.",
        },
        notes: { type: "string", description: "Optional extra context." },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "complete_todo",
    description: "Mark a to-do as done. Matches by (partial) title.",
    parameters: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "update_todo",
    description:
      "Edit an existing to-do: rename it, change priority, set or move a due date, add notes, or reopen a completed one.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Current (partial) title to match." },
        new_title: { type: "string" },
        priority: { type: "string", enum: ["high", "normal", "low"] },
        due_date: { type: "string", description: "New due date in ISO 8601." },
        notes: { type: "string" },
        reopen: { type: "boolean", description: "Set true to move a done item back to pending." },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "delete_todo",
    description: "Delete a to-do entirely. Matches by (partial) title.",
    parameters: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "list_todos",
    description:
      "List the user's pending and recently completed to-dos. Use before editing when unsure of exact titles, or when the user asks what's on their plate.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "list_services",
    description:
      "List all external services Bubloo can connect to, with their current connection status.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "connect_service",
    description:
      "Begin the OAuth connection flow for an external service (Gmail, Google Calendar, or Notion). Opens an authentication window for the user.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", description: "Service name, e.g. 'gmail', 'notion', 'google calendar'." },
      },
      required: ["service"],
    },
  },
  {
    type: "function",
    name: "prepare_daily_briefing",
    description:
      "Gather email, calendar, and notes from all connected services and compile a daily briefing. Use for 'prepare me for today', 'daily briefing', 'what's my day look like'.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "execute_composio_action",
    description:
      "Execute an action on any connected external app via Composio (GitHub, Slack, Trello, Jira, Google Drive, Discord, etc.).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "Composio action slug in UPPERCASE (e.g. 'GITHUB_CREATE_AN_ISSUE', 'SLACK_SEND_MESSAGE', 'TRELLO_CREATE_CARD', 'DISCORD_SEND_MESSAGE').",
        },
        arguments: {
          type: "object",
          description: "Action arguments and parameters required by the tool.",
        },
      },
      required: ["action"],
    },
  },
];

export const JARVIS_TOOLS = BUBLOO_TOOLS;
