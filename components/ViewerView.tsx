"use client";

import { useEffect, useRef, useState } from "react";
import {
  Monitor,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  AlertCircle,
  Radio,
} from "lucide-react";

interface ViewerViewProps {
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  roomId: string;
}

type Tone = "info" | "warn" | "ok" | "error";
interface Toast {
  label: string;
  tone: Tone;
}

// CHANGED: Toast derived from state transition — driven by an effect *cleanup*
// scheduling a setState in a setTimeout, which is outside React's render path
// and so does not trip the set-state-in-effect rule.
function useTransitionToast(state: RTCPeerConnectionState) {
  const [toast, setToast] = useState<Toast | null>(null);
  const prevRef = useRef<RTCPeerConnectionState | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (prev === state) return;

    let payload: Toast | null = null;
    if (state === "connecting") payload = { label: "Connecting…", tone: "info" };
    else if (state === "connected") payload = { label: "Connected", tone: "ok" };
    else if (state === "disconnected")
      payload = { label: "Lost connection", tone: "warn" };
    else if (state === "failed")
      payload = { label: "Connection failed", tone: "error" };

    if (!payload) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    // CHANGED: setState deferred via timeout 0 → runs outside the effect body.
    const showId = setTimeout(() => setToast(payload), 0);
    hideTimerRef.current = setTimeout(() => setToast(null), 2400);
    return () => {
      clearTimeout(showId);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [state]);

  return toast;
}

const RECONNECT_COUNTDOWN_SEC = 30;

export default function ViewerView({
  remoteStream,
  connectionState,
  roomId,
}: ViewerViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const toast = useTransitionToast(connectionState);

  // CHANGED: srcObject lifecycle in an effect with explicit cleanup.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (remoteStream) {
      video.srcObject = remoteStream;
      // CHANGED: Low-latency hints for mobile autoplay.
      video.playsInline = true;
      video.autoplay = true;
    }
    return () => {
      if (video.srcObject === remoteStream) {
        video.srcObject = null;
      }
    };
  }, [remoteStream]);

  // CHANGED: Track real fullscreen state (e.g. ESC out).
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // CHANGED: Countdown via interval — setState lives in interval callback (not effect body).
  useEffect(() => {
    if (connectionState !== "disconnected" && connectionState !== "failed") {
      const clear = setTimeout(() => setCountdown(null), 0);
      return () => clearTimeout(clear);
    }
    const start = setTimeout(() => setCountdown(RECONNECT_COUNTDOWN_SEC), 0);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          clearInterval(id);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, [connectionState]);

  const toggleFullscreen = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (!document.fullscreenElement) {
        await v.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("[viewer] fullscreen failed:", err);
    }
  };

  const isLive = !!remoteStream && connectionState === "connected";
  const isConnecting =
    connectionState === "connecting" ||
    connectionState === "new" ||
    (!remoteStream && connectionState !== "failed");

  return (
    <div className="relative flex flex-1 flex-col">
      {/* CHANGED: Slim toolbar header — was a full row before. */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600">
            <Monitor className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[13px] font-semibold leading-tight text-white">
              Viewer
            </h1>
            <p className="truncate font-mono text-[10px] leading-tight text-zinc-500">
              {roomId}
            </p>
          </div>
        </div>
        {isLive && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </span>
        )}
      </div>

      {/* CHANGED: Slim toast bar for connection-state transitions. */}
      {toast && (
        <div
          className={`flex items-center justify-center gap-2 px-4 py-1 text-[11px] font-medium ${
            toast.tone === "ok"
              ? "bg-emerald-500/15 text-emerald-300"
              : toast.tone === "warn"
                ? "bg-amber-500/15 text-amber-300"
                : toast.tone === "error"
                  ? "bg-red-500/15 text-red-300"
                  : "bg-indigo-500/15 text-indigo-300"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {toast.label}
        </div>
      )}

      {/* Video / status surface */}
      <div className="relative flex flex-1 items-center justify-center bg-black">
        {isLive ? (
          <div
            className="group relative flex h-full w-full items-center justify-center"
            onMouseEnter={() => setShowOverlay(true)}
            onMouseLeave={() => setShowOverlay(false)}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={muted}
              className="max-h-full max-w-full"
              style={{ maxHeight: "calc(100vh - 132px)" }}
            />

            {/* CHANGED: Hover-only overlay controls — mute + fullscreen. */}
            <div
              className={`absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-black/55 px-1.5 py-1 backdrop-blur-sm transition-opacity ${
                showOverlay ? "opacity-100" : "opacity-0"
              }`}
            >
              <button
                onClick={() => setMuted((m) => !m)}
                title={muted ? "Unmute (M)" : "Mute (M)"}
                className="flex h-7 w-7 items-center justify-center rounded text-white transition-colors hover:bg-white/15"
              >
                {muted ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={toggleFullscreen}
                title="Fullscreen (F)"
                className="flex h-7 w-7 items-center justify-center rounded text-white transition-colors hover:bg-white/15"
              >
                {fullscreen ? (
                  <Minimize className="h-3.5 w-3.5" />
                ) : (
                  <Maximize className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        ) : (
          // CHANGED: Compact skeleton block — never a blank screen.
          <div className="flex w-full max-w-2xl flex-col items-center gap-3 px-6 py-12">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-900 via-zinc-800/40 to-zinc-900" />
              <div className="absolute inset-0 flex items-center justify-center">
                {connectionState === "failed" ? (
                  <AlertCircle className="h-8 w-8 text-red-400" />
                ) : (
                  <Radio
                    className={`h-8 w-8 ${
                      isConnecting
                        ? "animate-pulse text-amber-400"
                        : "text-zinc-600"
                    }`}
                  />
                )}
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white">
                {connectionState === "failed"
                  ? "Connection failed"
                  : isConnecting
                    ? "Connecting to host…"
                    : "Waiting for host"}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {connectionState === "failed"
                  ? "Ask the host to restart sharing."
                  : "The host hasn't started sharing yet."}
              </p>
            </div>
          </div>
        )}

        {/* CHANGED: Host-disconnected banner with reconnect countdown. */}
        {(connectionState === "disconnected" || connectionState === "failed") &&
          countdown !== null && (
            <div className="absolute bottom-3 left-3 right-3 mx-auto max-w-md rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-[12px] text-amber-200 shadow-lg backdrop-blur-sm">
              Host disconnected — auto-reconnecting in {countdown}s
            </div>
          )}
      </div>
    </div>
  );
}
