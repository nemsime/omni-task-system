import { useState } from "react";

export function LoginCard({
  onSubmit,
}: {
  onSubmit: (telegramId: string) => void;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="login-card">
      <h2>Omni Task Dashboard</h2>
      <p className="hint">
        Enter your Telegram numeric ID to view your tasks. Send{" "}
        <code>/myid</code> to the bot and it will reply with your ID — paste it
        here.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = value.trim();
          if (trimmed) onSubmit(trimmed);
        }}
      >
        <input
          autoFocus
          type="text"
          placeholder="e.g. 123456789"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" disabled={!value.trim()}>
          Open dashboard
        </button>
      </form>
    </div>
  );
}
