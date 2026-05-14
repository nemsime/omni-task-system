import { Queue } from "bullmq";
import { createRedisConnection } from "../config/redis";

const connection = createRedisConnection();

export const voiceQueue = new Queue("voice-processing", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
