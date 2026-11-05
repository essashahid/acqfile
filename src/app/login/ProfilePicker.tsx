"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { DemoProfile } from "@/lib/auth/profiles";
import { enterProfileAction } from "./actions";

function ProfileButton({ profile }: { profile: DemoProfile }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="profile"
      value={profile.key}
      disabled={pending}
      aria-disabled={pending}
      className="profile-card"
    >
      <span className="flex w-full items-center justify-between gap-3">
        <span className="profile-title">{profile.title}</span>
        {pending ? (
          <Loader2 size={18} aria-hidden className="animate-spin" />
        ) : (
          <ArrowRight size={18} aria-hidden />
        )}
      </span>
      <span className="profile-summary">{profile.summary}</span>
    </button>
  );
}

/** One form per profile so each card carries its own pending state. */
export function ProfilePicker({
  profiles,
  next,
}: {
  profiles: readonly DemoProfile[];
  next: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {profiles.map((profile) => (
        <form key={profile.key} action={enterProfileAction}>
          <input type="hidden" name="next" value={next} />
          <ProfileButton profile={profile} />
        </form>
      ))}
    </div>
  );
}
