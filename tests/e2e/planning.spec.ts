import { test, expect } from "@playwright/test";
for (const promoted of [false, true])
  test(`guest ${promoted ? "with wedding-party promotion" : "without promotion"} has no planning access`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    if (promoted) {
      await page.evaluate(() => {
        const db = JSON.parse(localStorage.getItem("demo-db")!);
        db.weddingParty = [
          {
            guest_id: db.snapshot.guests[0].id,
            active: true,
            role: "PADRINHO",
          },
        ];
        localStorage.setItem("demo-db", JSON.stringify(db));
      });
      await page.reload();
    }
    await expect(
      page.getByRole("link", {
        name: "Planejamento do Casamento",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.goto("/planejamento");
    await expect(
      page.getByText("Total contratado/comprometido", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Cadastrar fornecedor", exact: true }),
    ).toHaveCount(0);
  });
