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
  // CHANGED: New — surfaced from useWebRTC.
  connectionQuality: ConnectionQuality;
  roomId: string;
}

// CHANGED: Compact StatusBadge — dot + label, derived from connection state.
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
      dot: "bg-amber-400 animate-pulse",
      text: "text-amber-300",
      bg: "bg-amber-500/10",
    },
    connected: {
      label: "Live · 1 viewer",
      dot: "bg-emerald-400",
      text: "text-emerald-300",
      bg: "bg-emerald-500/10",
    },
    disconnected: {
      label: "Disconnected",
      dot: "bg-red-400",
      text: "text-red-300",
      bg: "bg-red-500/10",
    },
    failed: {
      label: "Failed",
      dot: "bg-red-400",
      text: "text-red-300",
      bg: "bg-red-500/10",
    },
    closed: {
      label: "Closed",
      dot: "bg-zinc-500",
      text: "text-zinc-400",
      bg: "bg-zinc-700/40",
    },
  };
  const v = map[state] || {
    label: "Waiting",
    dot: "bg-zinc-400",
    text: "text-zinc-400",
    bg: "bg-zinc-700/40",
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

// CHANGED: Signal-strength icon from getStats-derived quality.
function QualityIcon({ q }: { q: ConnectionQuality }) {
  const common = "h-3.5 w-3.5";
  if (q === "good")
    return (
      <SignalHigh className={`${common} text-emerald-400`} aria-label="Good link" />
    );
  if (q === "degraded")
    return (
      <SignalMedium
        className={`${common} text-amber-400`}
        aria-label="Degraded link"
      />
    );
  if (q === "poor")
    return (
      <SignalLow className={`${common} text-red-400`} aria-label="Poor link" />
    );
  return (
    <Signal className={`${common} text-zinc-500`} aria-label="Unknown link" />
  );
}

export default function HostView({
  onStartShare,
  onStopShare,
  onEndRoom,
  isSharing,
  connectionState,
  connectionQuality,
  roomId,
}: HostViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [copied, setCopied] = useState(false);
  const [selectedSurface, setSelectedSurface] = useState<DisplaySurface | null>(
    null
  );

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/room/${roomId}` : "";

  // Silence unused warning — preserved for future preview hookup.
  useEffect(() => {
    void videoRef.current;
  }, []);

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

  // CHANGED: One action that stops the share and (optionally) tears down the room.
  const stopAndEnd = () => {
    setSelectedSurface(null);
    onStopShare();
    onEndRoom?.();
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* CHANGED: Compact single-row toolbar replaces the verbose header. */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600">
            <Share2 className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[13px] font-semibold leading-tight text-white">
              Host
            </h1>
            <p className="truncate font-mono text-[10px] leading-tight text-zinc-500">
              {roomId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge state={connectionState} />
          {connectionState === "connected" && (
            <QualityIcon q={connectionQuality} />
          )}
          <button
            onClick={copyLink}
            title="Copy invite link"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copied" : "Copy Link"}
          </button>
          {isSharing ? (
            <button
              onClick={stopAndEnd}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600/15 px-2.5 py-1 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-600/25"
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
          <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
            <h2 className="mb-1 text-base font-semibold text-white">
              What would you like to share?
            </h2>
            <p className="mb-5 text-xs text-zinc-400">
              Direct browser-to-browser. Nothing is uploaded.
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { surface: "monitor", icon: Monitor, label: "Entire Screen", color: "text-indigo-400" },
                  { surface: "window", icon: AppWindow, label: "Window", color: "text-violet-400" },
                  { surface: "browser", icon: LayoutTemplate, label: "Browser Tab", color: "text-emerald-400" },
                ] as const
              ).map(({ surface, icon: Icon, label, color }) => (
                <button
                  key={surface}
                  onClick={() => startShare(surface)}
                  className="flex flex-col items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 transition-all hover:border-indigo-500/50 hover:bg-zinc-800"
                >
                  <Icon className={`h-6 w-6 ${color}`} />
                  <span className="text-[12px] font-medium text-zinc-200">
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex w-full max-w-4xl flex-col items-center gap-3">
            {/* CHANGED: Compact preview with overlay SHARING badge. */}
            <div className="relative w-full overflow-hidden rounded-lg border border-zinc-700 bg-black">
              <div className="flex items-center justify-center py-20 text-zinc-500">
                <div className="text-center">
                  <Monitor className="mx-auto mb-2 h-10 w-10 opacity-50" />
                  <p className="text-xs font-medium">
                    Sharing {selectedSurface}
                  </p>
                </div>
              </div>
              {/* CHANGED: Overlay live-badge. */}
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                Sharing
              </span>
            </div>
            <button
              onClick={stopShare}
              className="inline-flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
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
