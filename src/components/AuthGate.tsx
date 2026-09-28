"use client";

import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { BublooApp } from "./BublooApp";
import { SignIn } from "./SignIn";

export function AuthGate() {
  return (
    <>
      <div className="scene" />
      <div className="scene-grid" />
      <div className="scene-noise" />

      <AuthLoading>
        <div className="relative z-10 flex h-screen w-screen items-center justify-center">
          <p className="mono shimmer-text text-[11px] tracking-[0.35em] uppercase">
            Initializing systems…
          </p>
        </div>
      </AuthLoading>

      <Unauthenticated>
        <SignIn />
      </Unauthenticated>

      <Authenticated>
        <BublooApp />
      </Authenticated>
    </>
  );
}
