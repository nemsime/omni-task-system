import { useState } from "react";
import { useTelegramId } from "./useTelegramId";
import { useTasks } from "./useTasks";
import {
  deleteTask,
  updateTaskStatus,
  type Task,
  type TaskStatus,
} from "./api";
import { LoginCard } from "./components/LoginCard";
import { Kanban } from "./components/Kanban";
import "./App.css";

function App() {
  const { telegramId, setTelegramId } = useTelegramId();
  const { tasks, loading, error, connected } = useTasks(telegramId);
  const [pendingUpdates, setPendingUpdates] = useState<Set<number>>(new Set());

  if (!telegramId) {
    return (
      <div className="app login-view">
        <LoginCard onSubmit={setTelegramId} />
      </div>
    );
  }

  const handleMove = async (task: Task, next: TaskStatus) => {
    setPendingUpdates((s) => new Set(s).add(task.id));
    try {
      await updateTaskStatus(telegramId, task.taskNumber, next);
      // The server emits task:updated back via socket and useTasks merges it,
      // so no optimistic local mutation is needed here.
    } catch (err) {
      console.error(err);
      alert("Failed to update task");
    } finally {
      setPendingUpdates((s) => {
        const copy = new Set(s);
        copy.delete(task.id);
        return copy;
      });
    }
  };

  const handleDelete = async (task: Task) => {
    if (!window.confirm(`Delete task #${task.taskNumber} permanently?`)) {
      return;
    }
    setPendingUpdates((s) => new Set(s).add(task.id));
    try {
      await deleteTask(telegramId, task.taskNumber);
      // The server emits task:deleted back via socket and useTasks removes it.
    } catch (err) {
      console.error(err);
      alert("Failed to delete task");
      setPendingUpdates((s) => {
        const copy = new Set(s);
        copy.delete(task.id);
        return copy;
      });
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Omni Task Dashboard</div>
        <div className="user">
          <span
            className={`dot ${connected ? "dot-online" : "dot-offline"}`}
            title={connected ? "Realtime connected" : "Realtime disconnected"}
          />
          <span className="tg-id">tg: {telegramId}</span>
          <button className="link" onClick={() => setTelegramId(null)}>
            Sign out
          </button>
        </div>
      </header>

      <main>
        {loading && <div className="status-bar">Loading tasks…</div>}
        {error && <div className="status-bar error">Error: {error}</div>}
        {!loading && !error && tasks.length === 0 && (
          <div className="status-bar">
            No tasks yet. Send a message to the bot to create one.
          </div>
        )}
        <Kanban
          tasks={tasks}
          onMove={handleMove}
          onDelete={handleDelete}
          pendingUpdates={pendingUpdates}
        />
      </main>
    </div>
  );
}

export default App;
