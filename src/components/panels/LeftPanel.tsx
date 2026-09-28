"use client";

import { useQuery, useAction } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Calendar,
  SquareCheck,
  FileText,
  Plug,
  Target,
  ExternalLink,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { GlassCard } from "../GlassCard";

/* eslint-disable @typescript-eslint/no-explicit-any */

function timeAgo(ts?: number): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function eventTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function LeftPanel() {
  const dashboard = useQuery(api.dashboard.getAll) ?? {};
  const objective = useQuery(api.objective.get);
  const connections = useQuery(api.connections.list) ?? [];
  const todos = useQuery(api.todos.list);

  const emails = dashboard.emails?.data as any;
  const calendar = dashboard.calendar?.data as any;
  const notes = dashboard.notes?.data as any;

  return (
    <aside className="scroll-thin flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
      {/* Current objective */}
      <section
        className="glass-card relative overflow-hidden p-4"
        style={
          objective?.state !== "idle"
            ? { borderColor: "var(--state-glow)", boxShadow: "inset 0 0 30px var(--state-glow)" }
            : undefined
        }
      >
        <div className="mb-1.5 flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-white/35" />
          <h3 className="label-xs">Current Objective</h3>
          {objective?.state === "working" && (
            <span className="ml-auto h-1.5 w-1.5 animate-ping rounded-full" style={{ background: "var(--state-color)" }} />
          )}
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={objective?.text ?? "…"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className={`text-[15px] font-medium ${
              objective?.state === "working"
                ? "shimmer-text"
                : objective?.state === "waiting_auth"
                  ? "text-amber-200/90"
                  : "text-white/75"
            }`}
          >
            {objective?.text ?? "Standing by"}
          </motion.p>
        </AnimatePresence>
      </section>

      {/* Emails */}
      <GlassCard title="Emails" icon={<Mail />} pulseKey={dashboard.emails?.updatedAt}>
        {emails ? (
          <div className="space-y-2.5">
            <div className="flex items-baseline gap-2">
              <AnimatedNumber value={emails.unread ?? 0} />
              <span className="text-[11px] text-white/40">unread</span>
              <span className="mono ml-auto text-[10px] text-white/25">
                sync {timeAgo(emails.lastSync)}
              </span>
            </div>
            <div className="space-y-1.5">
              {(emails.important ?? []).slice(0, 3).map((e: any, i: number) => (
                <div key={i} className="truncate text-[12px]">
                  <span className="text-white/70">{e.subject}</span>
                  <span className="ml-1.5 text-white/30">{shortSender(e.from)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty text="Ask Bubloo to check your inbox" />
        )}
      </GlassCard>

      {/* Calendar */}
      <GlassCard title="Calendar" icon={<Calendar />} pulseKey={dashboard.calendar?.updatedAt}>
        {calendar ? (
          <div className="space-y-2.5">
            <div className="flex items-baseline gap-2">
              <AnimatedNumber value={calendar.todayCount ?? 0} />
              <span className="text-[11px] text-white/40">events today</span>
              <span className="mono ml-auto text-[10px] text-white/25">
                sync {timeAgo(calendar.lastSync)}
              </span>
            </div>
            {calendar.nextMeeting && (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-2">
                <p className="label-xs !text-[9px]">Next</p>
                <p className="truncate text-[12.5px] text-white/80">{calendar.nextMeeting.title}</p>
                <p className="mono text-[10.5px] text-white/35">{eventTime(calendar.nextMeeting.start)}</p>
              </div>
            )}
            <div className="space-y-1">
              {(calendar.upcoming ?? []).slice(1, 4).map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span className="mono text-[10px] text-white/30">{eventTime(e.start)}</span>
                  <span className="truncate text-white/60">{e.title}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty text="Ask about today's meetings" />
        )}
      </GlassCard>

      {/* To-dos (native, Convex-backed) */}
      <GlassCard
        title="To-Dos"
        icon={<SquareCheck />}
        pulseKey={
          todos
            ? `${todos.pending.map((t) => t._id).join()}|${todos.done.map((t) => t._id).join()}`
            : undefined
        }
      >
        {todos && (todos.pending.length || todos.done.length) ? (
          <div className="space-y-1.5">
            <AnimatePresence initial={false}>
              {todos.pending.slice(0, 6).map((t) => (
                <motion.div
                  key={t._id}
                  layout
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 14 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-2 text-[12.5px]"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      t.priority === "high"
                        ? "bg-red-400"
                        : t.priority === "low"
                          ? "bg-white/25"
                          : "bg-cyan-300/70"
                    }`}
                  />
                  <span className="truncate text-white/70">{t.title}</span>
                  {t.dueAt && <DueChip dueAt={t.dueAt} />}
                </motion.div>
              ))}
              {todos.done.slice(0, 2).map((t) => (
                <motion.div
                  key={t._id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-2 text-[12.5px]"
                >
                  <SquareCheck className="h-3 w-3 shrink-0 text-emerald-300" />
                  <span className="truncate line-through">{t.title}</span>
                </motion.div>
              ))}
            </AnimatePresence>
            {todos.pending.length > 6 && (
              <p className="mono pt-0.5 text-[10px] text-white/25">
                +{todos.pending.length - 6} more pending
              </p>
            )}
          </div>
        ) : (
          <Empty text='Say "add a to-do" to get started' />
        )}
      </GlassCard>

      {/* Notes */}
      <GlassCard title="Notes" icon={<FileText />} pulseKey={dashboard.notes?.updatedAt}>
        {notes ? (
          <div className="space-y-1.5">
            {(notes.recent ?? []).slice(0, 4).map((n: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 text-[12.5px]">
                <span className="truncate text-white/70">{n.title}</span>
                {n.url && (
                  <a href={n.url} target="_blank" rel="noreferrer" className="text-white/25 hover:text-cyan-300">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
            <p className="mono pt-1 text-[10px] text-white/25">
              {(notes.sources ?? []).join(" · ")} — sync {timeAgo(notes.lastSync)}
            </p>
          </div>
        ) : (
          <Empty text="Ask Bubloo to search your notes" />
        )}
      </GlassCard>

      {/* Connected services */}
      <GlassCard title="Connected Services" icon={<Plug />} pulseKey={connections.map((c) => c.status).join()}>
        <div className="space-y-2">
          {connections.length === 0 && <Empty text="Loading services…" />}
          {connections.map((c) => (
            <ServiceRow key={c.toolkit} connection={c} />
          ))}
        </div>
      </GlassCard>
    </aside>
  );
}

function ServiceRow({ connection: c }: { connection: any }) {
  const checkConnection = useAction(api.composio.checkConnection);
  const initiateConnection = useAction(api.composio.initiateConnection);
  const statusColor =
    c.status === "connected"
      ? "bg-emerald-400"
      : c.status === "pending_auth"
        ? "bg-amber-300 animate-pulse"
        : c.status === "error"
          ? "bg-red-400"
          : "bg-white/20";

  const handleConnect = async () => {
    try {
      const res = await initiateConnection({ toolkit: c.toolkit });
      if (res.ok && res.redirectUrl) {
        window.open(res.redirectUrl, "jarvis-auth", "width=560,height=720");
        setTimeout(() => void checkConnection({ toolkit: c.toolkit }).catch(() => {}), 4000);
      }
    } catch (e) {
      console.error("Connect failed:", e);
    }
  };

  return (
    <div className="flex items-center gap-2.5">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusColor}`} />
      <span className="text-[12.5px] text-white/75">{c.name}</span>
      <span className="mono ml-auto text-[9.5px] tracking-wider text-white/30 uppercase">
        {c.status === "pending_auth" ? "awaiting auth" : c.status}
      </span>
      {c.status === "available" && (
        <button
          onClick={handleConnect}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-cyan-300 transition hover:bg-cyan-500/20 hover:border-cyan-400/40"
        >
          Connect
        </button>
      )}
      {c.status === "pending_auth" && c.authUrl && (
        <button
          onClick={() => {
            window.open(c.authUrl, "jarvis-auth", "width=560,height=720");
            // Nudge a status check shortly after the popup opens.
            setTimeout(() => void checkConnection({ toolkit: c.toolkit }).catch(() => {}), 4000);
          }}
          className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-200 transition hover:bg-amber-300/20"
        >
          Sign in
        </button>
      )}
      {c.status === "connected" && c.lastSync && (
        <span className="mono text-[9.5px] text-white/20">{timeAgo(c.lastSync)}</span>
      )}
    </div>
  );
}

function DueChip({ dueAt }: { dueAt: number }) {
  const now = Date.now();
  const overdue = dueAt < now;
  const d = new Date(dueAt);
  const sameDay = d.toDateString() === new Date().toDateString();
  const label = sameDay
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <span
      className={`mono ml-auto shrink-0 rounded px-1.5 py-px text-[9px] tracking-wide ${
        overdue
          ? "border border-red-400/30 bg-red-400/10 text-red-300"
          : "border border-white/10 bg-white/[0.04] text-white/40"
      }`}
    >
      {overdue ? "overdue" : label}
    </span>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={value}
        initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
        transition={{ duration: 0.35 }}
        className="mono text-2xl font-semibold text-white/90"
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[11.5px] text-white/25">{text}</p>;
}

function shortSender(from?: string): string {
  if (!from) return "";
  const match = from.match(/^([^<]+)</);
  return (match ? match[1] : from).trim().slice(0, 24);
}
