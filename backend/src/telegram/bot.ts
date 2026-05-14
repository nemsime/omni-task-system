import type { Express } from "express";
import { Worker as BullWorker } from "bullmq";
import { Telegraf } from "telegraf";
import { createRedisConnection } from "../config/redis";
import { voiceQueue } from "../queue/voiceQueue";
import { emitTaskCreated, emitTaskDeleted, emitTaskUpdated } from "../realtime";
import { TaskService } from "../services/task.service";

const WEBHOOK_PATH = process.env.TELEGRAM_WEBHOOK_PATH || "/telegram/webhook";

function publicBaseUrl() {
  return (
    process.env.PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.BACKEND_PUBLIC_URL
  )?.replace(/\/$/, "");
}

function statusEmoji(status: string): string {
  if (status === "Completed") return "✅";
  if (status === "In Progress") return "🚧";
  return "⏳";
}

function taskCard(task: { title: string; status: string; taskNumber: number }) {
  return `📝 ${task.title}\n${statusEmoji(task.status)} ${task.status}\n#${task.taskNumber}`;
}

function taskCardKeyboard(
  taskNumber: number,
  status: string,
  telegramId: number | string
) {
  const dashUrl = dashboardLink(telegramId);
  const bottomRow: InlineButton[] = [
    { text: "🗑️ Delete", callback_data: `delete_${taskNumber}` },
  ];
  if (dashUrl) {
    bottomRow.push({ text: "🌐 Dashboard", url: dashUrl });
  }

  if (status === "Completed") {
    return { inline_keyboard: [bottomRow] };
  }

  const statusRow: InlineButton[] = [];
  if (status !== "In Progress") {
    statusRow.push({
      text: "🚧 In Progress",
      callback_data: `progress_${taskNumber}`,
    });
  }
  statusRow.push({ text: "✅ Done", callback_data: `done_${taskNumber}` });

  return { inline_keyboard: [statusRow, bottomRow] };
}

// Kept for backward-compat: users who joined before the welcome inline
// keyboard still have these reply-keyboard labels in their chat.
const BTN_MY_TASKS = "📋 My Tasks";
const BTN_MY_ID = "🆔 My ID";
const QUICK_BUTTON_LABELS = new Set([BTN_MY_TASKS, BTN_MY_ID]);

const DASHBOARD_URL =
  process.env.DASHBOARD_URL?.trim() ||
  "https://nemsime.github.io/omni-task-system/";

type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

// Per-user deep link: dropping ?tg=<id> onto the dashboard lets the SPA
// auto-fill the login, so users never have to copy their Telegram ID.
function dashboardLink(telegramId: number | string): string | null {
  if (!DASHBOARD_URL) return null;
  try {
    const url = new URL(DASHBOARD_URL);
    // GitHub Pages project sites need the trailing slash on the directory
    // path or the slash-less form 301-redirects to the user-level site
    // (showing the profile README instead of our SPA).
    if (!url.pathname.endsWith("/")) {
      url.pathname = `${url.pathname}/`;
    }
    url.searchParams.set("tg", String(telegramId));
    return url.toString();
  } catch {
    return null;
  }
}

function welcomeKeyboard(telegramId: number | string) {
  const rows: InlineButton[][] = [
    [
      { text: "📋 My Tasks", callback_data: "show_tasks" },
      { text: "🆔 My ID", callback_data: "show_id" },
    ],
  ];
  const link = dashboardLink(telegramId);
  if (link) {
    rows.push([{ text: "🌐 Open Dashboard", url: link }]);
  }
  return { inline_keyboard: rows };
}

function dashboardButtonMarkup(telegramId: number | string) {
  const link = dashboardLink(telegramId);
  if (!link) return undefined;
  return {
    inline_keyboard: [[{ text: "🌐 Open Dashboard", url: link }]],
  };
}

const BOT_COMMANDS = [
  { command: "mytasks", description: "Show my tasks" },
  { command: "myid", description: "Show my Telegram ID (for the dashboard)" },
  { command: "progress", description: "Mark a task as in progress" },
  { command: "done", description: "Mark a task as completed" },
  { command: "delete", description: "Permanently delete a task" },
];

export function setupTelegramBot(app: Express) {
  const token = process.env.BOT_TOKEN;

  if (!token) {
    console.log("BOT_TOKEN is missing; Telegram bot not started");
    return null;
  }

  const bot = new Telegraf(token);

  bot.start((ctx) => {
    ctx.reply(
      "👋 *Welcome to Omni Task Bot*\n\n" +
        "Send me a text message or a voice note — I'll turn it into a task.\n\n" +
        "Each task you create comes with quick action buttons (🚧 In Progress, ✅ Done, 🗑️ Delete).\n\n" +
        "Tap the menu button (/) anytime for more actions.",
      {
        parse_mode: "Markdown",
        reply_markup: welcomeKeyboard(ctx.from.id),
      }
    );
  });

  async function handleMyId(ctx: any) {
    await ctx.reply(
      `🆔 Your Telegram ID: \`${ctx.from.id}\`\n\nTap the dashboard button below — you'll be logged in automatically. Or paste the ID into the dashboard login form manually.`,
      {
        parse_mode: "Markdown",
        reply_markup: dashboardButtonMarkup(ctx.from.id),
      }
    );
  }
  bot.command("myid", handleMyId);
  bot.hears(BTN_MY_ID, handleMyId);
  bot.action("show_id", async (ctx) => {
    await ctx.answerCbQuery();
    await handleMyId(ctx);
  });

  async function handleMyTasks(ctx: any) {
    const telegramId = String(ctx.from.id);

    try {
      const tasks = await TaskService.getTasks(telegramId);

      if (!tasks.length) {
        return ctx.reply("📭 No tasks yet");
      }

      const message = tasks
        .map(
          (task) =>
            `${statusEmoji(task.status)} #${task.taskNumber} — ${task.title} (${task.status})`
        )
        .join("\n");

      return ctx.reply(`📋 Tasks:\n\n${message}`, {
        reply_markup: dashboardButtonMarkup(ctx.from.id),
      });
    } catch (err: any) {
      console.error("Bot /mytasks error:", err?.message);
      return ctx.reply("❌ Failed to load tasks");
    }
  }
  bot.command("mytasks", handleMyTasks);
  bot.hears(BTN_MY_TASKS, handleMyTasks);
  bot.action("show_tasks", async (ctx) => {
    await ctx.answerCbQuery();
    await handleMyTasks(ctx);
  });

  async function updateStatusViaCommand(
    ctx: any,
    command: string,
    status: "Completed" | "In Progress",
    successPrefix: string
  ) {
    const parts = ctx.message.text.split(" ");
    const taskNumber = Number(parts[1]);

    if (!Number.isInteger(taskNumber) || taskNumber <= 0) {
      return ctx.reply(`❌ Usage: ${command} TASK_NUMBER`);
    }

    const telegramId = String(ctx.from.id);

    try {
      const task = await TaskService.updateStatusByNumber(
        telegramId,
        taskNumber,
        status
      );

      if (!task) {
        return ctx.reply("❌ Task not found");
      }

      emitTaskUpdated(telegramId, task);
      return ctx.reply(`${successPrefix}\n#${task.taskNumber} ${task.title}`);
    } catch (err: any) {
      console.error(`Bot ${command} error:`, err?.message);
      return ctx.reply("❌ Failed to update");
    }
  }

  bot.command("done", (ctx) =>
    updateStatusViaCommand(ctx, "/done", "Completed", "✅ Done:")
  );
  bot.command("progress", (ctx) =>
    updateStatusViaCommand(ctx, "/progress", "In Progress", "🚧 In Progress:")
  );

  bot.command("delete", async (ctx) => {
    const parts = ctx.message.text.split(" ");
    const taskNumber = Number(parts[1]);

    if (!Number.isInteger(taskNumber) || taskNumber <= 0) {
      return ctx.reply("❌ Usage: /delete TASK_NUMBER");
    }

    const telegramId = String(ctx.from.id);

    try {
      const task = await TaskService.deleteByNumber(telegramId, taskNumber);

      if (!task) {
        return ctx.reply("❌ Task not found");
      }

      emitTaskDeleted(telegramId, {
        id: task.id,
        taskNumber: task.taskNumber,
      });
      return ctx.reply(`🗑️ Deleted:\n#${task.taskNumber} ${task.title}`);
    } catch (err: any) {
      console.error("Bot /delete error:", err?.message);
      return ctx.reply("❌ Failed to delete");
    }
  });

  bot.on("text", async (ctx) => {
    const title = ctx.message.text?.trim();
    const telegramId = String(ctx.from.id);

    if (!title || title.startsWith("/")) return;
    if (QUICK_BUTTON_LABELS.has(title)) return;

    try {
      const task = await TaskService.createTask(title, telegramId);
      emitTaskCreated(telegramId, task);

      return ctx.reply(taskCard(task), {
        reply_markup: taskCardKeyboard(task.taskNumber, task.status, telegramId),
      });
    } catch (err: any) {
      console.error("Bot create task error:", err?.message);
      return ctx.reply("❌ Failed to create task");
    }
  });

  bot.on("voice", async (ctx) => {
    const telegramId = String(ctx.from.id);

    try {
      const msg = await ctx.reply("🎤 Processing voice...");
      const file = await ctx.telegram.getFile(ctx.message.voice.file_id);

      if (!file.file_path) {
        return ctx.reply("❌ Cannot get file");
      }

      const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

      await voiceQueue.add(
        "voice",
        {
          telegramId,
          fileUrl,
          chatId: ctx.chat.id,
          statusMessageId: msg.message_id,
        },
        { jobId: `voice:${ctx.chat.id}:${ctx.message.message_id}` }
      );
    } catch (err: any) {
      console.error("Bot voice error:", err?.message);
      return ctx.reply("❌ Voice failed");
    }
  });

  async function updateStatusViaAction(
    ctx: any,
    status: "Completed" | "In Progress"
  ) {
    const taskNumber = Number(ctx.match[1]);
    const telegramId = String(ctx.from.id);

    try {
      const task = await TaskService.updateStatusByNumber(
        telegramId,
        taskNumber,
        status
      );

      if (!task) {
        await ctx.answerCbQuery("Task not found");
        return;
      }

      emitTaskUpdated(telegramId, task);
      await ctx.editMessageText(taskCard(task), {
        reply_markup: taskCardKeyboard(task.taskNumber, task.status, telegramId),
      });
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error("Bot inline status update error:", err?.message);
      await ctx.answerCbQuery("Failed");
    }
  }

  bot.action(/done_(\d+)/, (ctx) => updateStatusViaAction(ctx, "Completed"));
  bot.action(/progress_(\d+)/, (ctx) =>
    updateStatusViaAction(ctx, "In Progress")
  );

  bot.action(/delete_(\d+)/, async (ctx) => {
    const taskNumber = Number(ctx.match[1]);
    const telegramId = String(ctx.from.id);

    try {
      const task = await TaskService.deleteByNumber(telegramId, taskNumber);

      if (!task) {
        await ctx.answerCbQuery("Task not found");
        return;
      }

      emitTaskDeleted(telegramId, {
        id: task.id,
        taskNumber: task.taskNumber,
      });
      await ctx.editMessageText(
        `🗑️ Deleted #${task.taskNumber} ${task.title}`,
        { reply_markup: { inline_keyboard: [] } }
      );
      await ctx.answerCbQuery("Deleted");
    } catch (err: any) {
      console.error("Bot inline delete error:", err?.message);
      await ctx.answerCbQuery("Failed");
    }
  });

  const notifyConnection = createRedisConnection();
  const notificationsWorker = new BullWorker(
    "bot-notifications",
    async (job) => {
      const data = job.data;

      if (data.type === "voice_task_created") {
        const { chatId, statusMessageId, task, transcript, telegramId } = data;

        try {
          await bot.telegram.editMessageText(
            chatId,
            statusMessageId,
            undefined,
            `🎤 "${transcript}"`
          );
        } catch (err: any) {
          console.error("Bot edit transcript failed:", err?.message);
        }

        await bot.telegram.sendMessage(chatId, taskCard(task), {
          reply_markup: taskCardKeyboard(
            task.taskNumber,
            task.status,
            telegramId ?? chatId
          ),
        });
        return;
      }

      if (data.type === "voice_failed") {
        const { chatId, statusMessageId, reason } = data;
        const text = `❌ Voice processing failed: ${reason}`;

        try {
          await bot.telegram.editMessageText(
            chatId,
            statusMessageId,
            undefined,
            text
          );
        } catch {
          await bot.telegram.sendMessage(chatId, text);
        }
        return;
      }

      console.warn("Unknown bot notification type:", data?.type);
    },
    { connection: notifyConnection }
  );

  notificationsWorker.on("error", (err) => {
    console.error("[bot-notifications worker]", err);
  });

  notificationsWorker.on("failed", (job, err) => {
    console.error(
      "[bot-notifications worker] job failed",
      { jobId: job?.id, type: job?.data?.type },
      err?.message
    );
  });

  app.use(bot.webhookCallback(WEBHOOK_PATH));

  return {
    async start() {
      const baseUrl = publicBaseUrl();

      if (baseUrl && process.env.TELEGRAM_POLLING !== "true") {
        const webhookUrl = `${baseUrl}${WEBHOOK_PATH}`;
        await bot.telegram.setWebhook(webhookUrl);
        console.log(`Telegram webhook set: ${webhookUrl}`);
      } else {
        await bot.launch();
        console.log("Telegram bot started in polling mode");
      }

      // Register the / command menu so commands are discoverable in the
      // Telegram UI. Failure here shouldn't crash the bot startup.
      try {
        await bot.telegram.setMyCommands(BOT_COMMANDS);
        console.log("Telegram commands registered");
      } catch (err: any) {
        console.error("setMyCommands failed:", err?.message);
      }
    },
  };
}
