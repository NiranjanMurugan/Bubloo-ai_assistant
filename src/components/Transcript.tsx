"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "convex/react";
import { Mic, MicOff, Send } from "lucide-react";
import { api } from "../../convex/_generated/api";

const QUICK_COMMANDS = [
  "Open Notepad",
  "Open Settings",
  "Open This PC",
  "Volume up",
  "Mute",
];

interface TranscriptProps {
  onSendText?: (text: string) => void;
  onMicClick?: () => void;
  isListening?: boolean;
  interimText?: string;
}

export function Transcript({
  onSendText,
  onMicClick,
  isListening,
  interimText,
}: TranscriptProps) {
  const messages = useQuery(api.messages.list) ?? [];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !onSendText) return;
    onSendText(input.trim());
    setInput("");
  };

  const handleChipClick = (cmd: string) => {
    if (onSendText) {
      onSendText(cmd);
    } else {
      setInput(cmd);
    }
  };

  return (
    <div className="flex w-full max-w-[640px] flex-1 flex-col justify-between overflow-hidden pb-4">
      <div
        ref={scrollRef}
        className="scroll-thin mt-2 w-full flex-1 space-y-3 overflow-y-auto pb-4 [mask-image:linear-gradient(to_bottom,transparent,black_28px)]"
      >
        {messages.length === 0 && (
          <div className="pt-8 text-center space-y-3">
            <p className="text-[13px] text-white/40">
              Activate Bubloo, speak with your microphone, or choose a command below.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
              {QUICK_COMMANDS.map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => handleChipClick(cmd)}
                  className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-mono text-cyan-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/20"
                >
                  ✦ {cmd}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-md border border-white/10 bg-white/[0.06] text-white/85"
                    : "rounded-bl-md border border-cyan-200/10 bg-cyan-400/[0.05] text-cyan-50/90"
                }`}
              >
                {m.role === "assistant" && (
                  <span className="label-xs mb-1 block !text-[9px] text-cyan-200/40">Bubloo</span>
                )}
                <span className="whitespace-pre-wrap">{m.text}</span>
                {m.status === "streaming" && (
                  <span className="blink ml-1 inline-block h-3 w-[2px] translate-y-[2px] bg-current" />
                )}
                {m.status === "interrupted" && (
                  <span className="mono ml-2 text-[10px] text-white/30">— interrupted</span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Quick command suggestions bar */}
      {messages.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5 overflow-x-auto scroll-none py-1">
          <span className="text-[10px] uppercase font-mono tracking-widest text-white/30 shrink-0">
            Quick:
          </span>
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              onClick={() => handleChipClick(cmd)}
              className="shrink-0 rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10.5px] font-mono text-white/60 transition hover:border-cyan-400/40 hover:text-cyan-200 hover:bg-cyan-500/10"
            >
              {cmd}
            </button>
          ))}
        </div>
      )}

      {/* Live speech feedback */}
      {interimText ? (
        <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3.5 py-2 text-[12.5px] font-mono text-cyan-200 shadow-[0_0_20px_rgba(69,216,255,0.15)] animate-pulse">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
          </span>
          <span className="text-white/50 text-[11px] uppercase tracking-wider shrink-0">Hearing:</span>
          <span className="text-white font-medium truncate">&ldquo;{interimText}&rdquo;</span>
        </div>
      ) : isListening ? (
        <div className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-mono text-cyan-300/60">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
          <span>Listening... speak your command now</span>
        </div>
      ) : null}

      {onSendText && (
        <form onSubmit={handleSubmit} className="mt-1 flex items-center gap-2">
          {onMicClick && (
            <button
              type="button"
              onClick={onMicClick}
              title={isListening ? "Listening... click to toggle" : "Click to speak"}
              className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border transition ${
                isListening
                  ? "border-cyan-400 bg-cyan-400/25 text-cyan-100 shadow-[0_0_15px_rgba(69,216,255,0.4)] animate-pulse"
                  : "border-white/10 bg-white/[0.04] text-white/50 hover:border-cyan-300/40 hover:text-cyan-200 hover:bg-cyan-400/10"
              }`}
            >
              {isListening ? <Mic className="h-4 w-4 text-cyan-300" /> : <MicOff className="h-4 w-4" />}
            </button>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command or speak (e.g. 'open notepad', 'volume up')..."
            className="mono w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-[12.5px] text-white/90 placeholder-white/25 outline-none transition focus:border-cyan-300/40 focus:bg-cyan-400/[0.05]"
          />

          <button
            type="submit"
            disabled={!input.trim()}
            className="flex h-[38px] items-center gap-1.5 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 font-mono text-[11px] tracking-wider text-cyan-100 uppercase transition hover:bg-cyan-400/20 disabled:opacity-30"
          >
            <span>Send</span>
            <Send className="h-3 w-3" />
          </button>
        </form>
      )}
    </div>
  );
}
