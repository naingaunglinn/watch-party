"use client";

import { useCallback, useEffect, useRef } from "react";
import { Signal, SignalType } from "@/lib/types";

interface UseSignalingOptions {
  roomId: string;
  userId: string;
  role: "host" | "viewer";
  enabled: boolean;
  onOffer: (offer: RTCSessionDescriptionInit) => void;
  onAnswer: (answer: RTCSessionDescriptionInit) => void;
  onIce: (candidate: RTCIceCandidateInit, from: "host" | "viewer") => void;
}

// CHANGED: Adaptive polling tuning — start fast, back off when idle, reset on activity.
const POLL_MIN_MS = 500;
const POLL_MAX_MS = 2000;
const POLL_IDLE_BACKOFF_AFTER = 10; // consecutive empty responses before backoff

// CHANGED: ICE batching — buffer ICE for 150ms then ship as `ice-batch` to cut round trips.
const ICE_BATCH_WINDOW_MS = 150;

const VALID_TYPES: ReadonlySet<SignalType> = new Set([
  "offer",
  "answer",
  "ice",
  "ice-batch",
]);
const VALID_FROM = new Set(["host", "viewer"]);

// CHANGED: Validate untrusted server payloads before handing them to RTCPeerConnection.
function isValidSignal(s: unknown): s is Signal {
  if (typeof s !== "object" || s === null) return false;
  const sig = s as Partial<Signal>;
  if (typeof sig.type !== "string" || !VALID_TYPES.has(sig.type as SignalType))
    return false;
  if (typeof sig.from !== "string" || !VALID_FROM.has(sig.from)) return false;
  if (typeof sig.payload !== "object" || sig.payload === null) return false;
  return true;
}

export function useSignaling({
  roomId,
  userId: _userId,
  role,
  enabled,
  onOffer,
  onAnswer,
  onIce,
}: UseSignalingOptions) {
  void _userId;
  const cursorRef = useRef(0);
  const abortRef = useRef(false);
  const inFlightRef = useRef<AbortController | null>(null);

  // CHANGED: Outgoing ICE buffer + flush timer for batching.
  const iceBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const iceFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CHANGED: Raw POST that bypasses the batching wrapper — used by flushIce.
  const postSignal = useCallback(
    async (signal: Omit<Signal, "ts">) => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/signal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(signal),
        });
        if (!res.ok) throw new Error(`Signal POST ${res.status}`);
      } catch (error) {
        console.error("[signal] send failed:", error);
      }
    },
    [roomId]
  );

  const flushIce = useCallback(() => {
    if (iceFlushTimerRef.current) {
      clearTimeout(iceFlushTimerRef.current);
      iceFlushTimerRef.current = null;
    }
    const batch = iceBufferRef.current;
    if (batch.length === 0) return;
    iceBufferRef.current = [];
    void postSignal({
      type: "ice-batch",
      from: role,
      payload: batch as unknown as Record<string, unknown>,
    });
  }, [postSignal, role]);

  // CHANGED: Public sendSignal — batches ICE, ships offers/answers immediately.
  const sendSignal = useCallback(
    async (signal: Omit<Signal, "ts">) => {
      if (signal.type === "ice") {
        iceBufferRef.current.push(signal.payload as RTCIceCandidateInit);
        if (!iceFlushTimerRef.current) {
          iceFlushTimerRef.current = setTimeout(flushIce, ICE_BATCH_WINDOW_MS);
        }
        return;
      }
      // Flush any pending ICE before a session-level signal so ordering is preserved.
      flushIce();
      await postSignal(signal);
    },
    [postSignal, flushIce]
  );

  useEffect(() => {
    if (!enabled) {
      abortRef.current = true;
      inFlightRef.current?.abort();
      return;
    }

    abortRef.current = false;
    cursorRef.current = 0;
    let emptyStreak = 0;

    const dispatch = (signal: Signal) => {
      // CHANGED: Validate untrusted payload before dispatching to WebRTC handlers.
      if (!isValidSignal(signal)) {
        console.warn("[signal] dropped invalid shape:", signal);
        return;
      }
      // CHANGED: Explicit + logged self-signal rejection.
      if (signal.from === role) {
        return;
      }

      try {
        if (signal.type === "offer") {
          onOffer(signal.payload as RTCSessionDescriptionInit);
        } else if (signal.type === "answer") {
          onAnswer(signal.payload as RTCSessionDescriptionInit);
        } else if (signal.type === "ice") {
          onIce(signal.payload as RTCIceCandidateInit, signal.from);
        } else if (signal.type === "ice-batch") {
          const candidates = signal.payload as unknown as RTCIceCandidateInit[];
          if (!Array.isArray(candidates)) {
            console.warn("[signal] ice-batch payload not an array");
            return;
          }
          for (const c of candidates) {
            if (c && typeof c === "object") onIce(c, signal.from);
          }
        }
      } catch (err) {
        console.error("[signal] dispatch error:", err);
      }
    };

    const poll = async () => {
      while (!abortRef.current) {
        // CHANGED: AbortController per request so we can cancel in-flight on teardown.
        const controller = new AbortController();
        inFlightRef.current = controller;

        try {
          const res = await fetch(
            `/api/rooms/${roomId}/signal?cursor=${cursorRef.current}`,
            { signal: controller.signal }
          );
          if (!res.ok) {
            await new Promise((r) => setTimeout(r, POLL_MAX_MS));
            continue;
          }

          const data = await res.json();
          const signals: Signal[] = Array.isArray(data.signals)
            ? data.signals
            : [];
          if (typeof data.nextCursor === "number") {
            cursorRef.current = data.nextCursor;
          }

          for (const signal of signals) dispatch(signal);

          // CHANGED: Adaptive cadence — reset on activity, back off after 10 empty polls.
          if (signals.length > 0) {
            emptyStreak = 0;
          } else {
            emptyStreak++;
          }
        } catch (error) {
          if ((error as { name?: string })?.name === "AbortError") return;
          console.error("[signal] poll error:", error);
        } finally {
          inFlightRef.current = null;
        }

        const delay =
          emptyStreak >= POLL_IDLE_BACKOFF_AFTER ? POLL_MAX_MS : POLL_MIN_MS;
        await new Promise((r) => setTimeout(r, delay));
      }
    };

    poll();

    return () => {
      abortRef.current = true;
      inFlightRef.current?.abort();
      if (iceFlushTimerRef.current) {
        clearTimeout(iceFlushTimerRef.current);
        iceFlushTimerRef.current = null;
      }
    };
  }, [enabled, roomId, role, onOffer, onAnswer, onIce]);

  return { sendSignal };
}
