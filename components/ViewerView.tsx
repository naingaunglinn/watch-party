"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Monitor,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  AlertCircle,
  Radio,
  ArrowLeft,
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
  const router = useRouter();
  // CHANGED: Leave the room — navigates back to landing page.
  const leaveRoom = () => router.push("/");
  // CHANGED: Plain ref + a callback ref that attaches srcObject the instant the
  // <video> element mounts. The previous useEffect-on-[remoteStream] approach lost
  // the race because the <video> element doesn't render until connectionState ===
  // "connected", but ontrack (which sets remoteStream) fires earlier — so when
  // the element finally mounts, the effect's deps haven't changed and it doesn't
  // re-run. A ref callback runs at mount/unmount/identity-change, which is what
  // we actually want.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const attachVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      const prev = videoRef.current;
      if (prev && prev !== el) prev.srcObject = null;
      videoRef.current = el;
      if (el && remoteStream) {
        el.srcObject = remoteStream;
        el.playsInline = true;
        el.autoplay = true;
      }
    },
    [remoteStream]
  );

  const [muted, setMuted] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const toast = useTransitionToast(connectionState);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

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

  // CHANGED: Toast tone → semantic state tokens.
  const toastClass =
    toast?.tone === "ok"
      ? "bg-success-soft text-success"
      : toast?.tone === "warn"
        ? "bg-accent-subtle text-accent"
        : toast?.tone === "error"
          ? "bg-danger-soft text-danger"
          : "bg-ink text-canvas";

  return (
    <div className="relative flex flex-1 flex-col">
      {/* CHANGED: Toolbar on surface tone. */}
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* CHANGED: Leave button — back arrow returns to landing page. */}
          <button
            onClick={leaveRoom}
            title="Leave room"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {/* CHANGED: Icon chip on ink so viewer reads as the "host's audience". */}
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ink">
            <Monitor className="h-3.5 w-3.5 text-canvas" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[13px] font-semibold leading-tight text-ink">
              Viewer
            </h1>
            <p className="truncate font-mono text-[10px] leading-tight text-muted">
              {roomId}
            </p>
          </div>
        </div>
        {isLive && (
          // CHANGED: Live chip per spec — accent dot on accent-subtle bg, ink text.
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-subtle px-2.5 py-1 text-[11px] font-medium text-ink">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Live
          </span>
        )}
      </div>

      {/* Toast bar */}
      {toast && (
        <div
          className={`flex items-center justify-center gap-2 px-4 py-1 text-[11px] font-medium ${toastClass}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {toast.label}
        </div>
      )}

      {/* CHANGED: Stage on ink — deep teal contrasts the warm canvas. */}
      <div className="relative flex flex-1 items-center justify-center bg-ink">
        {isLive ? (
          <div
            className="group relative flex h-full w-full items-center justify-center"
            onMouseEnter={() => setShowOverlay(true)}
            onMouseLeave={() => setShowOverlay(false)}
          >
            <video
              ref={attachVideo}
              autoPlay
              playsInline
              muted={muted}
              className="max-h-full max-w-full"
              style={{ maxHeight: "calc(100vh - 132px)" }}
            />

            {/* CHANGED: Overlay controls — ink/75 with canvas text per spec. */}
            <div
              className={`absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-ink/75 px-1.5 py-1 backdrop-blur-sm transition-opacity ${
                showOverlay ? "opacity-100" : "opacity-0"
              }`}
            >
              <button
                onClick={() => setMuted((m) => !m)}
                title={muted ? "Unmute (M)" : "Mute (M)"}
                className="flex h-7 w-7 items-center justify-center rounded text-canvas transition-colors hover:bg-accent/80"
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
                className="flex h-7 w-7 items-center justify-center rounded text-canvas transition-colors hover:bg-accent/80"
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
          // CHANGED: Skeleton on surface tones — sits inside the ink stage but reads light.
          <div className="flex w-full max-w-2xl flex-col items-center gap-3 px-6 py-12">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-surface">
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-surface via-elevated to-surface" />
              <div className="absolute inset-0 flex items-center justify-center">
                {connectionState === "failed" ? (
                  <AlertCircle className="h-8 w-8 text-danger" />
                ) : (
                  <Radio
                    className={`h-8 w-8 ${
                      isConnecting
                        ? "animate-pulse text-accent"
                        : "text-muted"
                    }`}
                  />
                )}
              </div>
            </div>
            <div className="text-center">
              <p className="font-display text-sm font-medium text-canvas">
                {connectionState === "failed"
                  ? "Connection failed"
                  : isConnecting
                    ? "Connecting to host…"
                    : "Waiting for host"}
              </p>
              <p className="mt-0.5 text-[11px] text-canvas/70">
                {connectionState === "failed"
                  ? "Ask the host to restart sharing."
                  : "The host hasn't started sharing yet."}
              </p>
            </div>
          </div>
        )}

        {/* CHANGED: Reconnect banner uses accent palette (warm warning). */}
        {(connectionState === "disconnected" || connectionState === "failed") &&
          countdown !== null && (
            <div className="absolute bottom-3 left-3 right-3 mx-auto max-w-md rounded-lg border border-accent/40 bg-accent-subtle px-3 py-2 text-center text-[12px] text-accent shadow-lg">
              Host disconnected — auto-reconnecting in {countdown}s
            </div>
          )}
      </div>
    </div>
  );
}
