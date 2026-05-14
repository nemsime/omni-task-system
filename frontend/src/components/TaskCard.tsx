import type { Task, TaskStatus } from "../api";

const TRANSITIONS: Record<TaskStatus, { label: string; next: TaskStatus }[]> = {
  Pending: [
    { label: "Start", next: "In Progress" },
    { label: "Done", next: "Completed" },
  ],
  "In Progress": [
    { label: "Back", next: "Pending" },
    { label: "Done", next: "Completed" },
  ],
  Completed: [{ label: "Reopen", next: "Pending" }],
};

export function TaskCard({
  task,
  onMove,
  onDelete,
  disabled,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  onMove: (next: TaskStatus) => void;
  onDelete: () => void;
  disabled?: boolean;
  dragging?: boolean;
  onDragStart: (task: Task) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className={`task-card status-${task.status.replace(/\s+/g, "-")}${
        dragging ? " dragging" : ""
      }`}
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(task.id));
        onDragStart(task);
      }}
      onDragEnd={onDragEnd}
    >
      <div className="task-meta">
        <span className="task-number">#{task.taskNumber}</span>
        <span className="task-date">
          {new Date(task.createdAt).toLocaleString()}
        </span>
      </div>
      <div className="task-title">{task.title}</div>
      <div className="task-actions">
        {TRANSITIONS[task.status].map((t) => (
          <button
            key={t.next}
            disabled={disabled}
            onClick={() => onMove(t.next)}
          >
            {t.label}
          </button>
        ))}
        <button
          className="task-delete"
          disabled={disabled}
          onClick={onDelete}
          title="Delete task"
          aria-label="Delete task"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
