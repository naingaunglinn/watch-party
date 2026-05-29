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
  rateLimitNotice?: string | null;
}

// CHANGED: Avatar palette tuned to the warm canvas — accent + ink + harmonious neighbors.
const AVATAR_PALETTE = [
  "bg-[#FE7743]", // accent
  "bg-[#273F4F]", // ink
  "bg-[#A8754D]", // terracotta
  "bg-[#4F6B5C]", // sage
  "bg-[#6B5B95]", // dusty purple
  "bg-[#B45309]", // amber
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
  const [collapsed, setCollapsed] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [unread, setUnread] = useState(0);
  const [localTyping, setLocalTyping] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (!collapsed) textareaRef.current?.focus();
  }, [collapsed]);

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
    setAutoScroll(true);
  }, [text, onSend]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

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
    // CHANGED: Collapsed rail on surface tone.
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Open chat (Ctrl+B or /)"
        className="flex w-10 flex-col items-center gap-2 border-l border-line bg-surface py-3 text-muted transition-colors hover:bg-elevated hover:text-ink"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
        <MessageSquare className="h-4 w-4" />
        {unread > 0 && (
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-canvas">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    // CHANGED: Side panel on surface bg with line border.
    <div className="flex w-72 flex-col border-l border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-accent" />
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-ink">
            Chat
          </span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse (Ctrl+B or /)"
          className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-ink"
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
          <p className="mt-6 text-center text-[11px] text-muted">
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
                // CHANGED: Own messages get a left accent strip + accent-subtle tint per spec.
                className={`group flex items-start gap-2 rounded px-1.5 py-0.5 hover:bg-elevated ${
                  m.mine ? "border-l-2 border-accent bg-accent-subtle/40 pl-2" : ""
                }`}
                title={time}
              >
                <span
                  className={`mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-canvas ${colorForName(
                    m.from
                  )}`}
                >
                  {initial}
                </span>
                <p className="min-w-0 flex-1 break-words text-[13px] leading-snug text-body">
                  <span
                    className={`mr-1.5 font-semibold ${
                      m.mine ? "text-accent" : "text-ink"
                    }`}
                  >
                    {m.mine ? "You" : m.from}
                  </span>
                  <span
                    dangerouslySetInnerHTML={{ __html: m.text }}
                  />
                  {m.status === "sending" && (
                    <span className="ml-1 text-[10px] text-muted">
                      sending…
                    </span>
                  )}
                  {m.status === "failed" && (
                    <span className="ml-1 text-[10px] text-danger">
                      failed
                    </span>
                  )}
                </p>
                <span className="hidden text-[10px] text-muted group-hover:inline">
                  {time}
                </span>
              </li>
            );
          })}
        </ul>

        {!autoScroll && unread > 0 && (
          // CHANGED: Jump-to-bottom button on accent.
          <button
            onClick={jumpToBottom}
            className="sticky bottom-2 ml-auto block rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-canvas shadow-lg hover:bg-accent-hover"
          >
            ↓ {unread} new
          </button>
        )}
      </div>

      {(rateLimitNotice || localTyping) && (
        <div className="flex items-center justify-between border-t border-line px-3 py-1 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            {localTyping && (
              <>
                <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-muted" />
                typing…
              </>
            )}
          </span>
          {rateLimitNotice && (
            <span className="flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" />
              {rateLimitNotice}
            </span>
          )}
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2 border-t border-line p-2">
        {/* CHANGED: Textarea on canvas with line border → accent focus. */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={500}
          placeholder="Type… (Enter to send, Shift+Enter newline)"
          className="flex-1 resize-none rounded-md border border-line bg-canvas px-2.5 py-1.5 text-[13px] text-body placeholder:text-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
          style={{ maxHeight: TEXTAREA_LINE_PX * TEXTAREA_MAX_LINES + 16 }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-canvas transition-colors hover:bg-accent-hover disabled:opacity-40"
          title="Send (Enter)"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
