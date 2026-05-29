import { Redis } from "@upstash/redis";

export function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("Missing Upstash Redis environment variables");
  }

  return new Redis({ url, token });
}

export const ROOM_TTL = 60 * 60 * 24; // 24 hours in seconds

export function roomKey(id: string) {
  return `room:${id}`;
}

export function roomSignalsKey(id: string) {
  return `room:${id}:signals`;
}

export function roomChatKey(id: string) {
  return `room:${id}:chat`;
}
