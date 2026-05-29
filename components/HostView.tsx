"use client";

import { useEffect, useRef, useState } from "react";
import {
  Monitor,
  AppWindow,
  LayoutTemplate,
  Square,
  Copy,
  Check,
  Share2,
  Signal,
  SignalHigh,
  SignalMedium,
  SignalLow,
} from "lucide-react";
import { ConnectionQuality, DisplaySurface } from "@/lib/types";

interface HostViewProps {
  onStartShare: (surface: DisplaySurface) => void;
  onStopShare: () => void;
  onEndRoom?: () => void;
  isSharing: boolean;
  connectionState: RTCPeerConnectionState;
  connectionQuality: ConnectionQuality;
  // CHANGED: Host's own outgoing stream so they can preview what they're sharing.
  localStream: MediaStream | null;
  roomId: string;
}

// CHANGED: StatusBadge mapped to new design tokens.
// "Live" follows the spec exactly: accent dot + ink text + accent-subtle bg.
function StatusBadge({
  state,
}: {
  state: RTCPeerConnectionState;
}) {
  const map: Record<
    string,
    { label: string; dot: string; text: string; bg: string }
  > = {
    connecting: {
      label: "Connecting",
      dot: "bg-warning animate-pulse",
      text: "text-warning",
      bg: "bg-warning-soft",
    },
    connected: {
      label: "Live · 1 viewer",
      dot: "bg-accent animate-pulse",
      text: "text-ink",
      bg: "bg-accent-subtle",
    },
    disconnected: {
      label: "Disconnected",
      dot: "bg-danger",
      text: "text-danger",
      bg: "bg-danger-soft",
    },
    failed: {
      label: "Failed",
      dot: "bg-danger",
      text: "text-danger",
      bg: "bg-danger-soft",
    },
    closed: {
      label: "Closed",
      dot: "bg-muted",
      text: "text-muted",
      bg: "bg-elevated",
    },
  };
  const v = map[state] || {
    label: "Waiting",
    dot: "bg-muted",
    text: "text-muted",
    bg: "bg-elevated",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${v.bg} ${v.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />
      {v.label}
    </span>
  );
}

// CHANGED: Signal-strength quality mapped to semantic state colors.
function QualityIcon({ q }: { q: ConnectionQuality }) {
  const common = "h-3.5 w-3.5";
  if (q === "good")
    return (
      <SignalHigh className={`${common} text-success`} aria-label="Good link" />
    );
  if (q === "degraded")
    return (
      <SignalMedium
        className={`${common} text-accent`}
        aria-label="Degraded link"
      />
    );
  if (q === "poor")
    return (
      <SignalLow className={`${common} text-danger`} aria-label="Poor link" />
    );
  return (
    <Signal className={`${common} text-muted`} aria-label="Unknown link" />
  );
}

export default function HostView({
  onStartShare,
  onStopShare,
  onEndRoom,
  isSharing,
  connectionState,
  connectionQuality,
  localStream,
  roomId,
}: HostViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [copied, setCopied] = useState(false);
  const [selectedSurface, setSelectedSurface] = useState<DisplaySurface | null>(
    null
  );

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/room/${roomId}` : "";

  // CHANGED: Attach the local MediaStream to the preview <video>; clean up on swap.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (localStream) {
      v.srcObject = localStream;
      v.playsInline = true;
      v.muted = true;
    }
    return () => {
      if (v.srcObject === localStream) v.srcObject = null;
    };
  }, [localStream]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const startShare = (surface: DisplaySurface) => {
    setSelectedSurface(surface);
    onStartShare(surface);
  };

  const stopShare = () => {
    setSelectedSurface(null);
    onStopShare();
  };

  const stopAndEnd = () => {
    setSelectedSurface(null);
    onStopShare();
    onEndRoom?.();
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* CHANGED: Toolbar on surface tone with line divider. */}
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* CHANGED: Accent-tinted icon chip. */}
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent">
            <Share2 className="h-3.5 w-3.5 text-canvas" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[13px] font-semibold leading-tight text-ink">
              Host
            </h1>
            <p className="truncate font-mono text-[10px] leading-tight text-muted">
              {roomId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge state={connectionState} />
          {connectionState === "connected" && (
            <QualityIcon q={connectionQuality} />
          )}
          {/* CHANGED: Secondary button — canvas surface with line border. */}
          <button
            onClick={copyLink}
            title="Copy invite link"
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-elevated"
          >
            {copied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copied" : "Copy Link"}
          </button>
          {isSharing ? (
            // CHANGED: Destructive action — danger token.
            <button
              onClick={stopAndEnd}
              className="inline-flex items-center gap-1.5 rounded-md bg-danger-soft px-2.5 py-1 text-[11px] font-semibold text-danger transition-colors hover:bg-danger hover:text-canvas"
              title="Stop sharing and end the room"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop & End
            </button>
          ) : null}
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 items-center justify-center p-5">
        {!isSharing ? (
          // CHANGED: Picker card on surface tone with line border.
          <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 text-center shadow-sm">
            <h2 className="mb-1 font-display text-base font-semibold text-ink">
              What would you like to share?
            </h2>
            <p className="mb-5 text-xs text-muted">
              Direct browser-to-browser. Nothing is uploaded.
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { surface: "monitor", icon: Monitor, label: "Entire Screen" },
                  { surface: "window", icon: AppWindow, label: "Window" },
                  { surface: "browser", icon: LayoutTemplate, label: "Browser Tab" },
                ] as const
              ).map(({ surface, icon: Icon, label }) => (
                <button
                  key={surface}
                  onClick={() => startShare(surface)}
                  // CHANGED: Surface tile on canvas with hover lifting to accent.
                  className="flex flex-col items-center gap-2 rounded-lg border border-line bg-canvas p-3 transition-all hover:border-accent hover:bg-accent-subtle"
                >
                  <Icon className="h-6 w-6 text-accent" />
                  <span className="text-[12px] font-medium text-ink">
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex w-full max-w-4xl flex-col items-center gap-3">
            {/* CHANGED: Live preview — renders the host's outgoing MediaStream. */}
            <div className="relative w-full overflow-hidden rounded-lg border border-line bg-ink">
              {localStream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="block max-h-[60vh] w-full bg-ink"
                />
              ) : (
                <div className="flex items-center justify-center py-20 text-canvas/60">
                  <div className="text-center">
                    <Monitor className="mx-auto mb-2 h-10 w-10 opacity-60" />
                    <p className="text-xs font-medium">
                      Sharing {selectedSurface}
                    </p>
                  </div>
                </div>
              )}
              {/* CHANGED: SHARING badge on accent per spec. */}
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-canvas shadow">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-canvas" />
                Sharing
              </span>
            </div>
            {/* CHANGED: Stop button — secondary canvas pill. */}
            <button
              onClick={stopShare}
              className="inline-flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-elevated"
            >
              <Square className="h-3.5 w-3.5" />
              Stop Sharing
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
