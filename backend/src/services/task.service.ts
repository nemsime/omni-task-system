import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";

const MAX_TASK_NUMBER_RETRIES = 5;

export const TaskService = {
  async createTask(title: string, telegramId: string) {
    const user = await prisma.user.upsert({
      where: { telegramId },
      update: {},
      create: { telegramId },
    });

    for (let attempt = 0; attempt < MAX_TASK_NUMBER_RETRIES; attempt++) {
      const lastTask = await prisma.task.findFirst({
        where: { userId: user.id },
        orderBy: { taskNumber: "desc" },
      });

      const nextNumber = lastTask ? lastTask.taskNumber + 1 : 1;

      try {
        return await prisma.task.create({
          data: {
            title,
            userId: user.id,
            taskNumber: nextNumber,
            status: "Pending",
          },
        });
      } catch (err) {
        // Two concurrent creates raced on (userId, taskNumber) — retry with a fresh max.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          continue;
        }
        throw err;
      }
    }

    throw new Error("Could not allocate taskNumber after retries");
  },

  async getTasks(telegramId: string) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) return [];

    return prisma.task.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
  },

  async updateStatusByNumber(
    telegramId: string,
    taskNumber: number,
    status: string
  ) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return null;

    const task = await prisma.task.findUnique({
      where: { userId_taskNumber: { userId: user.id, taskNumber } },
    });
    if (!task) return null;

    return prisma.task.update({
      where: { id: task.id },
      data: { status },
    });
  },

  async deleteByNumber(telegramId: string, taskNumber: number) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return null;

    const task = await prisma.task.findUnique({
      where: { userId_taskNumber: { userId: user.id, taskNumber } },
    });
    if (!task) return null;

    await prisma.task.delete({ where: { id: task.id } });
    return task;
  },
};
