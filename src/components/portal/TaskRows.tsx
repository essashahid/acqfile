import Link from "next/link";
import type { Task } from "@/lib/portal/map";
export function TaskRows({ tasks, base }: { tasks: Task[]; base: string }) {
  return (
    <div>
      {tasks.map((t) => (
        <div
          className="row flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          key={t.key}
        >
          <div>
            <h3>{t.title}</h3>
            <p>{t.sentence}</p>
          </div>
          <Link
            className={`button shrink-0 ${t.state === "To do" ? "primary" : "secondary"}`}
            href={`${base}/tasks/${t.key}`}
          >
            {t.state === "To do" ? "Upload" : "View"}
          </Link>
        </div>
      ))}
    </div>
  );
}
