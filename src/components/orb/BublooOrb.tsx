"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { OrbRenderer } from "./orbRenderer";
import { ORB_STATE_LABELS, OrbState } from "@/lib/types";

interface Props {
  state: OrbState;
  /** Returns the current audio level 0..1 (mic while listening, remote while speaking). */
  getLevel: () => number;
  active: boolean;
  onActivate: () => void;
  onDeactivate?: () => void;
  /** True when this tab hosts the live session (vs. mirroring another tab). */
  hosting?: boolean;
  connecting: boolean;
}

export function BublooOrb({
  state,
  getLevel,
  active,
  onActivate,
  onDeactivate,
  hosting,
  connecting,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OrbRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new OrbRenderer(canvas);
    rendererRef.current = renderer;
    renderer.start();

    let raf = 0;
    const pump = () => {
      renderer.setLevel(getLevel());
      raf = requestAnimationFrame(pump);
    };
    raf = requestAnimationFrame(pump);

    return () => {
      cancelAnimationFrame(raf);
      renderer.stop();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setState(state);
  }, [state]);

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative h-[340px] w-[420px] xl:h-[400px] xl:w-[500px]">
        <canvas ref={canvasRef} className="h-full w-full" />

        <AnimatePresence>
          {!active && (
            <motion.div
              key="activate"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.15, filter: "blur(6px)" }}
              transition={{ duration: 0.5 }}
            >
              <button
                onClick={onActivate}
                disabled={connecting}
                className="group relative rounded-full border border-white/15 bg-white/[0.04] px-8 py-3.5 backdrop-blur-xl transition-all duration-300 hover:border-cyan-300/50 hover:bg-cyan-400/10 hover:shadow-[0_0_40px_rgba(69,216,255,0.25)] disabled:opacity-60"
              >
                <span className="mono text-[13px] tracking-[0.25em] text-cyan-100/90 uppercase">
                  {connecting ? (
                    <span className="shimmer-text">Initializing…</span>
                  ) : (
                    "Activate Bubloo"
                  )}
                </span>
                <span className="absolute inset-0 rounded-full border border-cyan-300/0 transition-all duration-500 group-hover:border-cyan-300/20 group-hover:scale-110" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* state readout */}
      <div className="mt-1 flex h-6 items-center gap-2.5">
        <AnimatePresence mode="wait">
          <motion.div
            key={active ? state : "offline"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-2.5"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: "var(--state-color)",
                boxShadow: "0 0 8px var(--state-color)",
              }}
            />
            <span className="mono text-[11px] tracking-[0.3em] uppercase text-white/50">
              {active ? ORB_STATE_LABELS[state] : "Offline"}
            </span>
            {active && hosting && onDeactivate && (
              <button
                onClick={onDeactivate}
                className="mono ml-2 rounded border border-white/10 px-1.5 py-0.5 text-[9px] tracking-[0.2em] text-white/30 uppercase transition hover:border-red-300/40 hover:text-red-300/80"
              >
                Stand down
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// Backwards compatibility alias
export const JarvisOrb = BublooOrb;
