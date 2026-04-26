import { test, expect } from "@playwright/test";

test("landing page renders core sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /from hypothesis to runnable experiment/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /examples across disciplines/i })).toBeVisible();
});

test("generate route accepts hypothesis from query", async ({ page }) => {
  const hypothesis = "Replacing sucrose with trehalose improves post-thaw viability of HeLa cells.";
  await page.goto(`/generate?h=${encodeURIComponent(hypothesis)}`);
  await expect(page.getByText(hypothesis)).toBeVisible();
  await expect(page.getByText("Your hypothesis", { exact: true })).toBeVisible();
});
