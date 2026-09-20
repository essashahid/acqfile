"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
/** Renders one page of a private original in the browser (A33). The file is fetched once per link, so one open is one audit event (A35). */
export function PdfPage({ url, page }: { url: string; page: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<{ url: string; pdf: PDFDocumentProxy } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf-worker";
        const task = pdfjs.getDocument({ url });
        dispose = () => {
          void task.destroy();
        };
        const pdf = await task.promise;
        if (!cancelled) setDoc({ url, pdf });
      } catch {
        if (!cancelled)
          setError({
            key: url,
            message: "This file cannot be displayed. You can still file the document manually.",
          });
      }
    })();
    return () => {
      cancelled = true;
      dispose();
    };
  }, [url]);
  useEffect(() => {
    if (!doc || doc.url !== url) return;
    let cancelled = false;
    void (async () => {
      try {
        const source = await doc.pdf.getPage(page);
        const viewport = source.getViewport({ scale: 1.2 });
        const target = ref.current;
        if (cancelled || !target) return;
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await source.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
        }).promise;
        if (cancelled) return;
        target.width = canvas.width;
        target.height = canvas.height;
        target.getContext("2d")!.drawImage(canvas, 0, 0);
      } catch {
        if (!cancelled)
          setError({
            key: `${url}:${page}`,
            message: "This page cannot be displayed. You can still file the document manually.",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, url, page]);
  const failed = error?.key === url || error?.key === `${url}:${page}`;
  return (
    <div>
      {failed ? (
        <p role="status">{error!.message}</p>
      ) : (
        <canvas ref={ref} aria-label={`Source page ${page}`} className="w-full border bg-white" />
      )}
    </div>
  );
}
