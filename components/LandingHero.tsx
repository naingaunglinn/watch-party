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

// CHANGED: Strict UUID v1-v5 validator — gates the Join button.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Tab = "create" | "join";

export default function LandingHero() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");
  const [joinId, setJoinId] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const joinInputRef = useRef<HTMLInputElement>(null);

  // CHANGED: Auto-focus the Join input when switching to that tab.
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

  // CHANGED: Auto-trim + auto-uppercase for readability; lowercased on submit for routing.
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
      {/* CHANGED: Tighter hero — smaller pill and copy. */}
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center justify-center rounded-full bg-indigo-500/10 px-3 py-1">
          <Radio className="mr-1.5 h-3.5 w-3.5 text-indigo-400" />
          <span className="text-[12px] font-medium text-indigo-300">
            P2P Watch Party
          </span>
        </div>
        <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
          Watch Together.
          <br />
          <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Zero Uploads.
          </span>
        </h1>
        <p className="mx-auto max-w-md text-sm text-zinc-400">
          Share your screen directly with a friend. Browser-to-browser, no servers in
          between.
        </p>
      </div>

      {/* CHANGED: Single compact tabbed card replaces two separate sections. */}
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-xl backdrop-blur-sm">
        {/* Tabs */}
        <div
          role="tablist"
          className="grid grid-cols-2 border-b border-zinc-800 bg-zinc-950/40 text-sm font-medium"
        >
          <button
            role="tab"
            aria-selected={tab === "create"}
            onClick={() => setTab("create")}
            className={`flex items-center justify-center gap-2 px-3 py-3 transition-colors ${
              tab === "create"
                ? "bg-indigo-500/10 text-indigo-300"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
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
                ? "bg-violet-500/10 text-violet-300"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
            }`}
          >
            <DoorOpen className="h-4 w-4" />
            Join
          </button>
        </div>

        {/* Panel */}
        <div className="p-5">
          {tab === "create" ? (
            <div className="space-y-4">
              <p className="text-xs text-zinc-400">
                Create a private room, choose what to share, and send the link.
              </p>
              <button
                onClick={createRoom}
                onKeyDown={onCreateKey}
                // CHANGED: Disabled during creation to prevent double-submit.
                disabled={isCreating}
                autoFocus
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreating ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
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
              <label className="block text-xs text-zinc-400">
                Paste a room ID (UUID) to join.
              </label>
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
                className={`w-full rounded-lg border bg-zinc-800 px-3 py-2.5 font-mono text-[12px] tracking-wide text-white placeholder-zinc-600 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500 ${
                  joinId.length === 0
                    ? "border-zinc-700"
                    : joinValid
                      ? "border-emerald-500/50"
                      : "border-red-500/40"
                }`}
              />
              {joinId.length > 0 && !joinValid && (
                <p className="text-[11px] text-red-400">
                  Not a valid room ID — expects a UUID.
                </p>
              )}
              <button
                onClick={joinRoom}
                disabled={!joinValid}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Users className="h-3.5 w-3.5" />
                Join Room
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Features */}
      <div className="mt-10 grid grid-cols-3 gap-6 text-center text-[11px] text-zinc-500">
        <div>
          <div className="mx-auto mb-1.5 h-6 w-6 rounded-full bg-zinc-800" />
          End-to-End P2P
        </div>
        <div>
          <div className="mx-auto mb-1.5 h-6 w-6 rounded-full bg-zinc-800" />
          No Sign-Up
        </div>
        <div>
          <div className="mx-auto mb-1.5 h-6 w-6 rounded-full bg-zinc-800" />
          Zero Uploads
        </div>
      </div>
    </div>
  );
}
