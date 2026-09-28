import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { GoogleGenAI } from "@google/genai";
import { BUBLOO_INSTRUCTIONS, BUBLOO_TOOLS } from "@/lib/bublooTools";
import { isLocalSystemTool, executeLocalSystemTool } from "@/lib/localSystemTools";
import { api } from "../../../../../convex/_generated/api";

export async function POST(request: NextRequest) {
  const customApiKey = request.headers.get("x-gemini-api-key");
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured. Add it to .env.local or enter it in settings." },
      { status: 400 }
    );
  }

  // Verify Convex Auth JWT
  const authHeader = request.headers.get("authorization");
  const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_CONVEX_URL is missing" }, { status: 500 });
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(jwt);

  let profileSection = "";
  try {
    const user = await convex.query(api.auth.me, {});
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
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
  const systemInstruction =
    BUBLOO_INSTRUCTIONS +
    profileSection +
    `\n\nCurrent date and time: ${now.toString()}. Use this to resolve relative dates.`;

  // Format tools for Gemini API
  const functionDeclarations = BUBLOO_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  try {
    const body = await request.json();
    const { message, history = [] } = body;

    const ai = new GoogleGenAI({ apiKey });

    // Format chat history for Gemini
    const contents: Array<any> = [];

    for (const h of history) {
      contents.push({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      });
    }

    if (message) {
      contents.push({
        role: "user",
        parts: [{ text: message }],
      });
    }

    const executedToolsLog: Array<{ name: string; args: any; result: any }> = [];

    // Supported models in priority order (flash-lite models have fresh quota and lowest latency)
    const CANDIDATE_MODELS = [
      "gemini-3.5-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3.5-flash",
      "gemini-3.8-flash",
      "gemini-flash-latest",
    ];

    async function generateWithFallback(genAiConfig: any) {
      let lastErr: any = null;
      for (const model of CANDIDATE_MODELS) {
        try {
          return await ai.models.generateContent({
            model,
            ...genAiConfig,
          });
        } catch (err: any) {
          lastErr = err;
          // If 429 (quota), 404 (unavailable), or 503 (spike), try next model immediately
          continue;
        }
      }
      throw lastErr;
    }

    // Loop for multi-step tool execution (max 5 iterations)
    let finalAssistantText = "";
    let iterations = 0;

    while (iterations < 5) {
      iterations++;

      const response = await generateWithFallback({
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: functionDeclarations as any }],
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate?.content) {
        break;
      }

      const parts = candidate.content.parts ?? [];
      const functionCalls = parts.filter((p) => p.functionCall);

      if (functionCalls.length > 0) {
        // Preserve model content with thought signatures and call details
        contents.push(candidate.content);

        const functionResponses = [];
        for (const part of functionCalls) {
          const { name, args, id } = part.functionCall!;
          const toolName = name || "unknown";

          // Execute tool (local PC control tools run directly on the host; cloud tools run in Convex)
          let toolResult: any = {};
          try {
            if (isLocalSystemTool(toolName)) {
              toolResult = await executeLocalSystemTool(toolName, args || {});
            } else {
              toolResult = await convex.action(api.tools.execute, {
                name: toolName,
                arguments: args || {},
              });
            }
          } catch (err: any) {
            toolResult = { error: err.message || "Tool execution failed" };
          }

          executedToolsLog.push({ name: toolName, args, result: toolResult });

          functionResponses.push({
            functionResponse: {
              name: toolName,
              response: { result: toolResult },
              ...(id ? { id } : {}),
            },
          });
        }

        // Pass function responses back to Gemini
        contents.push({
          role: "user",
          parts: functionResponses,
        });
      } else {
        for (const part of parts) {
          if (part.text) {
            finalAssistantText += part.text;
          }
        }
        break;
      }
    }

    return NextResponse.json({
      text: finalAssistantText,
      executedTools: executedToolsLog,
    });
  } catch (err: any) {
    console.error("Gemini API Error:", err);
    let errorMessage = err.message || "Failed to communicate with Google Gemini";
    try {
      const parsed = JSON.parse(errorMessage);
      if (parsed.error?.message) {
        errorMessage = parsed.error.message;
      }
    } catch {}

    if (
      err.status === 401 ||
      errorMessage.includes("API_KEY_INVALID") ||
      errorMessage.includes("UNAUTHENTICATED")
    ) {
      errorMessage =
        "Invalid Gemini API Key. Please verify your API key or configure a new key in settings.";
    } else if (
      err.status === 429 ||
      errorMessage.includes("429") ||
      errorMessage.includes("quota") ||
      errorMessage.includes("RESOURCE_EXHAUSTED")
    ) {
      errorMessage =
        "Gemini free-tier rate limit reached. Please wait a few seconds before trying again.";
    } else if (err.status === 503 || errorMessage.includes("UNAVAILABLE")) {
      errorMessage =
        "Google Gemini is temporarily experiencing high demand. Please try again in a moment.";
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: err.status || 500 }
    );
  }
}
