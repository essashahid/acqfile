import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: "admin@example.com", password: "acqfile-admin" };
export const REVIEWER = { email: "reviewer@example.com", password: "acqfile-reviewer" };

export async function login(page: Page, user = ADMIN) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
