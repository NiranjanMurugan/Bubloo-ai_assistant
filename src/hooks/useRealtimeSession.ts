"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { OrbState } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RealtimeSession {
  orbState: OrbState;
  active: boolean;
  connecting: boolean;
  error: string | null;
  activate: () => Promise<void>;
  deactivate: () => void;
  getLevel: () => number;
  /** Inject a system note (e.g. "Gmail connected") and have Jarvis respond. */
  notifySystem: (text: string) => void;
}

function rms(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
}

export function useRealtimeSession(): RealtimeSession {
  const [orbState, setOrbStateRaw] = useState<OrbState>("idle");
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const levelBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const orbStateRef = useRef<OrbState>("idle");
  const speakingRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // call_id -> tool name, populated from response.output_item.added
  const callNamesRef = useRef<Map<string, string>>(new Map());
  // itemId -> accumulated transcript text
  const textAccumRef = useRef<Map<string, string>>(new Map());
  const flushTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const authToken = useAuthToken();
  const authTokenRef = useRef<string | null>(null);
  authTokenRef.current = authToken ?? null;

  const executeTool = useAction(api.tools.execute);
  const upsertStreaming = useMutation(api.messages.upsertStreaming);
  const finalizeMessage = useMutation(api.messages.finalize);
  const logTimeline = useMutation(api.timeline.log);
  const setVoiceState = useMutation(api.voiceState.set);

  const setOrb = useCallback(
    (state: OrbState, opts?: { flashBackTo?: OrbState; flashMs?: number }) => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      orbStateRef.current = state;
      setOrbStateRaw(state);
      void setVoiceState({ orbState: state, sessionActive: true }).catch(() => {});
      if (opts?.flashBackTo) {
        flashTimerRef.current = setTimeout(() => {
          orbStateRef.current = opts.flashBackTo!;
          setOrbStateRaw(opts.flashBackTo!);
          void setVoiceState({ orbState: opts.flashBackTo!, sessionActive: true }).catch(() => {});
        }, opts.flashMs ?? 1000);
      }
    },
    [setVoiceState]
  );

  /* -------------------------------------------------------------- */
  /* Transcript streaming (throttled per item)                       */
  /* -------------------------------------------------------------- */

  const streamText = useCallback(
    (itemId: string, role: "user" | "assistant", delta: string) => {
      const acc = (textAccumRef.current.get(itemId) ?? "") + delta;
      textAccumRef.current.set(itemId, acc);
      if (!flushTimersRef.current.has(itemId)) {
        flushTimersRef.current.set(
          itemId,
          setTimeout(() => {
            flushTimersRef.current.delete(itemId);
            const text = textAccumRef.current.get(itemId) ?? "";
            void upsertStreaming({ itemId, role, text }).catch(() => {});
          }, 140)
        );
      }
    },
    [upsertStreaming]
  );

  const finishText = useCallback(
    (itemId: string, role: "user" | "assistant", finalText: string | undefined, interrupted = false) => {
      const timer = flushTimersRef.current.get(itemId);
      if (timer) {
        clearTimeout(timer);
        flushTimersRef.current.delete(itemId);
      }
      const text = finalText ?? textAccumRef.current.get(itemId) ?? "";
      textAccumRef.current.delete(itemId);
      if (text.trim().length === 0) return;
      void finalizeMessage({ itemId, role, text, interrupted }).catch(() => {});
    },
    [finalizeMessage]
  );

  /* -------------------------------------------------------------- */
  /* Data channel event router                                       */
  /* -------------------------------------------------------------- */

  const send = useCallback((event: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") dc.send(JSON.stringify(event));
  }, []);

  const handleToolCall = useCallback(
    async (callId: string, name: string, argsJson: string) => {
      setOrb("executing");
      let args: unknown = {};
      try {
        args = JSON.parse(argsJson || "{}");
      } catch {
        /* leave empty */
      }
      let result: Record<string, unknown>;
      try {
        result = await executeTool({ name, arguments: args });
      } catch (err) {
        result = { error: "execution_error", message: err instanceof Error ? err.message : String(err) };
      }
      if (result && (result as any).ok) {
        setOrb("success", { flashBackTo: "thinking", flashMs: 900 });
      } else {
        setOrb("thinking");
      }
      send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result).slice(0, 30000),
        },
      });
      send({ type: "response.create" });
    },
    [executeTool, send, setOrb]
  );

  const handleServerEvent = useCallback(
    (event: any) => {
      switch (event.type) {
        case "session.created":
          void logTimeline({ kind: "completed", label: "Jarvis online", detail: "Realtime link established" }).catch(() => {});
          break;

        case "input_audio_buffer.speech_started": {
          if (speakingRef.current) {
            // Barge-in: server cancels the response; clear buffered audio now.
            send({ type: "output_audio_buffer.clear" });
            void logTimeline({ kind: "speech_interrupted", label: "Speech interrupted", detail: "User barge-in" }).catch(() => {});
            speakingRef.current = false;
          }
          setOrb("listening");
          break;
        }

        case "input_audio_buffer.speech_stopped":
          if (orbStateRef.current === "listening") setOrb("thinking");
          break;

        case "conversation.item.input_audio_transcription.delta":
          if (event.delta) streamText(event.item_id, "user", event.delta);
          break;

        case "conversation.item.input_audio_transcription.completed": {
          finishText(event.item_id, "user", event.transcript);
          const snippet = (event.transcript ?? "").slice(0, 80);
          if (snippet.trim()) {
            void logTimeline({ kind: "user_spoke", label: "User spoke", detail: snippet }).catch(() => {});
          }
          break;
        }

        case "response.created":
          if (orbStateRef.current !== "executing") setOrb("thinking");
          void logTimeline({ kind: "planning", label: "Planning response" }).catch(() => {});
          break;

        case "response.output_item.added": {
          const item = event.item;
          if (item?.type === "function_call" && item.call_id) {
            callNamesRef.current.set(item.call_id, item.name);
            void logTimeline({
              kind: "intent_detected",
              label: "Intent detected",
              detail: String(item.name ?? "").replace(/_/g, " "),
            }).catch(() => {});
          }
          break;
        }

        case "response.function_call_arguments.done": {
          const name = event.name ?? callNamesRef.current.get(event.call_id) ?? "unknown";
          void handleToolCall(event.call_id, name, event.arguments ?? "{}");
          break;
        }

        case "response.output_audio_transcript.delta":
          if (!speakingRef.current) {
            speakingRef.current = true;
            setOrb("speaking");
          }
          if (event.delta) streamText(event.item_id, "assistant", event.delta);
          break;

        case "response.output_audio_transcript.done":
          finishText(event.item_id, "assistant", event.transcript);
          break;

        case "output_audio_buffer.started":
          speakingRef.current = true;
          setOrb("speaking");
          break;

        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          speakingRef.current = false;
          if (orbStateRef.current === "speaking") setOrb("idle");
          break;

        case "response.done": {
          void logTimeline({ kind: "response_generated", label: "Response generated" }).catch(() => {});
          if (!speakingRef.current && orbStateRef.current !== "executing") {
            setOrb("idle");
          }
          break;
        }

        case "error": {
          const message = event.error?.message ?? "Realtime error";
          // Benign cancellation races happen during barge-in; ignore them.
          if (!/cancell?ation|no active response/i.test(message)) {
            console.warn("[jarvis] realtime error:", event.error);
            setOrb("error", { flashBackTo: "idle", flashMs: 1400 });
          }
          break;
        }
      }
    },
    [finishText, handleToolCall, logTimeline, send, setOrb, streamText]
  );

  /* -------------------------------------------------------------- */
  /* Session lifecycle                                                */
  /* -------------------------------------------------------------- */

  const deactivate = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    void audioCtxRef.current?.close().catch(() => {});
    dcRef.current = null;
    pcRef.current = null;
    micStreamRef.current = null;
    audioCtxRef.current = null;
    micAnalyserRef.current = null;
    outAnalyserRef.current = null;
    speakingRef.current = false;
    setActive(false);
    orbStateRef.current = "idle";
    setOrbStateRaw("idle");
    void setVoiceState({ orbState: "idle", sessionActive: false }).catch(() => {});
  }, [setVoiceState]);

  const activate = useCallback(async () => {
    if (active || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      // 1. Ephemeral token (authenticated request)
      const tokenRes = await fetch("/api/realtime/token", {
        method: "POST",
        headers: authTokenRef.current
          ? { Authorization: `Bearer ${authTokenRef.current}` }
          : undefined,
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error ?? "Token request failed");
      const ephemeralKey: string = tokenData.value ?? tokenData.client_secret?.value;
      if (!ephemeralKey) throw new Error("No client secret in token response");

      // 2. Mic + peer connection
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 512;
      audioCtx.createMediaStreamSource(micStream).connect(micAnalyser);
      micAnalyserRef.current = micAnalyser;
      levelBufRef.current = new Uint8Array(new ArrayBuffer(512));

      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
        const outAnalyser = audioCtx.createAnalyser();
        outAnalyser.fftSize = 512;
        audioCtx.createMediaStreamSource(e.streams[0]).connect(outAnalyser);
        outAnalyserRef.current = outAnalyser;
      };
      pc.addTrack(micStream.getAudioTracks()[0], micStream);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.addEventListener("message", (e) => {
        try {
          handleServerEvent(JSON.parse(e.data));
        } catch {
          /* ignore malformed */
        }
      });

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          deactivate();
        }
      };

      // 3. SDP exchange
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls?model=gpt-realtime", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        console.error("OpenAI SDP exchange failed:", sdpResponse.status, errorText);
        throw new Error(
          sdpResponse.status === 429
            ? "OpenAI Quota/Rate limit exceeded (429). Check your OpenAI credit balance or tier."
            : `SDP exchange failed (${sdpResponse.status}): ${errorText}`
        );
      }
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });

      setActive(true);
      setOrb("idle");
      void setVoiceState({ orbState: "idle", sessionActive: true }).catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setOrb("error", { flashBackTo: "idle", flashMs: 2000 });
      deactivate();
    } finally {
      setConnecting(false);
    }
  }, [active, connecting, deactivate, handleServerEvent, setOrb, setVoiceState]);

  const notifySystem = useCallback(
    (text: string) => {
      send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [{ type: "input_text", text }],
        },
      });
      send({ type: "response.create" });
    },
    [send]
  );

  const getLevel = useCallback((): number => {
    const buf = levelBufRef.current;
    if (!buf) return 0;
    const state = orbStateRef.current;
    if (state === "speaking" && outAnalyserRef.current) {
      return rms(outAnalyserRef.current, buf);
    }
    if ((state === "listening" || state === "idle") && micAnalyserRef.current) {
      return rms(micAnalyserRef.current, buf) * (state === "idle" ? 0.4 : 1);
    }
    return 0;
  }, []);

  // Heartbeat while hosting a session so mirror tabs can detect staleness.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      void setVoiceState({ orbState: orbStateRef.current, sessionActive: true }).catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, [active, setVoiceState]);

  // Cleanup on unmount / tab close.
  useEffect(() => {
    const onUnload = () => {
      void setVoiceState({ orbState: "idle", sessionActive: false }).catch(() => {});
    };
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
    };
  }, [setVoiceState]);

  return { orbState, active, connecting, error, activate, deactivate, getLevel, notifySystem };
}
