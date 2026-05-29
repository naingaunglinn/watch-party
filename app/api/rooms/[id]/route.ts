import { getRedis, roomKey } from "@/lib/redis";
import { Room } from "@/lib/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const redis = getRedis();
    const { id } = await params;
    const roomData = await redis.hgetall<Room>(roomKey(id));

    if (!roomData || Object.keys(roomData).length === 0) {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }

    return Response.json(roomData);
  } catch (error) {
    console.error("Error fetching room:", error);
    return Response.json({ error: "Failed to fetch room" }, { status: 500 });
  }
}
