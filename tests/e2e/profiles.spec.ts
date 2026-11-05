import { expect, test } from "@playwright/test";

/** One-click profiles on /login: enter, leave, and switch without typing a password. */
test("a visitor can enter as Operator, leave, and come back as Adviser", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /pick a profile/i })).toBeVisible();
  for (const name of ["Adviser", "Operator", "Reviewer", "Admin"])
    await expect(page.getByRole("button", { name: new RegExp(`^${name}\\b`) })).toBeVisible();
  // The password form stays available for anyone with an account.
  await expect(page.getByLabel(/email/i)).toBeVisible();

  await page.getByRole("button", { name: /^Operator\b/ }).click();
  await expect(page).toHaveURL(/\/staff\/deals/);
  await expect(page.getByText("Operator", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: /sign out|switch profile/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /pick a profile/i })).toBeVisible();

  await page.getByRole("button", { name: /^Adviser\b/ }).click();
  await expect(page).toHaveURL(/\/deals(?!\/)/);
  await page
    .getByRole("button", { name: /sign out|switch profile/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByRole("button", { name: /^Admin\b/ }).click();
  await expect(page).toHaveURL(/\/staff\/deals/);
  await expect(page.getByText("Admin", { exact: true }).first()).toBeVisible();
});

test("a requested page is honored after choosing a profile", async ({ page }) => {
  await page.goto("/staff/how-it-works");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole("button", { name: /^Admin\b/ }).click();
  await expect(page).toHaveURL(/\/staff\/how-it-works/);
});
