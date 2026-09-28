"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { OrbState } from "@/lib/types";

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#+\s+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[-*+]\s+/g, "")
    .trim();
}

export function useGeminiSession() {
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [orbState, setOrbStateRaw] = useState<OrbState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [interimText, setInterimText] = useState<string>("");

  const activeRef = useRef(false);
  const orbStateRef = useRef<OrbState>("idle");
  const isSpeakingRef = useRef(false);
  const isListeningRef = useRef(false);

  const accumulatedTextRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authToken = useAuthToken();
  const authTokenRef = useRef<string | null>(null);
  authTokenRef.current = authToken ?? null;

  const finalizeMessage = useMutation(api.messages.finalize);
  const logTimeline = useMutation(api.timeline.log);
  const setVoiceState = useMutation(api.voiceState.set);

  const recognitionRef = useRef<any>(null);
  const historyRef = useRef<Array<{ role: string; content: string }>>([]);

  // Pre-load voices for SpeechSynthesis
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.getVoices();
        };
      }
    }
  }, []);

  const setOrb = useCallback(
    (state: OrbState, opts?: { flashBackTo?: OrbState; flashMs?: number }) => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      orbStateRef.current = state;
      setOrbStateRaw(state);
      void setVoiceState({ orbState: state, sessionActive: activeRef.current }).catch(() => {});
      if (opts?.flashBackTo) {
        flashTimerRef.current = setTimeout(() => {
          orbStateRef.current = opts.flashBackTo!;
          setOrbStateRaw(opts.flashBackTo!);
          void setVoiceState({ orbState: opts.flashBackTo!, sessionActive: activeRef.current }).catch(() => {});
        }, opts.flashMs ?? 1000);
      }
    },
    [setVoiceState]
  );

  const getLevel = useCallback(() => {
    if (orbState === "speaking") {
      const t = performance.now() / 1000;
      return 0.35 + 0.25 * Math.sin(t * 8) + 0.15 * Math.sin(t * 17);
    }
    if (orbState === "listening") {
      const t = performance.now() / 1000;
      return interimText ? 0.3 + 0.2 * Math.sin(t * 10) : 0.15 + 0.1 * Math.sin(t * 5);
    }
    return 0;
  }, [orbState, interimText]);

  const startListening = useCallback(() => {
    if (typeof window === "undefined" || !activeRef.current || isSpeakingRef.current) {
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(
        "Voice recognition requires Google Chrome, Microsoft Edge, or Brave. Please open this app in Chrome or Edge."
      );
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      accumulatedTextRef.current = "";
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        isListeningRef.current = true;
        setOrb("listening");
        setError(null);
      };

      rec.onresult = (event: any) => {
        let interim = "";
        let finalChunk = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            finalChunk += res[0].transcript + " ";
          } else {
            interim += res[0].transcript;
          }
        }

        if (finalChunk) {
          accumulatedTextRef.current = (accumulatedTextRef.current + " " + finalChunk).trim();
        }

        const fullDisplay = (accumulatedTextRef.current + " " + interim).trim();
        setInterimText(fullDisplay);

        // Reset silence timer on every spoken word
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        silenceTimerRef.current = setTimeout(() => {
          const textToSend = (accumulatedTextRef.current + " " + interim).trim();
          if (textToSend.length >= 2) {
            accumulatedTextRef.current = "";
            setInterimText("");
            try {
              rec.stop();
            } catch {}
            void sendQuery(textToSend);
          }
        }, 1100);
      };

      rec.onerror = (e: any) => {
        console.warn("Speech recognition event:", e.error);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setError(
            "Microphone permission blocked. Click the lock/tune icon in your browser URL bar and allow Microphone."
          );
          setOrb("error", { flashBackTo: "idle", flashMs: 4000 });
        } else if (e.error === "audio-capture") {
          setError("Microphone hardware was not detected or is in use by another app.");
          setOrb("error", { flashBackTo: "idle", flashMs: 3000 });
        } else if (e.error === "network") {
          setError("Speech recognition service network issue. Please check your internet or type commands.");
        }
      };

      rec.onend = () => {
        isListeningRef.current = false;
        // Check if there was any pending uncommitted speech
        const pending = (accumulatedTextRef.current || "").trim();
        if (pending.length >= 2) {
          accumulatedTextRef.current = "";
          setInterimText("");
          void sendQuery(pending);
          return;
        }

        // Keep listening loop alive if user didn't deactivate
        if (activeRef.current && !isSpeakingRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (activeRef.current && !isSpeakingRef.current) {
              startListening();
            }
          }, 300);
        } else {
          setOrb("idle");
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err: any) {
      console.warn("Recognition start catch:", err);
      if (activeRef.current && !isSpeakingRef.current) {
        setTimeout(() => {
          if (activeRef.current && !isSpeakingRef.current) startListening();
        }, 800);
      }
    }
  }, [setOrb]); // sendQuery referenced via hoist

  const speakText = useCallback(
    (text: string, onEnd?: () => void) => {
      const finishSpeaking = () => {
        isSpeakingRef.current = false;
        setOrb("idle");
        onEnd?.();
        if (activeRef.current) {
          setTimeout(() => {
            if (activeRef.current && !isSpeakingRef.current) {
              startListening();
            }
          }, 400);
        }
      };

      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        finishSpeaking();
        return;
      }

      const cleanText = stripMarkdown(text);
      if (!cleanText) {
        finishSpeaking();
        return;
      }

      // Cancel any ongoing speech before starting new one
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }

      isSpeakingRef.current = true;

      // Stop recognition to avoid feedback loop
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      // Short delay for Chrome/Windows to flush cancel before speaking
      setTimeout(() => {
        try {
          if (!isSpeakingRef.current) return; // Guard if deactivated

          const utterance = new SpeechSynthesisUtterance(cleanText);
          utterance.rate = 1.05;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;

          const voices = window.speechSynthesis.getVoices();
          const preferredVoice =
            voices.find(
              (v) =>
                v.lang.startsWith("en-GB") ||
                v.name.toLowerCase().includes("natural") ||
                v.name.toLowerCase().includes("google")
            ) || voices.find((v) => v.lang.startsWith("en"));

          if (preferredVoice) utterance.voice = preferredVoice;

          setOrb("speaking");

          utterance.onend = () => {
            finishSpeaking();
          };

          utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
            // "interrupted" and "canceled" fire when cancel() is called intentionally — not real errors
            const errCode = String(e.error);
            if (errCode === "interrupted" || errCode === "canceled" || errCode === "cancelled") {
              finishSpeaking();
              return;
            }
            console.warn("SpeechSynthesis non-fatal error:", errCode);
            finishSpeaking();
          };

          window.speechSynthesis.speak(utterance);

          // Watchdog: Chrome sometimes fires neither onend nor onerror — detect stall
          const maxDuration = Math.max(4000, cleanText.length * 80);
          const watchdog = setTimeout(() => {
            if (isSpeakingRef.current) {
              console.warn("SpeechSynthesis watchdog triggered — forcing finish");
              window.speechSynthesis.cancel();
              finishSpeaking();
            }
          }, maxDuration);

          utterance.onend = () => {
            clearTimeout(watchdog);
            finishSpeaking();
          };
        } catch (err) {
          console.warn("SpeechSynthesis speak() failed:", err);
          finishSpeaking();
        }
      }, 80);
    },
    [setOrb, startListening]
  );

  const sendQuery = useCallback(
    async (userInput: string) => {
      if (!userInput.trim()) return;

      const token = authTokenRef.current;
      if (!token) {
        setError("Not authenticated");
        return;
      }

      setError(null);
      setOrb("thinking");

      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const userItemId = `user-${Date.now()}`;
      void finalizeMessage({ itemId: userItemId, role: "user", text: userInput }).catch(() => {});
      void logTimeline({ kind: "user_spoke", label: "User spoke", detail: userInput }).catch(() => {});

      try {
        const customApiKey = localStorage.getItem("jarvis_gemini_api_key") || "";
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        };
        if (customApiKey) headers["x-gemini-api-key"] = customApiKey;

        const response = await fetch("/api/gemini/chat", {
          method: "POST",
          headers,
          body: JSON.stringify({
            message: userInput,
            history: historyRef.current,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Gemini request failed (${response.status})`);
        }

        const data = await response.json();
        const assistantText = data.text || "Command executed, sir.";

        historyRef.current.push({ role: "user", content: userInput });
        historyRef.current.push({ role: "assistant", content: assistantText });
        if (historyRef.current.length > 20) {
          historyRef.current = historyRef.current.slice(-20);
        }

        if (Array.isArray(data.executedTools)) {
          for (const tool of data.executedTools) {
            void logTimeline({
              kind: "intent_detected",
              label: `Action: ${tool.name}`,
              detail: JSON.stringify(tool.args),
            }).catch(() => {});
          }
        }

        const assistantItemId = `assistant-${Date.now()}`;
        void finalizeMessage({
          itemId: assistantItemId,
          role: "assistant",
          text: assistantText,
        }).catch(() => {});
        void logTimeline({ kind: "response_generated", label: "Bubloo responded" }).catch(() => {});

        speakText(assistantText);
      } catch (err: any) {
        let msg = err.message || "Error reaching Gemini API";
        try {
          const parsed = JSON.parse(msg);
          if (parsed.error) {
            msg = typeof parsed.error === "string" ? parsed.error : parsed.error.message || msg;
          }
        } catch {}
        if (
          msg.includes("429") ||
          msg.includes("quota") ||
          msg.includes("RESOURCE_EXHAUSTED")
        ) {
          msg = "Gemini free-tier rate limit reached. Please wait a few seconds before trying again.";
        }
        setError(msg);
        setOrb("error", { flashBackTo: "idle", flashMs: 3000 });
      }
    },
    [finalizeMessage, logTimeline, setOrb, speakText]
  );

  const activate = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      // 1. Explicitly request permission and release track to avoid locking audio device
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        } catch (micErr: any) {
          console.warn("Microphone permission check:", micErr);
          if (micErr.name === "NotAllowedError" || micErr.name === "PermissionDeniedError") {
            throw new Error(
              "Microphone permission blocked. Please click the lock icon in your URL bar and allow Microphone."
            );
          }
        }
      }

      activeRef.current = true;
      setActive(true);
      setOrb("idle");
      void logTimeline({ kind: "completed", label: "Bubloo online (Gemini Engine)" }).catch(() => {});

      // 2. Start continuous voice listener
      startListening();
    } catch (err: any) {
      setError(err.message || "Failed to activate voice recognition");
      setOrb("error", { flashBackTo: "idle", flashMs: 3000 });
      activeRef.current = false;
      setActive(false);
    } finally {
      setConnecting(false);
    }
  }, [logTimeline, setOrb, startListening]);

  const deactivate = useCallback(() => {
    activeRef.current = false;
    isSpeakingRef.current = false;
    isListeningRef.current = false;
    setActive(false);
    setOrb("idle");
    setInterimText("");

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    void setVoiceState({ orbState: "idle", sessionActive: false }).catch(() => {});
  }, [setOrb, setVoiceState]);

  const notifySystem = useCallback(
    (message: string) => {
      void sendQuery(`[SYSTEM NOTIFICATION]: ${message}`);
    },
    [sendQuery]
  );

  return {
    active,
    connecting,
    orbState,
    error,
    interimText,
    activate,
    deactivate,
    getLevel,
    notifySystem,
    sendQuery,
    startListening,
  };
}
