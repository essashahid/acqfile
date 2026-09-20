import { env, jobsConfigured } from "@/lib/env";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import { Notice } from "@/components/ui/panel";
import { requireStaff } from "@/lib/workspace";
import { signOutAction } from "../actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, workspace, isPublic } = await requireStaff();
  const e = env();
  return (
    <div className="flex min-h-screen flex-col">
      <AppNav
        isPublic={isPublic}
        email={user.email}
        role={workspace.role}
        workspaceName={workspace.name}
        signOutAction={signOutAction}
      />
      <main
        id="main-content"
        className="mx-auto w-full max-w-[1520px] flex-1 px-4 py-6 sm:px-6 sm:py-7"
      >
        <Notice tone="accent" title="Synthetic data only" className="mb-5">
          Real-data processing is disabled. This workspace uses invented people and organizations.
        </Notice>
        {e.PUBLIC_DEMO_MODE ? (
          <Notice
            tone="accent"
            title="Synthetic demo workspace."
            className="mb-5 no-print"
            actions={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                <span className="text-[var(--muted)]">Try:</span>
                <Link href="/staff/deals" className="font-medium underline underline-offset-2">
                  Open a deal
                </Link>
                <Link href="/staff/rulepacks" className="font-medium underline underline-offset-2">
                  Read the rule packs
                </Link>
                {isPublic ? (
                  <Link href="/login" className="font-semibold underline underline-offset-2">
                    Sign in to manage
                  </Link>
                ) : null}
              </span>
            }
          >
            Synthetic deal fixtures.
            {e.LLM_PROVIDER === "mock"
              ? " Model output comes from a deterministic test provider."
              : ""}
          </Notice>
        ) : null}
        {!isPublic && !jobsConfigured() ? (
          <Notice
            tone="warn"
            title="Background processing is not connected."
            className="mb-5 no-print"
          >
            Batch intake and reprocessing stay unavailable until Inngest is configured.
          </Notice>
        ) : null}
        {children}
      </main>
    </div>
  );
}
