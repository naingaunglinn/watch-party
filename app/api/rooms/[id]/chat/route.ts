import { getRedis, roomKey, roomChatKey, ROOM_TTL } from "@/lib/redis";
import { ChatMessage } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const redis = getRedis();
    const { id } = await params;
    const body = await request.json();
    const { from, text } = body as Omit<ChatMessage, "ts">;

    if (!from || !text) {
      return Response.json({ error: "Missing chat fields" }, { status: 400 });
    }

    const message: ChatMessage = {
      from,
      text,
      ts: Date.now(),
    };

    const pipe = redis.pipeline();
    pipe.rpush(roomChatKey(id), JSON.stringify(message));
    pipe.expire(roomChatKey(id), ROOM_TTL);
    pipe.expire(roomKey(id), ROOM_TTL);
    await pipe.exec();

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error sending chat:", error);
    return Response.json({ error: "Failed to send chat" }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const redis = getRedis();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const cursor = parseInt(searchParams.get("cursor") || "0", 10);

    const messages = await redis.lrange<string>(roomChatKey(id), cursor, -1);

    // Upstash auto-deserializes JSON-shaped values on read; handle both shapes.
    const parsed = messages.map((m) =>
      typeof m === "string"
        ? (JSON.parse(m) as ChatMessage)
        : (m as unknown as ChatMessage)
    );

    return Response.json({
      messages: parsed,
      nextCursor: cursor + messages.length,
    });
  } catch (error) {
    console.error("Error fetching chat:", error);
    return Response.json({ error: "Failed to fetch chat" }, { status: 500 });
  }
}
