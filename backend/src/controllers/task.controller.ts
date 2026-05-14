import { Request, Response } from "express";
import { TaskService } from "../services/task.service";
import { voiceQueue } from "../queue/voiceQueue";
import { emitTaskCreated, emitTaskDeleted, emitTaskUpdated } from "../realtime";

const ALLOWED_STATUSES = new Set(["Pending", "In Progress", "Completed"]);

export const TaskController = {
  async getTasks(req: Request, res: Response) {
    try {
      const telegramId = req.query.telegramId as string;

      if (!telegramId) {
        return res.status(400).json({ error: "telegramId is required" });
      }

      const tasks = await TaskService.getTasks(telegramId);
      return res.json(tasks);
    } catch (error) {
      console.error("GET TASKS ERROR:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  async createTask(req: Request, res: Response) {
    try {
      const { title, telegramId } = req.body;

      if (!title || !telegramId) {
        return res.status(400).json({ error: "title and telegramId required" });
      }

      const task = await TaskService.createTask(title, telegramId);

      emitTaskCreated(telegramId, task);

      return res.json(task);
    } catch (error: any) {
      console.error("CREATE TASK ERROR:", error);
      return res.status(500).json({ error: error.message });
    }
  },

  async updateTaskByNumber(req: Request, res: Response) {
    try {
      const { taskNumber } = req.params;
      const { telegramId, status } = req.body;

      if (!telegramId) {
        return res.status(400).json({ error: "telegramId is required" });
      }
      if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({ error: "invalid status" });
      }

      const parsedNumber = Number(taskNumber);
      if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
        return res.status(400).json({ error: "invalid taskNumber" });
      }

      const task = await TaskService.updateStatusByNumber(
        telegramId,
        parsedNumber,
        status
      );

      if (!task) {
        return res.status(404).json({ error: "task not found" });
      }

      emitTaskUpdated(telegramId, task);

      return res.json(task);
    } catch (error) {
      console.error("UPDATE TASK ERROR:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  async deleteTaskByNumber(req: Request, res: Response) {
    try {
      const { taskNumber } = req.params;
      const telegramId =
        (req.query.telegramId as string) || (req.body?.telegramId as string);

      if (!telegramId) {
        return res.status(400).json({ error: "telegramId is required" });
      }

      const parsedNumber = Number(taskNumber);
      if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
        return res.status(400).json({ error: "invalid taskNumber" });
      }

      const task = await TaskService.deleteByNumber(telegramId, parsedNumber);

      if (!task) {
        return res.status(404).json({ error: "task not found" });
      }

      emitTaskDeleted(telegramId, { id: task.id, taskNumber: task.taskNumber });

      return res.json({ ok: true, id: task.id, taskNumber: task.taskNumber });
    } catch (error) {
      console.error("DELETE TASK ERROR:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  async voiceTask(req: Request, res: Response) {
    try {
      const { telegramId, fileUrl, chatId, statusMessageId } = req.body;

      if (!telegramId || !fileUrl) {
        return res.status(400).json({ error: "telegramId and fileUrl required" });
      }

      const jobOpts =
        chatId && statusMessageId
          ? { jobId: `voice:${chatId}:${statusMessageId}` }
          : undefined;

      await voiceQueue.add(
        "voice",
        { telegramId, fileUrl, chatId, statusMessageId },
        jobOpts
      );

      return res.json({ ok: true });
    } catch (error) {
      console.error("VOICE TASK ERROR:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
};
