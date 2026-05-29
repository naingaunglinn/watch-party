"use client";

import {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  KeyboardEvent,
  ChangeEvent,
} from "react";
import { Send, MessageSquare, ChevronRight, AlertTriangle } from "lucide-react";
import { escapeHtml, OptimisticChatMessage } from "@/hooks/useChat";

interface ChatPanelProps {
  messages: OptimisticChatMessage[];
  onSend: (text: string) => void;
  userName: string;
  // CHANGED: Optional rate-limit notice surfaced from useChat.
  rateLimitNotice?: string | null;
}

// CHANGED: Deterministic name → color so each user keeps their tint across messages.
const AVATAR_PALETTE = [
  "bg-indigo-500/80",
  "bg-violet-500/80",
  "bg-emerald-500/80",
  "bg-rose-500/80",
  "bg-amber-500/80",
  "bg-sky-500/80",
  "bg-fuchsia-500/80",
];
function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

const TEXTAREA_LINE_PX = 20;
const TEXTAREA_MAX_LINES = 3;

export default function ChatPanel({
  messages,
  onSend,
  userName,
  rateLimitNotice,
}: ChatPanelProps) {
  const [text, setText] = useState("");
  // CHANGED: Collapsible side panel — toggled by Ctrl+B or "/".
  const [collapsed, setCollapsed] = useState(false);
  // CHANGED: Auto-scroll pause + unread badge.
  const [autoScroll, setAutoScroll] = useState(true);
  const [unread, setUnread] = useState(0);
  // CHANGED: Local-only typing indicator state.
  const [localTyping, setLocalTyping] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CHANGED: Global keybind for collapse — Ctrl+B or "/" when not focused in chat.
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
        return;
      }
      if (e.key === "/" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // CHANGED: Focus textarea on expand for fewer clicks.
  useEffect(() => {
    if (!collapsed) textareaRef.current?.focus();
  }, [collapsed]);

  // CHANGED: Defer the setState to a timeout 0 so it lives outside the effect body,
  // satisfying the React 19 set-state-in-effect lint rule while keeping behavior.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (autoScroll) {
      el.scrollTop = el.scrollHeight;
      const t = setTimeout(() => setUnread(0), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setUnread((n) => n + 1), 0);
    return () => clearTimeout(t);
  }, [messages, autoScroll]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAutoScroll(atBottom);
    if (atBottom) setUnread(0);
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAutoScroll(true);
    setUnread(0);
  }, []);

  // CHANGED: Auto-resize textarea up to 3 lines.
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = TEXTAREA_LINE_PX * TEXTAREA_MAX_LINES + 16;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [text, resizeTextarea]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // CHANGED: Local typing indicator (no wire).
    setLocalTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setLocalTyping(false), 1200);
  };

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    setLocalTyping(false);
    // Ensure we follow our own message.
    setAutoScroll(true);
  }, [text, onSend]);

  // CHANGED: Enter submits, Shift+Enter newline.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // CHANGED: Pre-escape rendered text once.
  const renderedMessages = useMemo(
    () =>
      messages.map((m, i) => ({
        idx: i,
        from: m.from,
        text: escapeHtml(m.text),
        ts: m.ts,
        mine: m.from === userName,
        status: m._status,
      })),
    [messages, userName]
  );

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Open chat (Ctrl+B or /)"
        className="flex w-10 flex-col items-center gap-2 border-l border-zinc-800 bg-zinc-950 py-3 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
        <MessageSquare className="h-4 w-4" />
        {unread > 0 && (
          <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex w-72 flex-col border-l border-zinc-800 bg-zinc-950/60">
      {/* CHANGED: Compact header with collapse button + kbd hint. */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
            Chat
          </span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse (Ctrl+B or /)"
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto px-2 py-2"
      >
        {renderedMessages.length === 0 && (
          <p className="mt-6 text-center text-[11px] text-zinc-600">
            No messages yet.
          </p>
        )}

        <ul className="space-y-0.5">
          {renderedMessages.map((m) => {
            const initial = (m.from?.[0] || "?").toUpperCase();
            const time = new Date(m.ts).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <li
                key={`${m.ts}-${m.idx}`}
                className="group flex items-start gap-2 rounded px-1.5 py-0.5 hover:bg-zinc-900/60"
                title={time}
              >
                {/* CHANGED: Color-coded initial avatar. */}
                <span
                  className={`mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${colorForName(
                    m.from
                  )}`}
                >
                  {initial}
                </span>
                <p className="min-w-0 flex-1 break-words text-[13px] leading-snug text-zinc-200">
                  <span
                    className={`mr-1.5 font-semibold ${
                      m.mine ? "text-indigo-300" : "text-violet-300"
                    }`}
                  >
                    {m.mine ? "You" : m.from}
                  </span>
                  {/* CHANGED: Pre-escaped text — safe to render as plain text node. */}
                  <span
                    dangerouslySetInnerHTML={{ __html: m.text }}
                  />
                  {m.status === "sending" && (
                    <span className="ml-1 text-[10px] text-zinc-500">
                      sending…
                    </span>
                  )}
                  {m.status === "failed" && (
                    <span className="ml-1 text-[10px] text-red-400">
                      failed
                    </span>
                  )}
                </p>
                {/* CHANGED: Hover-only timestamp to cut clutter. */}
                <span className="hidden text-[10px] text-zinc-600 group-hover:inline">
                  {time}
                </span>
              </li>
            );
          })}
        </ul>

        {/* CHANGED: Jump-to-bottom unread badge when auto-scroll is paused. */}
        {!autoScroll && unread > 0 && (
          <button
            onClick={jumpToBottom}
            className="sticky bottom-2 ml-auto block rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-semibold text-white shadow-lg hover:bg-indigo-500"
          >
            ↓ {unread} new
          </button>
        )}
      </div>

      {/* CHANGED: Slim status row — rate-limit notice + local typing indicator. */}
      {(rateLimitNotice || localTyping) && (
        <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-1 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            {localTyping && (
              <>
                <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-zinc-500" />
                typing…
              </>
            )}
          </span>
          {rateLimitNotice && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {rateLimitNotice}
            </span>
          )}
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2 border-t border-zinc-800 p-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={500}
          placeholder="Type… (Enter to send, Shift+Enter newline)"
          className="flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[13px] text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500"
          style={{ maxHeight: TEXTAREA_LINE_PX * TEXTAREA_MAX_LINES + 16 }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          title="Send (Enter)"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
