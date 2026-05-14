import { useEffect, useState } from "react";
import { fetchTasks, type Task } from "./api";
import { createSocket } from "./socket";

type State = {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  connected: boolean;
};

export function useTasks(telegramId: string | null): State {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!telegramId) {
      setTasks([]);
      setConnected(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTasks(telegramId)
      .then((list) => {
        if (!cancelled) setTasks(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const socket = createSocket(telegramId);

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("task:created", (task: Task) => {
      setTasks((prev) => {
        if (prev.some((t) => t.id === task.id)) return prev;
        return [task, ...prev];
      });
    });

    socket.on("task:updated", (task: Task) => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    });

    socket.on("task:deleted", (payload: { id: number }) => {
      setTasks((prev) => prev.filter((t) => t.id !== payload.id));
    });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [telegramId]);

  return { tasks, loading, error, connected };
}
