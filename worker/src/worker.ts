import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import axios from "axios";
import dotenv from "dotenv";
import { transcribeAudio } from "./whisper";

dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:5000";
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

// =========================
// REDIS CONNECTIONS
// (BullMQ recommends a dedicated connection per Queue/Worker.)
// =========================

const workerConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const notifyConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const notifyQueue = new Queue("bot-notifications", {
  connection: notifyConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// =========================
// WORKER
// =========================

const worker = new Worker(
  "voice-processing",
  async (job) => {
    console.log("[voice-worker] job received", { jobId: job.id });

    const { telegramId, fileUrl } = job.data;
    const text = await transcribeAudio(fileUrl);

    if (!text || text.trim() === "") {
      throw new Error("Empty transcription result");
    }

    const response = await axios.post(
      `${BACKEND_URL.replace(/\/$/, "")}/tasks`,
      { title: text, telegramId },
      { timeout: 15_000 }
    );

    const task = response.data;
    console.log("[voice-worker] task created", {
      jobId: job.id,
      taskNumber: task?.taskNumber,
    });

    await notifyQueue.add("voice_task_created", {
      type: "voice_task_created",
      telegramId: job.data.telegramId,
      chatId: job.data.chatId,
      statusMessageId: job.data.statusMessageId,
      task,
      transcript: text,
    });

    return task;
  },
  { connection: workerConnection }
);

worker.on("failed", async (job, err) => {
  const finalAttempt =
    !job || (job.attemptsMade ?? 0) >= (job.opts.attempts ?? 1);

  console.error(
    "[voice-worker] job failed",
    {
      jobId: job?.id,
      attempt: job?.attemptsMade,
      maxAttempts: job?.opts?.attempts,
      final: finalAttempt,
    },
    err?.message
  );

  // Don't surface intermediate retries to the user — they'd see "failed"
  // followed by a successful task card on the next attempt.
  if (!finalAttempt) return;
  if (!job?.data?.chatId || !job?.data?.statusMessageId) return;

  try {
    await notifyQueue.add("voice_failed", {
      type: "voice_failed",
      telegramId: job.data.telegramId,
      chatId: job.data.chatId,
      statusMessageId: job.data.statusMessageId,
      reason: err?.message || "Unknown error",
    });
  } catch (notifyErr: any) {
    console.error(
      "[voice-worker] failed to enqueue voice failure:",
      notifyErr?.message
    );
  }
});

worker.on("error", (err) => {
  console.error("[voice-worker]", err);
});

console.log("[voice-worker] started");
