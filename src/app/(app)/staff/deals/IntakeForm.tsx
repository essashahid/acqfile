"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDealAction } from "./actions";
export function IntakeForm({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const data = new FormData();
          files.forEach((f) => {
            data.append("files", f);
            data.append("paths", f.webkitRelativePath || f.name);
          });
          const out = await uploadDealAction(dealId, data);
          setMessage(`Batch ${out.batch}: ${out.count} files received`);
          setFiles([]);
          router.refresh();
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Intake failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Files or ZIP</span>
        <input
          aria-label="Files or ZIP"
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Folder</span>
        <input
          aria-label="Folder"
          type="file"
          multiple
          {...{ webkitdirectory: "" }}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </label>
      <p className="meta">{files.length} selected. Up to 200 files, 10 MB each, 100 MB expanded.</p>
      <button disabled={busy || !files.length} className="btn btn-primary">
        {busy ? "Processing batch…" : "Upload batch"}
      </button>
      <p role="status" className="meta min-h-[1.2em]" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
