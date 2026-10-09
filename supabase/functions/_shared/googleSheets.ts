import { requestJson } from "./http.ts";
const columns = [
  "Convidado ID",
  "Nome completo",
  "Família/Convite",
  "Grupo/vínculo",
  "RSVP",
  "Check-in",
  "Horário de entrada",
  "Restrição alimentar",
  "Contato",
  "Observações",
];
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(
    /\+/g,
    "-",
  ).replace(/\//g, "_");
}
async function googleToken() {
  const email = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    pem = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!email || !pem) throw Error("Google provider disabled");
  const raw = pem.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(
    /\s/g,
    "",
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const encode = (v: unknown) =>
    base64url(new TextEncoder().encode(JSON.stringify(v)));
  const content = `${encode({ alg: "RS256", typ: "JWT" })}.${
    encode({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  }`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(content),
  );
  const result = await requestJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${content}.${base64url(new Uint8Array(signature))}`,
    }),
  });
  return result.access_token as string;
}
export interface SheetGuest {
  id: string;
  name: string;
  family: string;
  group: string;
  rsvp: string;
  checkin: string;
  entered: string;
  dietary: string;
  contact: string;
  note: string;
}
export class GoogleSheetsAdapter {
  private token: string | null = null;
  async access() {
    if (!this.token) this.token = await googleToken();
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }
  private base() {
    const id = Deno.env.get("GOOGLE_SHEETS_ID");
    if (!id) throw Error("Google Sheets disabled");
    return `https://sheets.googleapis.com/v4/spreadsheets/${
      encodeURIComponent(id)
    }/values/`;
  }
  private tab() {
    const tab = Deno.env.get("GOOGLE_SHEETS_TAB_GUESTS");
    if (!tab) throw Error("Configure guest tab");
    return `'${tab.replace(/'/g, "''")}'`;
  }
  async read() {
    return requestJson(`${this.base()}${encodeURIComponent(this.tab())}`, {
      headers: await this.access(),
    });
  }
  async upsert(guest: SheetGuest) {
    const data = await this.read();
    const rows: string[][] = data.values || [];
    const header = rows[0] || [];
    const custom = Deno.env.get("GOOGLE_SHEETS_COLUMN_MAP");
    const mapping: Record<string, string> = custom
      ? JSON.parse(custom)
      : Object.fromEntries(columns.map((c) => [c, c]));
    const indices = columns.map((c) => header.indexOf(mapping[c] || c));
    if (indices.some((i) => i < 0)) {
      throw Error("Mapping mismatch: create/review required headers manually");
    }
    const matches = rows.map((r, index) =>
      r[indices[0]!] === guest.id ? index : -1
    ).filter((i) => i >= 1);
    if (matches.length > 1) {
      throw Error("Duplicate guest ID in sheet; manual review required");
    }
    const values = [
      guest.id,
      guest.name,
      guest.family,
      guest.group,
      guest.rsvp,
      guest.checkin,
      guest.entered,
      guest.dietary,
      guest.contact,
      guest.note,
    ];
    const index = matches[0];
    if (index === undefined) {
      const row = Array(header.length).fill("");
      indices.forEach((column, i) => {
        row[column] = values[i];
      });
      await requestJson(
        `${this.base()}${
          encodeURIComponent(`${this.tab()}!A:A`)
        }:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          headers: await this.access(),
          body: JSON.stringify({ values: [row] }),
        },
      );
    } else {
      const columnName = (index: number) => {
        let name = "", n = index + 1;
        while (n > 0) {
          n--;
          name = String.fromCharCode(65 + n % 26) + name;
          n = Math.floor(n / 26);
        }
        return name;
      };
      // Write mapped cells only: untouched columns may contain formulas, not just values.
      const data = indices.map((column, i) => ({
        range: `${this.tab()}!${columnName(column)}${index + 1}`,
        values: [[values[i]]],
      }));
      await requestJson(
        this.base().replace(/values\/$/, "values:batchUpdate"),
        {
          method: "POST",
          headers: await this.access(),
          body: JSON.stringify({ valueInputOption: "RAW", data }),
        },
      );
    }
  }
}
