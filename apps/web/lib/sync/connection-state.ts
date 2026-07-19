/**
 * connection-state.ts — Zustand store for the real-time connection status.
 *
 * This store is the single source of truth for the "what's the current WS
 * connection state?" question.  Any component can subscribe without
 * prop-drilling.  The editor page drives it by listening to HocuspocusProvider
 * events and calling the actions below.
 *
 * States:
 *  - "offline"    — the provider has not been created or was explicitly torn down
 *  - "connecting" — provider created, handshake in progress
 *  - "syncing"    — connected and awaiting the initial sync payload
 *  - "synced"     — fully in sync with the server
 *  - "error"      — the provider emitted an error or was closed unexpectedly
 *
 * The `pendingOpsCount` field is sourced from the Dexie `pendingOps` table
 * (Phase 4) and reflects how many local changes have not yet been acknowledged
 * by the sync server.  The editor increments it on local Yjs update events
 * while offline and clears it when `provider.synced` fires.
 */

import { create } from "zustand";

export type ConnectionStatus = "offline" | "connecting" | "syncing" | "synced" | "error";

interface ConnectionStateStore {
  status: ConnectionStatus;
  pendingOpsCount: number;
  errorMessage: string | null;

  // Actions
  setStatus: (status: ConnectionStatus) => void;
  setPendingOpsCount: (count: number) => void;
  incrementPendingOps: () => void;
  clearPendingOps: () => void;
  setError: (message: string) => void;
  reset: () => void;
}

export const useConnectionState = create<ConnectionStateStore>((set) => ({
  status: "offline",
  pendingOpsCount: 0,
  errorMessage: null,

  setStatus: (status) => set({ status, errorMessage: null }),

  setPendingOpsCount: (count) => set({ pendingOpsCount: count }),

  incrementPendingOps: () => set((state) => ({ pendingOpsCount: state.pendingOpsCount + 1 })),

  clearPendingOps: () => set({ pendingOpsCount: 0 }),

  setError: (errorMessage) => set({ status: "error", errorMessage }),

  reset: () => set({ status: "offline", pendingOpsCount: 0, errorMessage: null }),
}));
