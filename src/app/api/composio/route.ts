import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import {
  POPULAR_COMPOSIO_APPS,
  createComposioConnection,
  getComposioConnections,
} from "@/lib/composioClient";

export async function GET(request: NextRequest) {
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

  let user: any = null;
  try {
    user = await convex.query(api.auth.me, {});
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const customApiKey = request.headers.get("x-composio-api-key") || process.env.COMPOSIO_API_KEY;
  if (!customApiKey) {
    return NextResponse.json({
      configured: false,
      apps: POPULAR_COMPOSIO_APPS.map((app) => ({ ...app, connected: false })),
      connections: [],
    });
  }

  const userId = user._id || user.id || "default_user";
  const { connections, error } = await getComposioConnections(userId, customApiKey);

  const connectedToolkitNames = new Set(
    (connections || []).map((c: any) => c.appName?.toLowerCase() || c.toolkit?.toLowerCase())
  );

  const appsWithStatus = POPULAR_COMPOSIO_APPS.map((app) => ({
    ...app,
    connected: connectedToolkitNames.has(app.name.toLowerCase()),
  }));

  return NextResponse.json({
    configured: true,
    error: error || null,
    apps: appsWithStatus,
    connections,
  });
}

export async function POST(request: NextRequest) {
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

  let user: any = null;
  try {
    user = await convex.query(api.auth.me, {});
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const customApiKey = request.headers.get("x-composio-api-key") || process.env.COMPOSIO_API_KEY;
  if (!customApiKey) {
    return NextResponse.json(
      { error: "Composio API key is not configured. Please add it in Settings or .env.local" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { appName } = body;

    if (!appName) {
      return NextResponse.json({ error: "appName is required" }, { status: 400 });
    }

    const userId = user._id || user.id || "default_user";
    const result = await createComposioConnection(userId, appName, customApiKey);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ redirectUrl: result.redirectUrl });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to initiate Composio connection" },
      { status: 500 }
    );
  }
}
