export const API_URL =
  (import.meta as any).env?.VITE_API_URL ?? "http://localhost:5000";

export type TaskStatus = "Pending" | "In Progress" | "Completed";

export type Task = {
  id: number;
  userId: number;
  taskNumber: number;
  title: string;
  status: TaskStatus;
  createdAt: string;
};

export async function fetchTasks(telegramId: string): Promise<Task[]> {
  const res = await fetch(
    `${API_URL}/tasks?telegramId=${encodeURIComponent(telegramId)}`
  );
  if (!res.ok) throw new Error(`fetchTasks failed: ${res.status}`);
  return res.json();
}

export async function updateTaskStatus(
  telegramId: string,
  taskNumber: number,
  status: TaskStatus
): Promise<Task> {
  const res = await fetch(`${API_URL}/tasks/by-number/${taskNumber}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ telegramId, status }),
  });
  if (!res.ok) throw new Error(`updateTaskStatus failed: ${res.status}`);
  return res.json();
}

export async function deleteTask(
  telegramId: string,
  taskNumber: number
): Promise<void> {
  const res = await fetch(
    `${API_URL}/tasks/by-number/${taskNumber}?telegramId=${encodeURIComponent(
      telegramId
    )}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(`deleteTask failed: ${res.status}`);
}
