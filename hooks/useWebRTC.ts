"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionQuality, DisplaySurface, Signal } from "@/lib/types";

// CHANGED: Bundle + RTCP-mux + dual STUN for fewer ports, faster ICE.
const PC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

interface UseWebRTCOptions {
  role: "host" | "viewer";
  onSignal: (signal: Omit<Signal, "ts">) => Promise<void>;
}

// CHANGED: Prefer VP9 → H.264 → VP8 for low-latency screen share when supported.
function applyPreferredVideoCodecs(pc: RTCPeerConnection) {
  try {
    if (typeof RTCRtpSender === "undefined" || !("getCapabilities" in RTCRtpSender))
      return;
    const caps = RTCRtpSender.getCapabilities("video");
    if (!caps?.codecs) return;
    const order = ["video/VP9", "video/H264", "video/VP8"];
    const sorted = [...caps.codecs].sort((a, b) => {
      const ia = order.indexOf(a.mimeType);
      const ib = order.indexOf(b.mimeType);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    const transceiver = pc
      .getTransceivers()
      .find((t) => t.sender.track?.kind === "video");
    if (transceiver && "setCodecPreferences" in transceiver) {
      transceiver.setCodecPreferences(sorted);
    }
  } catch (err) {
    console.warn("[rtc] codec preference apply failed:", err);
  }
}

// CHANGED: Low-latency sender encoding params (30fps, high priority).
// IMPORTANT: setParameters() requires preserving rid/active from getParameters() output —
// replacing the encodings array wholesale throws InvalidModificationError. We patch in place.
async function tuneVideoSender(pc: RTCPeerConnection) {
  try {
    const sender = pc.getSenders().find((s) => s.track?.kind === "video");
    if (!sender || typeof sender.setParameters !== "function") return;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) return;
    for (const enc of params.encodings) {
      enc.maxFramerate = 30;
      (enc as RTCRtpEncodingParameters & { networkPriority?: string }).networkPriority = "high";
      (enc as RTCRtpEncodingParameters & { priority?: string }).priority = "high";
    }
    await sender.setParameters(params);
  } catch (err) {
    console.warn("[rtc] sender tune failed:", err);
  }
}

export function useWebRTC({ role, onSignal }: UseWebRTCOptions) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  // CHANGED: Expose localStream so the host can render their own preview.
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState>("new");
  const [isSharing, setIsSharing] = useState(false);
  // CHANGED: Expose derived connection quality for UI signal-strength indicator.
  const [connectionQuality, setConnectionQuality] =
    useState<ConnectionQuality>("unknown");

  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteDescRef = useRef(false);
  const onSignalRef = useRef(onSignal);
  const iceRestartedRef = useRef(false);
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatsRef = useRef<{ lost: number; received: number } | null>(null);

  // CHANGED: Sync the onSignal ref in an effect to satisfy React 19 strict refs rule.
  useEffect(() => {
    onSignalRef.current = onSignal;
  }, [onSignal]);

  // CHANGED: getStats() poll → packets-lost ratio → quality enum.
  const startQualityMonitor = useCallback((pc: RTCPeerConnection) => {
    if (statsTimerRef.current) clearInterval(statsTimerRef.current);
    statsTimerRef.current = setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let lost = 0;
        let received = 0;
        stats.forEach((report) => {
          if (
            report.type === "inbound-rtp" &&
            (report as { kind?: string }).kind === "video"
          ) {
            const r = report as unknown as {
              packetsLost?: number;
              packetsReceived?: number;
            };
            lost += r.packetsLost ?? 0;
            received += r.packetsReceived ?? 0;
          }
        });

        const prev = prevStatsRef.current;
        prevStatsRef.current = { lost, received };
        if (!prev || received === prev.received) {
          if (!prev) setConnectionQuality("unknown");
          return;
        }
        const dLost = Math.max(0, lost - prev.lost);
        const dRecv = Math.max(1, received - prev.received);
        const ratio = dLost / (dLost + dRecv);

        if (ratio < 0.02) setConnectionQuality("good");
        else if (ratio < 0.05) setConnectionQuality("degraded");
        else setConnectionQuality("poor");
      } catch (err) {
        console.warn("[rtc] getStats failed:", err);
      }
    }, 5000);
  }, []);

  const stopQualityMonitor = useCallback(() => {
    if (statsTimerRef.current) {
      clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
    prevStatsRef.current = null;
  }, []);

  const createPeerConnection = useCallback(() => {
    // CHANGED: Use shared low-latency config.
    const pc = new RTCPeerConnection(PC_CONFIG);

    pc.onconnectionstatechange = () => {
      console.log("[rtc] connectionState →", pc.connectionState);
      setConnectionState(pc.connectionState);
      if (pc.connectionState === "connected") {
        iceRestartedRef.current = false;
        startQualityMonitor(pc);
        // CHANGED: Apply low-latency encoding params once the link is up.
        // Doing this pre-offer can throw in some browsers and break the SDP exchange.
        void tuneVideoSender(pc);
      }
      if (
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        stopQualityMonitor();
        if (pc.connectionState !== "closed") setConnectionQuality("unknown");
      }
    };

    // CHANGED: One-shot ICE restart when the transport fails before giving up.
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed" && !iceRestartedRef.current) {
        iceRestartedRef.current = true;
        try {
          console.warn("[rtc] ICE failed — restarting once");
          pc.restartIce();
        } catch (err) {
          console.error("[rtc] restartIce error:", err);
        }
      }
    };

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await onSignalRef.current({
            type: "ice",
            from: role,
            payload: event.candidate.toJSON(),
          });
        } catch (err) {
          console.error("[rtc] failed to send ICE:", err);
        }
      }
    };

    if (role === "viewer") {
      pc.ontrack = (event) => {
        console.log("[rtc] viewer ontrack — streams:", event.streams?.length);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };
    }

    pcRef.current = pc;
    return pc;
  }, [role, startQualityMonitor, stopQualityMonitor]);

  const startSharing = useCallback(
    async (displaySurface: DisplaySurface) => {
      try {
        // CHANGED: Tighter constraints — 30fps target, cursor on, no audio for latency.
        const constraints: DisplayMediaStreamOptions = {
          video: {
            displaySurface,
            frameRate: { ideal: 30, max: 60 },
            cursor: "always",
          } as MediaTrackConstraints,
          audio: false,
        };

        const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
        localStreamRef.current = stream;
        // CHANGED: Publish localStream so the host preview can render it.
        setLocalStream(stream);
        setIsSharing(true);

        const pc = createPeerConnection();

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // CHANGED: Codec prefs only. Sender tune deferred to onconnectionstatechange=connected.
        applyPreferredVideoCodecs(pc);

        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          console.log("[rtc] host track ended (browser stop-sharing)");
          setIsSharing(false);
          setLocalStream(null);
          try {
            pc.close();
          } catch (err) {
            console.error("[rtc] pc.close on track-end error:", err);
          }
          pcRef.current = null;
          localStreamRef.current = null;
          stopQualityMonitor();
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log("[rtc] host → offer sent");

        await onSignalRef.current({
          type: "offer",
          from: "host",
          payload: offer,
        });
      } catch (error) {
        console.error("[rtc] startSharing failed:", error);
        setIsSharing(false);
        setLocalStream(null);
      }
    },
    [createPeerConnection, stopQualityMonitor]
  );

  const handleOffer = useCallback(
    async (offer: RTCSessionDescriptionInit) => {
      // CHANGED: Validate SDP role — viewer should never receive a "answer" labeled as offer, etc.
      if (offer?.type !== "offer") {
        console.warn("[rtc] rejected non-offer in handleOffer:", offer?.type);
        return;
      }
      if (role !== "viewer") {
        console.warn("[rtc] host received offer — ignoring");
        return;
      }
      try {
        console.log("[rtc] viewer ← offer received");
        const pc = createPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        hasRemoteDescRef.current = true;

        for (const candidate of pendingIceRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("[rtc] pending ICE add failed:", err);
          }
        }
        pendingIceRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log("[rtc] viewer → answer sent");

        await onSignalRef.current({
          type: "answer",
          from: "viewer",
          payload: answer,
        });
      } catch (error) {
        console.error("[rtc] handleOffer error:", error);
      }
    },
    [createPeerConnection, role]
  );

  const handleAnswer = useCallback(
    async (answer: RTCSessionDescriptionInit) => {
      // CHANGED: Validate SDP type.
      if (answer?.type !== "answer") {
        console.warn("[rtc] rejected non-answer in handleAnswer:", answer?.type);
        return;
      }
      if (role !== "host") {
        console.warn("[rtc] viewer received answer — ignoring");
        return;
      }
      try {
        console.log("[rtc] host ← answer received");
        const pc = pcRef.current;
        if (!pc) {
          console.warn("[rtc] host got answer but no pcRef.current");
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        hasRemoteDescRef.current = true;

        for (const candidate of pendingIceRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("[rtc] pending ICE add failed:", err);
          }
        }
        pendingIceRef.current = [];
      } catch (error) {
        console.error("[rtc] handleAnswer error:", error);
      }
    },
    [role]
  );

  const handleIceCandidate = useCallback(
    async (candidate: RTCIceCandidateInit, from: "host" | "viewer") => {
      // CHANGED: Hard reject same-role ICE candidates.
      if (from === role) return;
      try {
        const pc = pcRef.current;
        if (!pc) {
          pendingIceRef.current.push(candidate);
          return;
        }
        if (hasRemoteDescRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingIceRef.current.push(candidate);
        }
      } catch (error) {
        console.error("[rtc] handleIceCandidate error:", error);
      }
    },
    [role]
  );

  const stopSharing = useCallback(() => {
    try {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      pcRef.current?.close();
    } catch (err) {
      console.error("[rtc] stopSharing teardown error:", err);
    }
    pcRef.current = null;
    localStreamRef.current = null;
    // CHANGED: Clear localStream state alongside the ref.
    setLocalStream(null);
    setRemoteStream(null);
    setIsSharing(false);
    setConnectionState("new");
    setConnectionQuality("unknown");
    hasRemoteDescRef.current = false;
    pendingIceRef.current = [];
    iceRestartedRef.current = false;
    stopQualityMonitor();
  }, [stopQualityMonitor]);

  // CHANGED: Cleanup the stats timer on unmount.
  useEffect(() => {
    return () => {
      stopQualityMonitor();
    };
  }, [stopQualityMonitor]);

  return {
    startSharing,
    stopSharing,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    remoteStream,
    // CHANGED: Expose localStream for the host preview.
    localStream,
    connectionState,
    connectionQuality,
    isSharing,
  };
}
