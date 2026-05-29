export type RoomStatus = "waiting" | "live" | "ended";

export interface Room {
  id: string;
  hostId: string;
  status: RoomStatus;
  createdAt: number;
  viewerId?: string;
  [key: string]: string | number | undefined;
}

export type SignalType = "offer" | "answer" | "ice" | "ice-batch";

export type ConnectionQuality = "good" | "degraded" | "poor" | "unknown";

export interface Signal {
  type: SignalType;
  from: "host" | "viewer";
  payload: unknown;
  ts: number;
}

export interface ChatMessage {
  from: string;
  text: string;
  ts: number;
}

export type DisplaySurface = "monitor" | "window" | "browser";
