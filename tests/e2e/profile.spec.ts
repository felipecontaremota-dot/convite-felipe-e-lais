import { test, expect } from "@playwright/test";
const label = "Revogar permissão de receber mensagens e notificações";
for (const width of [390, 1280]) {
  test(`Profile contact, opt-out, isolation, keyboard and reload at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    await page.getByRole("link", { name: "Perfil", exact: true }).click();
    const card = page
      .getByRole("button", {
        name: "Salvar contato de Convidado Um",
        exact: true,
      })
      .locator("..");
    const other = page
      .getByRole("button", {
        name: "Salvar contato de Convidada Dois",
        exact: true,
      })
      .locator("..");
    const checkbox = card.getByRole("checkbox", { name: label, exact: true });
    await expect(checkbox).not.toBeChecked();
    const phone = card.getByLabel("WhatsApp de Convidado Um", { exact: true });
    await card
      .getByLabel("E-mail de Convidado Um", { exact: true })
      .fill("profile@example.test");
    await phone.fill("62999999999");
    await expect(phone).toHaveValue("(62) 9 9999-9999");
    await phone.press("End");
    await phone.pressSequentially("123abc");
    await expect(phone).toHaveValue("(62) 9 9999-9999");
    await phone.press("Backspace");
    await expect(phone).toHaveValue("(62) 9 9999-999");
    await phone.fill("(62) 9 9999-9999");
    await card
      .getByRole("button", { name: "Salvar contato de Convidado Um" })
      .click();
    await expect(
      card.getByText("Salvo com sucesso.", { exact: true }),
    ).toBeVisible();
    const originalConsents = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      const guest = db.snapshot.guests.find(
        (g: { name: string }) => g.name === "Convidado Um",
      );
      const c = db.snapshot.contacts.find(
        (c: { guest_id: string }) => c.guest_id === guest.id,
      );
      return [
        c.consent_in_app,
        c.consent_push,
        c.consent_email,
        c.consent_whatsapp,
      ];
    });
    expect(originalConsents).toEqual([true, false, false, false]);
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    await card
      .getByRole("button", { name: "Salvar contato de Convidado Um" })
      .click();
    await expect(
      card.getByText("Salvo com sucesso.", { exact: true }),
    ).toBeVisible();
    await expect(
      other.getByRole("checkbox", { name: label }),
    ).not.toBeChecked();
    await page.reload();
    await expect(checkbox).toBeChecked();
    await expect(phone).toHaveValue("(62) 9 9999-9999");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const db = JSON.parse(localStorage.getItem("demo-db") || "{}");
          const guest = db.snapshot?.guests.find(
            (g: { name: string }) => g.name === "Convidado Um",
          );
          return db.snapshot?.contacts.find(
            (c: { guest_id: string }) => c.guest_id === guest?.id,
          )?.whatsapp;
        }),
      )
      .toBe("62999999999");
    await page
      .getByRole("button", { name: "Sair deste dispositivo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    await page.getByRole("link", { name: "Perfil", exact: true }).click();
    await expect(checkbox).toBeChecked();
    await context.setOffline(true);
    await expect(
      page.getByText(/Sem conexão/).filter({ visible: true }),
    ).toBeVisible();
    await checkbox.click();
    await card
      .getByRole("button", { name: "Salvar contato de Convidado Um" })
      .click();
    await expect(
      card.getByText(
        "Salvo neste dispositivo. Será sincronizado quando houver conexão.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      card.getByText("Salvo com sucesso.", { exact: true }),
    ).toHaveCount(0);
    await context.setOffline(false);
    await expect(
      page.getByText(/Sem conexão/).filter({ visible: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("1 alteração aguardando sincronização", { exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(checkbox).not.toBeChecked();
    const restoredConsents = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      const guest = db.snapshot.guests.find(
        (g: { name: string }) => g.name === "Convidado Um",
      );
      const c = db.snapshot.contacts.find(
        (c: { guest_id: string }) => c.guest_id === guest.id,
      );
      return [
        c.consent_in_app,
        c.consent_push,
        c.consent_email,
        c.consent_whatsapp,
        c.communications_revoked,
      ];
    });
    expect(restoredConsents).toEqual([true, false, false, false, false]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
