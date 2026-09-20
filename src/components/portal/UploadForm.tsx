"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function UploadForm({
  base,
  task,
  replace,
}: {
  base: string;
  task: string;
  replace?: string;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMessage("");
        const data = new FormData(e.currentTarget);
        data.set("kind", "upload");
        data.set("task", task);
        if (replace) data.set("replace", replace);
        for (const f of files) data.append("files", f);
        try {
          const res = await fetch(`${base}/action`, { method: "POST", body: data });
          const body = await res.json();
          if (!res.ok) {
            setMessage(body.message);
            setPending(false);
          } else router.push(`${base}/uploads/${body.receipt}`);
        } catch {
          setMessage(
            "We couldn't finish sending this just now. Please try again; your list is still here.",
          );
          setPending(false);
        }
      }}
    >
      <div
        className="my-8 rounded-[14px] border-2 border-dashed border-[#b7b3aa] bg-white px-5 py-10 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <h3>Drag your files here</h3>
        <p className="muted my-3">or</p>
        <label className="button primary cursor-pointer" htmlFor="upload-files">
          Choose files
        </label>
        <input
          id="upload-files"
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
          className="sr-only"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <p className="muted mt-4">
          PDF, Word, Excel, JPG or PNG. Photos become one document in the order you choose.
        </p>
      </div>
      {files.length > 0 && (
        <ol aria-label="Files to send" className="mb-6">
          {files.map((_, i) => (
            <li
              className="flex items-center justify-between border-b border-[var(--line)] py-2"
              key={i}
            >
              <span>File {i + 1}</span>
              {i > 0 && (
                <button
                  type="button"
                  className="text-link"
                  aria-label={`Move file ${i + 1} earlier`}
                  onClick={() =>
                    setFiles((current) => {
                      const next = [...current];
                      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                      return next;
                    })
                  }
                >
                  Move earlier
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <label className="mb-2 block font-semibold" htmlFor="upload-note">
        Anything your adviser should know? (optional)
      </label>
      <textarea name="note" id="upload-note" rows={3} maxLength={2000} />
      <p role="status" className="my-3">
        {message}
      </p>
      <button className="primary mb-6 w-full sm:w-auto" disabled={pending || !files.length}>
        {pending ? "Sending your document…" : replace ? "Replace this file" : "Send your document"}
      </button>
    </form>
  );
}
