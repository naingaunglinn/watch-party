"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/lib/types";

interface UseChatOptions {
  roomId: string;
  userName: string;
  enabled: boolean;
}

// CHANGED: Hard cap so chat input can't be used to ship a payload.
const MAX_TEXT_LEN = 500;
// CHANGED: 500ms per-user send rate limit + a brief surfaced reason.
const SEND_INTERVAL_MS = 500;
// CHANGED: Adaptive poll like signaling — fast on activity, slow when idle.
const POLL_MIN_MS = 1000;
const POLL_MAX_MS = 3000;
const POLL_IDLE_BACKOFF_AFTER = 8;

// CHANGED: Strip null bytes + control chars and trim to MAX_TEXT_LEN.
function sanitizeOutgoing(text: string): string {
  return text
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_TEXT_LEN);
}

// CHANGED: Composite dedup key for poll-overlap protection.
function msgKey(m: ChatMessage): string {
  return `${m.ts}|${m.from}|${m.text}`;
}

// Exported for ChatPanel rendering.
// CHANGED: Pure HTML-escape utility — no DOMParser, safe for SSR.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface OptimisticChatMessage extends ChatMessage {
  _localId?: string;
  _status?: "sending" | "sent" | "failed";
}

export function useChat({ roomId, userName, enabled }: UseChatOptions) {
  const [messages, setMessages] = useState<OptimisticChatMessage[]>([]);
  // CHANGED: Surface a transient "Slow down" string for the UI to render.
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);

  const cursorRef = useRef(0);
  const abortRef = useRef(false);
  const inFlightRef = useRef<AbortController | null>(null);
  const lastSendAtRef = useRef(0);
  const seenKeysRef = useRef<Set<string>>(new Set());
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashRateLimit = useCallback(() => {
    setRateLimitNotice("Slow down");
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setRateLimitNotice(null), 1500);
  }, []);

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = sanitizeOutgoing(rawText);
      if (!text) return;

      // CHANGED: Client-side rate limit — drop silently + notice flash.
      const now = Date.now();
      if (now - lastSendAtRef.current < SEND_INTERVAL_MS) {
        flashRateLimit();
        return;
      }
      lastSendAtRef.current = now;

      // CHANGED: Optimistic insert. Confirmed when the polled echo arrives.
      const localId = `local-${now}-${Math.random().toString(36).slice(2, 8)}`;
      const pending: OptimisticChatMessage = {
        from: userName,
        text,
        ts: now,
        _localId: localId,
        _status: "sending",
      };
      setMessages((prev) => [...prev, pending]);

      try {
        const res = await fetch(`/api/rooms/${roomId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: userName, text }),
        });
        if (!res.ok) throw new Error(`Chat POST ${res.status}`);
        setMessages((prev) =>
          prev.map((m) =>
            m._localId === localId ? { ...m, _status: "sent" } : m
          )
        );
      } catch (error) {
        console.error("[chat] send failed:", error);
        setMessages((prev) =>
          prev.map((m) =>
            m._localId === localId ? { ...m, _status: "failed" } : m
          )
        );
      }
    },
    [roomId, userName, flashRateLimit]
  );

  useEffect(() => {
    if (!enabled) {
      abortRef.current = true;
      inFlightRef.current?.abort();
      return;
    }

    abortRef.current = false;
    cursorRef.current = 0;
    seenKeysRef.current = new Set();
    let emptyStreak = 0;

    const poll = async () => {
      while (!abortRef.current) {
        // CHANGED: AbortController per request.
        const controller = new AbortController();
        inFlightRef.current = controller;

        try {
          const res = await fetch(
            `/api/rooms/${roomId}/chat?cursor=${cursorRef.current}`,
            { signal: controller.signal }
          );
          if (!res.ok) {
            await new Promise((r) => setTimeout(r, POLL_MAX_MS));
            continue;
          }

          const data = await res.json();
          const incoming: ChatMessage[] = Array.isArray(data.messages)
            ? data.messages
            : [];
          if (typeof data.nextCursor === "number") {
            cursorRef.current = data.nextCursor;
          }

          if (incoming.length > 0) {
            emptyStreak = 0;
            setMessages((prev) => {
              // CHANGED: Dedup against composite key + reconcile optimistic stubs.
              const next = [...prev];
              for (const m of incoming) {
                const key = msgKey(m);
                if (seenKeysRef.current.has(key)) continue;
                seenKeysRef.current.add(key);

                // Reconcile: if the user's own optimistic message matches, replace it.
                const localIdx = next.findIndex(
                  (n) =>
                    n._status === "sending" &&
                    n.from === m.from &&
                    n.text === m.text
                );
                if (localIdx !== -1) {
                  next[localIdx] = { ...m, _status: "sent" };
                  continue;
                }
                next.push(m);
              }
              return next;
            });
          } else {
            emptyStreak++;
          }
        } catch (error) {
          if ((error as { name?: string })?.name === "AbortError") return;
          console.error("[chat] poll error:", error);
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
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
    };
  }, [enabled, roomId]);

  return { messages, sendMessage, rateLimitNotice };
}
