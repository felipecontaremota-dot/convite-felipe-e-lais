import { test, expect } from "@playwright/test";
import {
  confirmationLabels,
  responseMessages,
  presenceChoices,
} from "../../src/features/rsvp/presenceContent";

for (const width of [1280, 390]) {
  test(`Presence saves all transitions without duplicate RSVP at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    await page.getByRole("link", { name: "Presença", exact: true }).click();
    const card = page
      .getByText("Convidada Dois", { exact: true })
      .filter({ visible: true })
      .locator("..");
    await expect(
      card.getByText(responseMessages.PENDING, { exact: true }),
    ).toHaveCount(0);
    // Covers all six directed transitions and initial explicit PENDING.
    for (const status of [
      "PENDING",
      "CONFIRMED",
      "DECLINED",
      "PENDING",
      "DECLINED",
      "CONFIRMED",
      "PENDING",
    ] as const) {
      const edit = card.getByRole("button", {
        name: "Editar minha confirmação",
        exact: true,
      });
      if (await edit.count()) await edit.click();
      for (const option of presenceChoices) {
        const radio = card.getByRole("radio", {
          name: option.label,
          exact: true,
        });
        await expect(radio).toBeVisible();
        expect(
          await radio.evaluate((el) => {
            const box = el.getBoundingClientRect(),
              parent = el.parentElement!.getBoundingClientRect();
            const text = el.firstElementChild as HTMLElement;
            return (
              box.height >= 48 &&
              box.left >= parent.left &&
              box.right <= parent.right + 1 &&
              text.scrollWidth <= text.clientWidth &&
              text.scrollHeight <= text.clientHeight
            );
          }),
        ).toBe(true);
      }
      await card
        .getByRole("radio", {
          name: presenceChoices.find((o) => o.value === status)!.label,
          exact: true,
        })
        .click();
      await expect(
        card.getByRole("button", {
          name: confirmationLabels[status],
          exact: true,
        }),
      ).toBeVisible();
      await card
        .getByRole("button", { name: confirmationLabels[status], exact: true })
        .click();
      await expect(
        card.getByText(responseMessages[status], { exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const s = JSON.parse(localStorage.getItem("demo-db")!).snapshot;
            return s.rsvps.filter(
              (r: { guest_id: string }) => r.guest_id === s.guests[1].id,
            );
          }),
        )
        .toEqual([
          expect.objectContaining({
            status,
            responded_at: expect.any(String),
            source: "APP",
          }),
        ]);
    }
    await page.reload();
    await expect(
      card.getByText(responseMessages.PENDING, { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

for (const status of ["CONFIRMED", "DECLINED", "PENDING"] as const) {
  test(`Offline ${status} reflects the queued choice and synchronizes once`, async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    await page.getByRole("link", { name: "Presença", exact: true }).click();
    const card = page
      .getByText("Convidada Dois", { exact: true })
      .filter({ visible: true })
      .locator("..");
    await card
      .getByRole("radio", {
        name: presenceChoices.find((o) => o.value === status)!.label,
        exact: true,
      })
      .click();
    await context.setOffline(true);
    await expect(
      page
        .getByText(
          "Sem conexão · exibindo os últimos dados salvos neste dispositivo.",
          { exact: true },
        )
        .filter({ visible: true }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: confirmationLabels[status], exact: true })
      .click();
    await expect(
      card.getByText(responseMessages[status], { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("demo-db")!).snapshot;
        return s.rsvps.find(
          (r: { guest_id: string }) => r.guest_id === s.guests[1].id,
        ).responded_at;
      }),
    ).toBeNull();
    await card
      .getByRole("button", { name: "Editar minha confirmação", exact: true })
      .click();
    await expect(
      card.getByRole("radio", {
        name: presenceChoices.find((o) => o.value === status)!.label,
        exact: true,
      }),
    ).toHaveAttribute("aria-checked", "true");
    await context.setOffline(false);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const s = JSON.parse(localStorage.getItem("demo-db")!).snapshot;
          return s.rsvps.filter(
            (r: { guest_id: string }) => r.guest_id === s.guests[1].id,
          );
        }),
      )
      .toEqual([
        expect.objectContaining({ status, responded_at: expect.any(String) }),
      ]);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Object.keys(localStorage)
              .filter((k) => k.startsWith("queue:"))
              .flatMap((k) => JSON.parse(localStorage.getItem(k)!)).length,
        ),
      )
      .toBe(0);
    await page.reload();
    await expect(
      card.getByText(responseMessages[status], { exact: true }),
    ).toBeVisible();
  });
}
