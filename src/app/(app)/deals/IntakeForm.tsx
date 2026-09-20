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
      className="rounded border p-4 space-y-3"
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
      <label className="block">
        Files or ZIP
        <input
          aria-label="Files or ZIP"
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </label>
      <label className="block">
        Folder
        <input
          aria-label="Folder"
          type="file"
          multiple
          {...{ webkitdirectory: "" }}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </label>
      <p>{files.length} selected. Up to 200 files, 10 MB each, 100 MB expanded.</p>
      <button disabled={busy || !files.length} className="rounded bg-teal-800 text-white px-3 py-2">
        {busy ? "Processing batch…" : "Upload batch"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
