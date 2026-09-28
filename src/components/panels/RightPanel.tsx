"use client";

import { useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Mic,
  Crosshair,
  Sparkles,
  Wrench,
  Zap,
  ListChecks,
  MessageSquare,
  CircleStop,
  KeyRound,
  PlugZap,
  CircleCheck,
  TriangleAlert,
  Newspaper,
  Activity,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

const KIND_META: Record<string, { icon: React.ReactNode; color: string }> = {
  user_spoke: { icon: <Mic />, color: "text-sky-300" },
  intent_detected: { icon: <Crosshair />, color: "text-violet-300" },
  planning: { icon: <Sparkles />, color: "text-violet-300" },
  tool_selected: { icon: <Wrench />, color: "text-amber-300" },
  executing: { icon: <Zap />, color: "text-amber-300" },
  results: { icon: <ListChecks />, color: "text-emerald-300" },
  response_generated: { icon: <MessageSquare />, color: "text-cyan-300" },
  speech_interrupted: { icon: <CircleStop />, color: "text-red-300" },
  auth_requested: { icon: <KeyRound />, color: "text-amber-300" },
  connected: { icon: <PlugZap />, color: "text-emerald-300" },
  completed: { icon: <CircleCheck />, color: "text-emerald-300" },
  error: { icon: <TriangleAlert />, color: "text-red-300" },
  memory_updated: { icon: <Brain />, color: "text-fuchsia-300" },
  briefing: { icon: <Newspaper />, color: "text-cyan-300" },
};

const CATEGORY_LABELS: Record<string, string> = {
  preference: "Preferences",
  project: "Projects",
  fact: "Facts",
  context: "Working Context",
  service: "Services",
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function RightPanel() {
  const facts = useQuery(api.memory.list) ?? [];
  const events = useQuery(api.timeline.list) ?? [];

  const grouped = new Map<string, typeof facts>();
  for (const f of facts) {
    const list = grouped.get(f.category) ?? [];
    list.push(f);
    grouped.set(f.category, list);
  }

  return (
    <aside className="flex min-h-0 flex-col gap-3">
      {/* Memory */}
      <section className="glass-card flex max-h-[44%] min-h-[160px] flex-col p-3.5">
        <div className="mb-2.5 flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-white/35" />
          <h3 className="label-xs">Memory</h3>
          <span className="mono ml-auto text-[10px] text-white/25">{facts.length} facts</span>
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto">
          {facts.length === 0 && (
            <p className="text-[11.5px] text-white/25">
              Nothing yet. Tell Bubloo something to remember.
            </p>
          )}
          {[...grouped.entries()].map(([category, items]) => (
            <div key={category}>
              <p className="label-xs mb-1.5 !text-[9px] !text-white/25">
                {CATEGORY_LABELS[category] ?? category}
              </p>
              <AnimatePresence initial={false}>
                {items.map((f) => (
                  <motion.div
                    key={f._id}
                    layout
                    initial={{ opacity: 0, x: 16, filter: "blur(4px)" }}
                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.35 }}
                    className="mb-1.5 rounded-lg border border-white/[0.05] bg-white/[0.025] px-2.5 py-1.5"
                  >
                    <p className="text-[10.5px] tracking-wide text-white/35 capitalize">{f.key}</p>
                    <p className="text-[12.5px] text-white/80">{f.value}</p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>

      {/* Activity timeline */}
      <section className="glass-card flex min-h-0 flex-1 flex-col p-3.5">
        <div className="mb-2.5 flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-white/35" />
          <h3 className="label-xs">System Activity</h3>
        </div>
        <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,black_85%,transparent)]">
          {/* spine */}
          <div className="absolute top-1 bottom-1 left-[7px] w-px bg-white/[0.07]" />
          <AnimatePresence initial={false}>
            {events.map((e) => {
              const meta = KIND_META[e.kind] ?? { icon: <Activity />, color: "text-white/40" };
              return (
                <motion.div
                  key={e._id}
                  layout
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="relative mb-2.5 flex gap-2.5 pl-0.5"
                >
                  <span
                    className={`z-10 mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#0a0f18] ${meta.color} [&>svg]:h-3 [&>svg]:w-3`}
                  >
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[12px] font-medium text-white/75">{e.label}</p>
                      <span className="mono ml-auto shrink-0 text-[9.5px] text-white/25">
                        {timeAgo(e.createdAt)}
                      </span>
                    </div>
                    {e.detail && (
                      <p className="truncate text-[11px] text-white/35">{e.detail}</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </section>
    </aside>
  );
}
