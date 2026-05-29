"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useParams } from "next/navigation";
import HostView from "@/components/HostView";
import ViewerView from "@/components/ViewerView";
import ChatPanel from "@/components/ChatPanel";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useSignaling } from "@/hooks/useSignaling";
import { useChat } from "@/hooks/useChat";
import { Room, Signal } from "@/lib/types";
import { AlertCircle } from "lucide-react";

function RoomPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params.id as string;
  const role = (searchParams.get("role") as "host" | "viewer") || "viewer";
  const userId = searchParams.get("uid") || crypto.randomUUID();
  const userName = role === "host" ? "Host" : "Viewer";

  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Ref to bridge useWebRTC's onSignal with useSignaling's sendSignal
  const sendSignalRef = useRef<(signal: Omit<Signal, "ts">) => Promise<void>>(
    async () => {}
  );

  // Fetch room info on mount
  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Room not found. It may have expired or been deleted.");
          } else {
            setError("Failed to load room.");
          }
          setLoading(false);
          return;
        }
        const data = await res.json();
        setRoom(data);
        setLoading(false);
      } catch {
        setError("Failed to load room.");
        setLoading(false);
      }
    };

    fetchRoom();
  }, [roomId]);

  // WebRTC hook - onSignal reads from the ref
  const {
    startSharing,
    stopSharing,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    remoteStream,
    connectionState,
    connectionQuality,
    isSharing,
  } = useWebRTC({
    role,
    onSignal: (signal) => sendSignalRef.current(signal),
  });

  // Signaling hook
  const { sendSignal } = useSignaling({
    roomId,
    userId,
    role,
    enabled: !loading && !error && !!room,
    onOffer: handleOffer,
    onAnswer: handleAnswer,
    onIce: handleIceCandidate,
  });

  // Wire sendSignal into the ref so useWebRTC can use it
  useEffect(() => {
    sendSignalRef.current = sendSignal;
  }, [sendSignal]);

  // Chat hook
  const { messages, sendMessage, rateLimitNotice } = useChat({
    roomId,
    userName,
    enabled: !loading && !error && !!room,
  });

  // CHANGED: Loading spinner on accent.
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      </div>
    );
  }

  // CHANGED: Error state uses danger icon, ink heading, muted description.
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-danger" />
          <h1 className="font-display text-xl font-semibold text-ink">{error}</h1>
          <p className="mt-2 text-sm text-muted">
            Please check the room link or create a new room.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1">
      {role === "host" ? (
        <HostView
          onStartShare={startSharing}
          onStopShare={stopSharing}
          isSharing={isSharing}
          connectionState={connectionState}
          connectionQuality={connectionQuality}
          roomId={roomId}
        />
      ) : (
        <ViewerView
          remoteStream={remoteStream}
          connectionState={connectionState}
          roomId={roomId}
        />
      )}
      <ChatPanel
        messages={messages}
        onSend={sendMessage}
        userName={userName}
        rateLimitNotice={rateLimitNotice}
      />
    </div>
  );
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          {/* CHANGED: Suspense spinner on accent. */}
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
        </div>
      }
    >
      <RoomPageInner />
    </Suspense>
  );
}
