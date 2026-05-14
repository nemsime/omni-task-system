import { Queue, Worker } from "bullmq";
import { createRedisConnection } from "../config/redis";
import { emitTaskCreated } from "../realtime";
import { TaskService } from "../services/task.service";
import { transcribeAudio } from "./whisper";

export function startVoiceWorker() {
  if (process.env.ENABLE_VOICE_WORKER === "false") {
    console.log("Voice worker disabled");
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY is missing; voice worker not started");
    return;
  }

  const workerConnection = createRedisConnection();
  const notifyConnection = createRedisConnection();

  const notifyQueue = new Queue("bot-notifications", {
    connection: notifyConnection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

  const worker = new Worker(
    "voice-processing",
    async (job) => {
      console.log("Voice job received:", job.id);

      const { telegramId, fileUrl } = job.data;
      const text = await transcribeAudio(fileUrl);

      if (!text || text.trim() === "") {
        throw new Error("Empty transcription result");
      }

      const task = await TaskService.createTask(text, telegramId);
      emitTaskCreated(telegramId, task);

      await notifyQueue.add("voice_task_created", {
        type: "voice_task_created",
        telegramId,
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

    // Only notify the user once we've exhausted retries; transient failures
    // shouldn't surface a "failed" status mid-retry.
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

  console.log("Voice worker started");
}
