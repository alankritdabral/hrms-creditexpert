"use client";

import { useSyncExternalStore } from "react";
import { isLocalhost } from "./env";

const emptySubscribe = () => () => {};

/**
 * React hook to safely detect localhost client-side without SSR hydration mismatches.
 * Uses useSyncExternalStore (React 18/19 recommended pattern for external browser state).
 * - Server snapshot: false (clean public interface on SSR)
 * - Client snapshot: isLocalhost() (true only on local development workstation)
 */
export function useIsLocalhost(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => isLocalhost(),
    () => false
  );
}
