import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams,
    user = await getCurrentUser();
  if (user && !params.error) redirect("/");
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";
  return (
    <main className="portal flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-[420px]">
        <p className="muted">Secure document portal</p>
        <h1>Welcome back</h1>
        <p className="mb-8">Sign in to prepare your clients&apos; loan files.</p>
        <LoginForm
          next={next}
          initialError={params.error ? "Please sign in with your adviser account." : null}
        />
        <p className="muted mt-8">
          Sending documents? Please use the personal link your adviser sent you.
        </p>
        <footer className="muted mt-8">This is a demonstration with sample data.</footer>
      </div>
    </main>
  );
}
