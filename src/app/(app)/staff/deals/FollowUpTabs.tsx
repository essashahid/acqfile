"use client";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

export type DraftTab = {
  key: string;
  name: string;
  items: { key: string; title: string; subject: string; href: string }[];
  /** "Not sent yet", or when a message to this recipient was last recorded. */
  sent: string;
  editor: ReactNode;
};

/**
 * One tab per recipient. Every draft stays mounted while hidden, so an edit made in one tab is
 * still there after looking at another; nothing is saved until it is recorded as sent.
 */
export function FollowUpTabs({ drafts }: { drafts: DraftTab[] }) {
  const [active, setActive] = useState(drafts[0]?.key);
  const id = useId();
  return (
    <div className="fu">
      <div className="fu-tabs" role="tablist" aria-label="Recipients">
        {drafts.map((d) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            id={`${id}-tab-${d.key}`}
            aria-controls={`${id}-panel-${d.key}`}
            aria-selected={d.key === active}
            className="fu-tab"
            onClick={() => setActive(d.key)}
          >
            <span className="fu-tab-name">{d.name}</span>
            <span className="num">{d.items.length}</span>
            <span className={d.sent === "Not sent yet" ? "fu-badge is-not" : "fu-badge"}>
              {d.sent}
            </span>
          </button>
        ))}
      </div>
      {drafts.map((d) => (
        <section
          key={d.key}
          id={`${id}-panel-${d.key}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${d.key}`}
          hidden={d.key !== active}
          className="card fu-panel"
        >
          <div className="fu-items">
            <p className="eyebrow">In this message</p>
            <ul>
              {d.items.map((item) => (
                <li key={item.key}>
                  <Link className="link" href={item.href}>
                    {item.title}
                  </Link>
                  <span className="meta">{item.subject}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="fu-editor">{d.editor}</div>
        </section>
      ))}
    </div>
  );
}
