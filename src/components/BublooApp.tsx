"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useRealtimeSession } from "@/hooks/useRealtimeSession";
import { useGeminiSession } from "@/hooks/useGeminiSession";
import { ORB_STATE_HUES, OrbState } from "@/lib/types";
import { BublooOrb } from "./orb/BublooOrb";
import { Transcript } from "./Transcript";
import { LeftPanel } from "./panels/LeftPanel";
import { RightPanel } from "./panels/RightPanel";

export function BublooApp() {
  const [provider, setProviderState] = useState<"gemini" | "openai">("gemini");
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("bubloo_provider") || localStorage.getItem("jarvis_provider") as "gemini" | "openai" | null;
    if (saved && (saved === "gemini" || saved === "openai")) setProviderState(saved);
    const savedKey = localStorage.getItem("bubloo_gemini_api_key") || localStorage.getItem("jarvis_gemini_api_key") || "";
    setGeminiKeyInput(savedKey);
  }, []);

  const setProvider = (p: "gemini" | "openai") => {
    setProviderState(p);
    localStorage.setItem("bubloo_provider", p);
  };

  const openAiSession = useRealtimeSession();
  const geminiSession = useGeminiSession();

  const session = provider === "gemini" ? geminiSession : openAiSession;

  const seed = useMutation(api.init.seed);
  const syncConnections = useAction(api.composio.syncConnections);
  const checkConnection = useAction(api.composio.checkConnection);

  const voiceState = useQuery(api.voiceState.get);
  const connections = useQuery(api.connections.list) ?? [];

  // Bootstrap singletons + refresh connection statuses once per load.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void seed({}).catch(() => {});
    void syncConnections({}).catch(() => {});
  }, [seed, syncConnections]);

  // Re-evaluate staleness periodically so dead sessions stop mirroring.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const heartbeatFresh =
    !!voiceState?.sessionActive && Date.now() - voiceState.updatedAt < 25000;
  const mirroring = !session.active && heartbeatFresh;
  const displayState: OrbState = session.active
    ? session.orbState
    : mirroring
      ? ((voiceState?.orbState ?? "idle") as OrbState)
      : "idle";
  const sessionAlive = session.active || mirroring;

  // Ambient scene tint follows the orb state.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--state-hue",
      String(ORB_STATE_HUES[displayState] ?? 197)
    );
  }, [displayState]);

  // Poll pending OAuth connections; the host tab notifies Bubloo on success.
  const pendingToolkits = useMemo(
    () =>
      connections
        .filter((c) => c.status === "pending_auth")
        .map((c) => `${c.toolkit}:${c.name}`)
        .join(","),
    [connections]
  );
  useEffect(() => {
    if (!pendingToolkits) return;
    const entries = pendingToolkits.split(",").map((e) => {
      const [toolkit, name] = e.split(":");
      return { toolkit, name };
    });
    const interval = setInterval(() => {
      for (const { toolkit, name } of entries) {
        void checkConnection({ toolkit })
          .then((res) => {
            if (res?.connected && session.active) {
              session.notifySystem(
                `System note: ${name} has been connected successfully. Acknowledge this to the user briefly and offer a relevant next step.`
              );
            }
          })
          .catch(() => {});
      }
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingToolkits, session.active]);

  const getLevel = () => {
    if (session.active) return session.getLevel();
    if (mirroring && (displayState === "speaking" || displayState === "listening")) {
      const t = performance.now() / 1000;
      return 0.25 + 0.2 * Math.sin(t * 6.1) + 0.12 * Math.sin(t * 13.7);
    }
    return 0;
  };

  const saveGeminiKey = (key: string) => {
    setGeminiKeyInput(key);
    localStorage.setItem("bubloo_gemini_api_key", key);
    localStorage.setItem("jarvis_gemini_api_key", key);
    setShowApiKeyModal(false);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="relative z-10 flex h-full flex-col">
        <Header
          sessionAlive={sessionAlive}
          mirroring={mirroring}
          error={session.error}
          provider={provider}
          setProvider={setProvider}
          onOpenKeyModal={() => setShowApiKeyModal(true)}
        />

        <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr_320px] gap-4 px-4 pb-4 xl:grid-cols-[330px_1fr_360px] xl:gap-5 xl:px-5 xl:pb-5">
          <LeftPanel />

          <main className="glass flex min-h-0 flex-col items-center rounded-2xl px-6 pt-2">
            <BublooOrb
              state={displayState}
              getLevel={getLevel}
              active={sessionAlive}
              onActivate={() => void session.activate()}
              onDeactivate={session.deactivate}
              hosting={session.active}
              connecting={session.connecting}
            />
            {mirroring && (
              <p className="mono -mt-2 text-[10px] tracking-[0.25em] text-white/30 uppercase">
                Session active in another window
              </p>
            )}
            <Transcript
              onSendText={(text) => {
                if (provider === "gemini") {
                  void geminiSession.sendQuery(text);
                }
              }}
              onMicClick={() => {
                if (provider === "gemini") {
                  if (!geminiSession.active) {
                    void geminiSession.activate();
                  } else {
                    geminiSession.startListening();
                  }
                }
              }}
              isListening={
                provider === "gemini" &&
                geminiSession.active &&
                geminiSession.orbState === "listening"
              }
              interimText={
                provider === "gemini" ? geminiSession.interimText : undefined
              }
            />
          </main>

          <RightPanel />
        </div>
      </div>

      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass w-[420px] rounded-2xl p-6 shadow-2xl">
            <h3 className="text-[14px] font-semibold tracking-wider text-white">
              Google Gemini API Key
            </h3>
            <p className="mt-1 text-[12px] text-white/50">
              Enter your Gemini API key (from Google AI Studio) or leave blank if set in <code className="text-cyan-300">.env.local</code>.
            </p>

            <input
              type="password"
              value={geminiKeyInput}
              onChange={(e) => setGeminiKeyInput(e.target.value)}
              placeholder="Paste Gemini API key or leave blank to use .env.local..."
              className="mono mt-4 w-full rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-[13px] text-white outline-none focus:border-cyan-400"
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="rounded border border-white/10 px-3 py-1.5 text-[12px] text-white/50 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => saveGeminiKey(geminiKeyInput)}
                className="rounded border border-cyan-400/40 bg-cyan-500/20 px-4 py-1.5 text-[12px] font-medium text-cyan-200 hover:bg-cyan-500/30"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({
  sessionAlive,
  mirroring,
  error,
  provider,
  setProvider,
  onOpenKeyModal,
}: {
  sessionAlive: boolean;
  mirroring: boolean;
  error: string | null;
  provider: "gemini" | "openai";
  setProvider: (p: "gemini" | "openai") => void;
  onOpenKeyModal: () => void;
}) {
  const { signOut } = useAuthActions();
  const user = useQuery(api.auth.me);
  const profile = useQuery(api.profiles.get);
  return (
    <header className="flex items-center justify-between px-6 py-4 xl:px-7">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[15px] font-semibold tracking-[0.42em] text-white/90">
          B U B L O O
        </h1>
        <span className="label-xs">Control Center</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Engine Switcher */}
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-1">
          <button
            onClick={() => setProvider("gemini")}
            className={`mono flex items-center gap-1.5 rounded px-2.5 py-1 text-[10px] tracking-wider uppercase transition ${
              provider === "gemini"
                ? "bg-cyan-400/20 text-cyan-200 border border-cyan-300/30"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            ✦ Gemini
          </button>
          <button
            onClick={() => setProvider("openai")}
            className={`mono rounded px-2.5 py-1 text-[10px] tracking-wider uppercase transition ${
              provider === "openai"
                ? "bg-purple-400/20 text-purple-200 border border-purple-300/30"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            OpenAI
          </button>
        </div>

        {provider === "gemini" && (
          <button
            onClick={onOpenKeyModal}
            className="mono rounded border border-white/10 px-2 py-1 text-[9.5px] text-white/40 uppercase hover:border-cyan-300/40 hover:text-cyan-200"
            title="Configure Gemini API Key"
          >
            ⚙ Key
          </button>
        )}

        {error && (
          <span className="mono max-w-[320px] truncate text-[11px] text-red-300/80" title={error}>
            {error}
          </span>
        )}
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${sessionAlive ? "" : "opacity-30"}`}
            style={{
              background: sessionAlive ? "var(--state-color)" : "#7b8794",
              boxShadow: sessionAlive ? "0 0 10px var(--state-color)" : "none",
            }}
          />
          <span className="mono text-[10px] tracking-[0.25em] text-white/40 uppercase">
            {sessionAlive ? (mirroring ? "Linked" : "Online") : "Standby"}
          </span>
        </div>
        <Clock />
        <div className="flex items-center gap-2.5 border-l border-white/10 pl-4">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.05]">
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[10px] font-semibold text-cyan-200/70">
                  {(profile?.displayName ?? user?.email ?? "O")[0]?.toUpperCase()}
                </span>
              )}
            </span>
            <span className="mono max-w-[160px] truncate text-[11px] text-white/40">
              {profile?.displayName ?? user?.email ?? "operator"}
            </span>
          </span>
          <Link
            href="/profile"
            className="mono rounded border border-cyan-300/20 bg-cyan-400/[0.06] px-2 py-1 text-[9.5px] tracking-[0.2em] text-cyan-200/70 uppercase transition hover:border-cyan-300/45 hover:bg-cyan-400/15 hover:text-cyan-100"
          >
            Edit profile
          </Link>
          <button
            onClick={() => void signOut()}
            className="mono rounded border border-white/10 px-2 py-1 text-[9.5px] tracking-[0.2em] text-white/35 uppercase transition hover:border-red-300/40 hover:text-red-300/80"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span suppressHydrationWarning className="mono text-[11px] text-white/35">
      {time}
    </span>
  );
}

// Backwards compatibility alias
export const JarvisApp = BublooApp;
