import { redirect } from "next/navigation";
import { DEMO_PROFILES, demoProfilesEnabled } from "@/lib/auth/profiles";
import { getCurrentUser } from "@/lib/auth/session";
import { PRODUCT_NAME } from "@/lib/product";
import { Notice } from "@/components/ui/panel";
import { LoginForm } from "./LoginForm";
import { ProfilePicker } from "./ProfilePicker";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams,
    user = await getCurrentUser();
  if (user && !params.error) redirect("/");
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";
  const profiles = demoProfilesEnabled() ? DEMO_PROFILES : [];
  const profileProblem = params.error === "profile";
  const formError =
    params.error && !profileProblem ? "Please sign in with your adviser account." : null;
  return (
    <main className="portal flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-[420px]">
        <p className="muted">{PRODUCT_NAME} · Secure document portal</p>
        {profiles.length ? (
          <>
            <h1>Pick a profile to begin</h1>
            <p className="mb-6">
              This is a demonstration with sample data. Choose how you want to see it. No account
              needed.
            </p>
            {profileProblem ? (
              <Notice tone="bad" className="mb-4">
                That profile is not set up on this site yet. Please sign in with an account instead.
              </Notice>
            ) : null}
            <ProfilePicker profiles={profiles} next={next} />
            <div className="my-8 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-[#c3c0b8]" />
              <span className="muted text-[14px]">or sign in with an account</span>
              <span className="h-px flex-1 bg-[#c3c0b8]" />
            </div>
          </>
        ) : (
          <>
            <h1>Welcome back</h1>
            <p className="mb-8">Sign in to prepare your clients&apos; loan files.</p>
          </>
        )}
        <LoginForm next={next} initialError={formError} />
        <p className="muted mt-8">
          Sending documents? Please use the personal link your adviser sent you.
        </p>
        {profiles.length ? null : (
          <footer className="muted mt-8">This is a demonstration with sample data.</footer>
        )}
      </div>
    </main>
  );
}
