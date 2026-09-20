"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDealAction } from "./actions";
export function IntakeForm({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ name: string; versionId: string; outcome: string }[]>(
    [],
  );
  const [message, setMessage] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (files.length > 200 || files.some((f) => f.size > 10 * 1024 * 1024)) {
          setMessage("Choose at most 200 files, each no larger than 10 MB.");
          return;
        }
        setBusy(true);
        setMessage("");
        setResults([]);
        try {
          const data = new FormData();
          files.forEach((f) => {
            data.append("files", f);
            data.append("paths", f.webkitRelativePath || f.name);
          });
          const out = await uploadDealAction(dealId, data);
          setMessage(`Batch ${out.batch}: ${out.count} files received`);
          setResults(out.files);
          setFiles([]);
          router.refresh();
        } catch (e) {
          setMessage(
            `${e instanceof Error ? e.message : "Intake could not finish"}. Check upload history before retrying: any files already received remain saved.`,
          );
          router.refresh();
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
      {files.length > 0 ? (
        <ul className="max-h-40 overflow-auto text-sm divide-y divide-[var(--line)]">
          {files.map((file, i) => (
            <li className="py-2 flex justify-between gap-3" key={`${file.name}-${i}`}>
              <span className="break-all">{file.webkitRelativePath || file.name}</span>
              <span className="meta shrink-0">{Math.ceil(file.size / 1024)} KB</span>
            </li>
          ))}
        </ul>
      ) : null}
      <button disabled={busy || !files.length} className="btn btn-primary">
        {busy ? "Processing batch…" : "Upload batch"}
      </button>
      {busy ? (
        <p className="meta" role="status">
          Receiving files and checking their contents. Individual results will appear below; upload
          success alone does not mean a requirement is complete.
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="divide-y divide-[var(--line)]">
          {results.map((r, i) => (
            <li key={i} className="py-3">
              <Link className="link" href={`/staff/deals/${dealId}/documents/${r.versionId}`}>
                {r.name}
              </Link>
              <p className="meta">{r.outcome}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <p role="status" className="meta min-h-[1.2em]" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
