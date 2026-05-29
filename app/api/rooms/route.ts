import { NextRequest } from "next/server";
import { getRedis, roomKey, roomSignalsKey, roomChatKey, ROOM_TTL } from "@/lib/redis";
import { Room } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const redis = getRedis();
    const { searchParams } = request.nextUrl;
    const role = searchParams.get("role") || "host";

    const roomId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    const room: Room = {
      id: roomId,
      hostId: userId,
      status: "waiting",
      createdAt: Date.now(),
    };

    if (role === "viewer") {
      return Response.json({ error: "Cannot create room as viewer" }, { status: 400 });
    }

    const pipe = redis.pipeline();
    pipe.hset(roomKey(roomId), room);
    pipe.expire(roomKey(roomId), ROOM_TTL);
    pipe.expire(roomSignalsKey(roomId), ROOM_TTL);
    pipe.expire(roomChatKey(roomId), ROOM_TTL);
    await pipe.exec();

    return Response.json({ roomId, userId });
  } catch (error) {
    console.error("Error creating room:", error);
    return Response.json({ error: "Failed to create room" }, { status: 500 });
  }
}
