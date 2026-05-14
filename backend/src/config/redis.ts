import IORedis, { RedisOptions } from "ioredis";

const defaultRedisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
};

export function createRedisConnection() {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    return new IORedis(redisUrl, defaultRedisOptions);
  }

  return new IORedis({
    ...defaultRedisOptions,
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  });
}
