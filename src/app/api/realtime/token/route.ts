import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { BUBLOO_INSTRUCTIONS, BUBLOO_TOOLS } from "@/lib/bublooTools";
import { api } from "../../../../../convex/_generated/api";

/**
 * Mints an ephemeral Realtime API client secret. The real OPENAI_API_KEY
 * stays server-side; the browser only ever sees the short-lived token.
 * Requires a valid Convex Auth JWT — unauthenticated requests are rejected.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured. Add it to .env.local." },
      { status: 500 }
    );
  }

  // Verify the caller is an authenticated Bubloo user.
  const authHeader = request.headers.get("authorization");
  const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  let profileSection = "";
  try {
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(jwt);
    const user = await convex.query(api.auth.me, {});
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    // Personalize the session with the operator's profile.
    const profile = await convex.query(api.profiles.get, {});
    if (profile) {
      const lines = [
        profile.displayName && `- Name: ${profile.displayName} (address them by name)`,
        profile.role && `- Role: ${profile.role}`,
        profile.company && `- Company: ${profile.company}`,
        profile.location && `- Location: ${profile.location}`,
        profile.timezone && `- Timezone: ${profile.timezone} (use for all times and scheduling)`,
        profile.communicationStyle &&
          `- Preferred communication style: ${profile.communicationStyle}`,
        profile.signOff && `- Email sign-off to use when sending email: "${profile.signOff}"`,
        profile.notes && `- Additional context: ${profile.notes}`,
      ].filter(Boolean);
      if (lines.length > 0) {
        profileSection = `\n\nOperator profile (treat as ground truth about the user):\n${lines.join("\n")}`;
      }
    }
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const now = new Date();
  const sessionConfig = {
    session: {
      type: "realtime",
      model: "gpt-realtime",
      instructions:
        BUBLOO_INSTRUCTIONS +
        profileSection +
        `\n\nCurrent date and time: ${now.toString()}. Use this to resolve relative dates.`,
      tools: BUBLOO_TOOLS,
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "semantic_vad",
            interrupt_response: true,
            create_response: true,
          },
        },
        output: { voice: "cedar" },
      },
    },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { error: `OpenAI token request failed (${response.status})`, detail },
        { status: 500 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Token generation failed" },
      { status: 500 }
    );
  }
}
