"use server";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/workspace";
import { markedCase } from "@/lib/demo/service";
export async function openDemoCase(id: string) {
  const ctx = await requireStaff();
  const selected = await markedCase(ctx, id);
  if (!selected) throw Error("Seed this synthetic case before opening it.");
  redirect(`/staff/deals/${selected.seededDealId}`);
}
