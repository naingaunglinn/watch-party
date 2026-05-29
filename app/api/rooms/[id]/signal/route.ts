import { getRedis, roomKey, roomSignalsKey, ROOM_TTL } from "@/lib/redis";
import { Signal } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const redis = getRedis();
    const { id } = await params;
    const body = await request.json();
    const { type, from, payload } = body as Omit<Signal, "ts">;

    if (!type || !from || payload === undefined) {
      return Response.json({ error: "Missing signal fields" }, { status: 400 });
    }

    const signal: Signal = {
      type,
      from,
      payload,
      ts: Date.now(),
    };

    const pipe = redis.pipeline();
    pipe.rpush(roomSignalsKey(id), JSON.stringify(signal));
    pipe.expire(roomSignalsKey(id), ROOM_TTL);
    pipe.expire(roomKey(id), ROOM_TTL);
    await pipe.exec();

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error sending signal:", error);
    return Response.json({ error: "Failed to send signal" }, { status: 500 });
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

    const signals = await redis.lrange<string>(roomSignalsKey(id), cursor, -1);

    // Upstash auto-deserializes JSON-shaped values on read, so entries can come
    // back as either strings (older clients) or already-parsed objects.
    const parsed = signals.map((s) =>
      typeof s === "string" ? (JSON.parse(s) as Signal) : (s as unknown as Signal)
    );

    return Response.json({
      signals: parsed,
      nextCursor: cursor + signals.length,
    });
  } catch (error) {
    console.error("Error fetching signals:", error);
    return Response.json({ error: "Failed to fetch signals" }, { status: 500 });
  }
}
