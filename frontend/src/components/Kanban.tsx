import { useState } from "react";
import type { Task, TaskStatus } from "../api";
import { TaskCard } from "./TaskCard";

const COLUMNS: TaskStatus[] = ["Pending", "In Progress", "Completed"];

export function Kanban({
  tasks,
  onMove,
  onDelete,
  pendingUpdates,
}: {
  tasks: Task[];
  onMove: (task: Task, next: TaskStatus) => void;
  onDelete: (task: Task) => void;
  pendingUpdates: Set<number>;
}) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [hoverColumn, setHoverColumn] = useState<TaskStatus | null>(null);

  const byStatus: Record<TaskStatus, Task[]> = {
    Pending: [],
    "In Progress": [],
    Completed: [],
  };
  for (const t of tasks) {
    if (byStatus[t.status]) byStatus[t.status].push(t);
  }

  const handleDrop = (col: TaskStatus) => {
    setHoverColumn(null);
    if (!draggedTask) return;
    if (draggedTask.status === col) return;
    onMove(draggedTask, col);
  };

  return (
    <div className="kanban">
      {COLUMNS.map((col) => (
        <div
          key={col}
          className={`column${hoverColumn === col ? " drag-over" : ""}`}
          onDragOver={(e) => {
            if (!draggedTask || draggedTask.status === col) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (hoverColumn !== col) setHoverColumn(col);
          }}
          onDragLeave={(e) => {
            // Suppress flicker when crossing over child elements within the same column.
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            if (hoverColumn === col) setHoverColumn(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(col);
          }}
        >
          <div className="column-header">
            <span>{col}</span>
            <span className="count">{byStatus[col].length}</span>
          </div>
          <div className="column-body">
            {byStatus[col].length === 0 && (
              <div className="empty">No tasks</div>
            )}
            {byStatus[col].map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                disabled={pendingUpdates.has(task.id)}
                onMove={(next) => onMove(task, next)}
                onDelete={() => onDelete(task)}
                dragging={draggedTask?.id === task.id}
                onDragStart={(t) => setDraggedTask(t)}
                onDragEnd={() => {
                  setDraggedTask(null);
                  setHoverColumn(null);
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
