import { test, expect } from "@playwright/test";
for (const target of ["Todos", "Família", "Pessoa"]) {
  test(`${target}: effective recipient limits prevent invalid queue entries`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo noivos", exact: true })
      .click();
    for (const count of target === "Pessoa" ? [0, 1, 501] : [0, 1, 500, 501]) {
      await page.evaluate((count) => {
        const db = JSON.parse(localStorage.getItem("demo-db")!);
        const original = db.snapshot.guests[0] || {
          invitation_id: db.snapshot.invitations[0].id,
        };
        db.snapshot.invitations = db.snapshot.invitations.map(
          (i: { active: boolean; archived_at: null }) => ({
            ...i,
            active: true,
            archived_at: null,
          }),
        );
        db.snapshot.guests = Array.from({ length: count }, (_, n) => ({
          ...original,
          id: `limit-${n}`,
          name: `Limit person ${n}`,
          invitation_id: db.snapshot.invitations[0].id,
        }));
        localStorage.setItem("demo-db", JSON.stringify(db));
      }, count);
      await page.goto("/gestao-mensagens");
      await page.reload();
      await page.getByRole("radio", { name: target, exact: true }).click();
      if (target === "Família") {
        const select = page.getByLabel("Selecionar família", { exact: true });
        const values = await select
          .locator("option")
          .evaluateAll((options) =>
            options.map((o) => (o as HTMLOptionElement).value),
          );
        await select.selectOption(values[1]);
      }
      await page
        .getByLabel("Mensagem dos noivos", { exact: true })
        .fill("Limit regression");
      if (target === "Pessoa" && count > 0) {
        await page
          .getByRole("button", { name: "Selecionar pessoa(s)", exact: true })
          .click();
        // Select through the actual controls, including all 501; never bypass submit validation.
        for (let n = 0; n < count; n++) {
          await page
            .getByRole("checkbox", { name: `Limit person ${n}`, exact: true })
            .dispatchEvent("click");
          if (n === 499) {
            await page
              .getByRole("button", { name: "Concluir seleção", exact: true })
              .click();
            await page
              .getByLabel("Mensagem dos noivos", { exact: true })
              .fill("Limit regression");
            await expect(
              page.getByText("500 destinatários", { exact: true }),
            ).toBeVisible();
            await expect(
              page.getByRole("button", { name: "Enviar recado", exact: true }),
            ).toBeEnabled();
            await page
              .getByRole("button", {
                name: "Selecionar pessoa(s)",
                exact: true,
              })
              .click();
          }
        }
        await page
          .getByRole("button", { name: "Concluir seleção", exact: true })
          .click();
      }
      await page
        .getByLabel("Mensagem dos noivos", { exact: true })
        .fill("Limit regression");
      const send = page.getByRole("button", {
        name: "Enviar recado",
        exact: true,
      });
      if (count === 0 || count > 500) {
        await expect(send).toBeDisabled();
        await expect(
          page.getByText(
            count > 500
              ? "Esta mensagem possui mais de 500 destinatários. Reduza a seleção antes de enviar."
              : target === "Todos"
                ? "Não há convidados ativos para receber esta mensagem."
                : target === "Família"
                  ? "Esta família não possui convidados ativos."
                  : "Selecione pelo menos uma pessoa.",
            { exact: true },
          ),
        ).toBeVisible();
        expect(
          await page.evaluate(() =>
            Object.keys(localStorage)
              .filter((k) => k.startsWith("queue:"))
              .flatMap((k) => JSON.parse(localStorage.getItem(k) || "[]")),
          ),
        ).toEqual([]);
      } else {
        await expect(send).toBeEnabled();
        await expect(
          page.getByText(`${count} destinatários`, { exact: true }),
        ).toBeVisible();
      }
    }
  });
}
