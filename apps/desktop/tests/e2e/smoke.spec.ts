import { test, expect } from "@playwright/test";
import { launchApp } from "./launch.js";

test("desktop shell shows the Ster brand", async () => {
  const { app, page } = await launchApp();
  try {
    await expect(page.getByRole("heading", { name: "Ster" })).toBeVisible();
  } finally {
    await app.close();
  }
});
