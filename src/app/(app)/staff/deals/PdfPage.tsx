"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Box = { key: string; left: number; top: number; width: number; height: number };

/**
 * Renders one page of a private original in the browser (A33). The file is fetched once per link,
 * so one open is one audit event (A35). When a form field is named, its own widget on the page is
 * outlined; nothing is outlined without a field the PDF itself defines.
 */
export function PdfPage({
  url,
  page,
  field,
  widget = 0,
  label,
}: {
  url: string;
  page: number;
  field?: string;
  widget?: number;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  const [doc, setDoc] = useState<{ url: string; pdf: PDFDocumentProxy } | null>(null);
  const [rendered, setRendered] = useState("");
  const [box, setBox] = useState<Box | null>(null);
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
        const viewport = source.getViewport({ scale: 1.4 });
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
        setRendered(`${url}:${page}`);
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
  // The outline is read from the page's own form widgets, as a share of the page's size.
  useEffect(() => {
    if (!doc || doc.url !== url || !field) return;
    let cancelled = false;
    void (async () => {
      try {
        const source = await doc.pdf.getPage(page);
        const viewport = source.getViewport({ scale: 1 });
        const widgets = (await source.getAnnotations()).filter(
          (a: { fieldName?: string }) => a.fieldName === field,
        );
        const found = widgets[widget] ?? widgets[0];
        if (cancelled || !found) return;
        const [rx1, ry1, rx2, ry2] = found.rect as number[];
        const [x1, y1] = viewport.convertToViewportPoint(rx1!, ry1!) as number[];
        const [x2, y2] = viewport.convertToViewportPoint(rx2!, ry2!) as number[];
        setBox({
          key: `${url}:${page}:${field}:${widget}`,
          left: (Math.min(x1!, x2!) / viewport.width) * 100,
          top: (Math.min(y1!, y2!) / viewport.height) * 100,
          width: (Math.abs(x2! - x1!) / viewport.width) * 100,
          height: (Math.abs(y2! - y1!) / viewport.height) * 100,
        });
      } catch {
        /* no outline; the page itself still shows */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, url, page, field, widget]);
  const shown = box && field && box.key === `${url}:${page}:${field}:${widget}` ? box : null;
  // Bring the outlined field to the middle of the scrolling source panel.
  useEffect(() => {
    const el = boxRef.current;
    if (!shown || !el || rendered !== `${url}:${page}`) return;
    const panel = el.closest<HTMLElement>("[data-scroll]");
    if (!panel) return;
    const a = el.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    panel.scrollTop += a.top - p.top - p.height / 2 + a.height / 2;
  }, [shown, rendered, url, page]);
  const failed = error?.key === url || error?.key === `${url}:${page}`;
  return (
    <div aria-busy={!failed && rendered !== `${url}:${page}`} className="pdf-page">
      {!failed && rendered !== `${url}:${page}` ? (
        <p role="status" className="meta mb-3">
          Loading page {page}…
        </p>
      ) : null}
      {failed ? (
        <p role="status">{error!.message}</p>
      ) : (
        <div className="relative">
          <canvas ref={ref} aria-label={`Source page ${page}`} className="w-full border bg-white" />
          {shown && rendered === `${url}:${page}` ? (
            <>
              <span
                ref={boxRef}
                className="pdf-field"
                style={{
                  left: `${shown.left}%`,
                  top: `${shown.top}%`,
                  width: `${shown.width}%`,
                  height: `${shown.height}%`,
                }}
                aria-hidden
              />
              {label ? (
                <span
                  className="pdf-field-tag"
                  style={{ left: `${shown.left}%`, top: `${shown.top}%` }}
                >
                  {label}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
