"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
  ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Monitor, DoorOpen, Radio, Users } from "lucide-react";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Tab = "create" | "join";

export default function LandingHero() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");
  const [joinId, setJoinId] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const joinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab === "join") {
      joinInputRef.current?.focus();
    }
  }, [tab]);

  const createRoom = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/rooms?role=host", { method: "POST" });
      const data = await res.json();
      if (data.roomId) {
        router.push(`/room/${data.roomId}?role=host&uid=${data.userId}`);
      }
    } catch (error) {
      console.error("Failed to create room:", error);
      setIsCreating(false);
    }
  }, [isCreating, router]);

  const joinValid = UUID_REGEX.test(joinId);

  const joinRoom = useCallback(() => {
    if (!joinValid) return;
    const uid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `viewer-${Math.random().toString(36).slice(2)}`;
    router.push(`/room/${joinId.toLowerCase()}?role=viewer&uid=${uid}`);
  }, [joinValid, joinId, router]);

  const onJoinChange = (e: ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\s+/g, "").toUpperCase();
    setJoinId(cleaned);
  };

  const onCreateKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter") createRoom();
  };

  const onJoinKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") joinRoom();
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        {/* CHANGED: Accent pill — accent-subtle bg with ink text + accent icon. */}
        <div className="mb-3 inline-flex items-center justify-center rounded-full bg-accent-subtle px-3 py-1">
          <Radio className="mr-1.5 h-3.5 w-3.5 text-accent" />
          <span className="text-[12px] font-medium text-ink">
            P2P Watch Party
          </span>
        </div>
        {/* CHANGED: Display font (Fraunces) on h1, ink → accent gradient on second line. */}
        <h1 className="mb-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
          Watch Together.
          <br />
          <span className="bg-gradient-to-r from-ink to-accent bg-clip-text text-transparent">
            Zero Uploads.
          </span>
        </h1>
        <p className="mx-auto max-w-md text-sm text-muted">
          Share your screen directly with a friend. Browser-to-browser, no servers in
          between.
        </p>
      </div>

      {/* CHANGED: Card surface on the warm palette — bg-surface with line border. */}
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div
          role="tablist"
          className="grid grid-cols-2 border-b border-line text-sm font-medium"
        >
          <button
            role="tab"
            aria-selected={tab === "create"}
            onClick={() => setTab("create")}
            className={`flex items-center justify-center gap-2 px-3 py-3 transition-colors ${
              tab === "create"
                ? "bg-accent-subtle text-accent"
                : "text-muted hover:bg-elevated hover:text-ink"
            }`}
          >
            <Monitor className="h-4 w-4" />
            Host
          </button>
          <button
            role="tab"
            aria-selected={tab === "join"}
            onClick={() => setTab("join")}
            className={`flex items-center justify-center gap-2 px-3 py-3 transition-colors ${
              tab === "join"
                ? "bg-accent-subtle text-accent"
                : "text-muted hover:bg-elevated hover:text-ink"
            }`}
          >
            <DoorOpen className="h-4 w-4" />
            Join
          </button>
        </div>

        <div className="p-5">
          {tab === "create" ? (
            <div className="space-y-4">
              <p className="text-xs text-muted">
                Create a private room, choose what to share, and send the link.
              </p>
              {/* CHANGED: Primary button uses accent → accent-hover. */}
              <button
                onClick={createRoom}
                onKeyDown={onCreateKey}
                disabled={isCreating}
                autoFocus
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreating ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-canvas/40 border-t-canvas" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Radio className="h-3.5 w-3.5" />
                    Create Room
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs text-muted">
                Paste a room ID (UUID) to join.
              </label>
              {/* CHANGED: Input on canvas bg with line border → accent focus. */}
              <input
                ref={joinInputRef}
                type="text"
                inputMode="text"
                spellCheck={false}
                autoComplete="off"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={joinId}
                onChange={onJoinChange}
                onKeyDown={onJoinKey}
                className={`w-full rounded-lg border bg-canvas px-3 py-2.5 font-mono text-[12px] tracking-wide text-body placeholder:text-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent ${
                  joinId.length === 0
                    ? "border-line"
                    : joinValid
                      ? "border-success/50"
                      : "border-danger/50"
                }`}
              />
              {joinId.length > 0 && !joinValid && (
                <p className="text-[11px] text-danger">
                  Not a valid room ID — expects a UUID.
                </p>
              )}
              <button
                onClick={joinRoom}
                disabled={!joinValid}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Users className="h-3.5 w-3.5" />
                Join Room
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CHANGED: Feature chips on elevated dots with muted labels. */}
      {/*<div className="mt-10 grid grid-cols-3 gap-6 text-center text-[11px] text-muted">*/}
      {/*  <div>*/}
      {/*    <div className="mx-auto mb-1.5 h-6 w-6 rounded-full bg-elevated" />*/}
      {/*    End-to-End P2P*/}
      {/*  </div>*/}
      {/*  <div>*/}
      {/*    <div className="mx-auto mb-1.5 h-6 w-6 rounded-full bg-elevated" />*/}
      {/*    No Sign-Up*/}
      {/*  </div>*/}
      {/*  <div>*/}
      {/*    <div className="mx-auto mb-1.5 h-6 w-6 rounded-full bg-elevated" />*/}
      {/*    Zero Uploads*/}
      {/*  </div>*/}
      {/*</div>*/}
    </div>
  );
}
