import { useCallback, useEffect, useRef, useState } from "react";
import { theme } from "../../theme/tokens";
export function ScheduleDateFields({
  date,
  time,
  setDate,
  setTime,
}: {
  date: string;
  time: string;
  setDate: (v: string) => void;
  setTime: (v: string) => void;
}) {
  const [open, setOpen] = useState(false),
    opener = useRef<HTMLButtonElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const escapeRelease = useRef<((event: KeyboardEvent) => void) | null>(null);
  useEffect(
    () => () => {
      if (escapeRelease.current)
        window.removeEventListener("keyup", escapeRelease.current, true);
    },
    [],
  );
  const [month, setMonth] = useState(() => {
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Intl.DateTimeFormat("sv-SE", {
          timeZone: "America/Sao_Paulo",
        }).format(new Date());
    return new Date(`${iso.slice(0, 7)}-15T12:00:00Z`);
  });
  const year = month.getUTCFullYear(),
    index = month.getUTCMonth(),
    count = new Date(Date.UTC(year, index + 1, 0)).getUTCDate(),
    start = new Date(Date.UTC(year, index, 1)).getUTCDay();
  const style = {
    minHeight: 48,
    width: "100%",
    boxSizing: "border-box" as const,
    border: `1px solid ${theme.colors.inputBorder}`,
    background: theme.colors.card,
    color: theme.colors.ink,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    fontFamily: "Arial, sans-serif",
  };
  const button = {
    border: `1px solid ${theme.colors.line}`,
    borderRadius: 10,
    background: theme.colors.wash,
    color: theme.colors.ink,
    cursor: "pointer",
    minHeight: 44,
    padding: 8,
    fontSize: 14,
  };
  const display = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date.split("-").reverse().join("/")
    : date;
  const close = useCallback(() => {
    setOpen(false);
    opener.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        !calendar.current?.contains(event.target as Node)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      // React Native Web's Modal also closes on keyup; consume this same key's release.
      const release = (up: KeyboardEvent) => {
        if (up.key !== "Escape") return;
        up.preventDefault();
        up.stopImmediatePropagation();
        window.removeEventListener("keyup", release, true);
        escapeRelease.current = null;
      };
      if (!escapeRelease.current) {
        escapeRelease.current = release;
        window.addEventListener("keyup", release, true);
      }
      close();
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [open, close]);
  return (
    <div
      lang="pt-BR"
      className="wedding-date-fields"
      style={{ display: "grid", gap: 12, fontFamily: style.fontFamily }}
    >
      <style>{`.wedding-date-fields button:focus-visible,.wedding-date-fields input:focus-visible{outline:3px solid ${theme.colors.focus};outline-offset:2px}.wedding-date-fields button:hover{background:${theme.colors.line}}`}</style>
      <label style={{ color: theme.colors.muted, fontSize: 13 }}>
        Data
        <input
          aria-label="Data"
          placeholder="DD/MM/AAAA"
          inputMode="numeric"
          value={display}
          onChange={(e) => setDate(e.target.value)}
          style={style}
        />
      </label>
      <button
        type="button"
        ref={opener}
        aria-expanded={open}
        onClick={() => {
          const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(date)
            ? date.split("/").reverse().join("-")
            : date;
          if (!open && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(iso))
            setMonth(new Date(`${iso.slice(0, 7)}-15T12:00:00Z`));
          setOpen((v) => !v);
        }}
        style={button}
      >
        Escolher data
      </button>
      {open ? (
        <div
          ref={calendar}
          role="group"
          aria-label="Calendário em português"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          style={{
            display: "grid",
            gap: 8,
            padding: 10,
            border: `1px solid ${theme.colors.line}`,
            borderRadius: 12,
            background: theme.colors.card,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() =>
                setMonth(new Date(Date.UTC(year, index - 1, 15, 12)))
              }
              style={button}
            >
              ‹
            </button>
            <strong
              style={{
                color: theme.colors.ink,
                fontSize: 14,
                textAlign: "center",
              }}
            >
              {new Intl.DateTimeFormat("pt-BR", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(month)}
            </strong>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() =>
                setMonth(new Date(Date.UTC(year, index + 1, 15, 12)))
              }
              style={button}
            >
              ›
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7,minmax(0,1fr))",
              gap: 2,
              textAlign: "center",
            }}
          >
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
              <span
                key={day}
                style={{ color: theme.colors.muted, fontSize: 11 }}
              >
                {day}
              </span>
            ))}
            {Array.from({ length: start }, (_, i) => (
              <span key={`empty-${i}`} aria-hidden="true" />
            ))}
            {Array.from({ length: count }, (_, i) => i + 1).map((day) => {
              const iso = `${year}-${String(index + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              return (
                <button
                  type="button"
                  key={day}
                  aria-label={new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "long",
                    timeZone: "UTC",
                  }).format(new Date(`${iso}T12:00:00Z`))}
                  onClick={() => {
                    setDate(iso);
                    close();
                  }}
                  style={{ ...button, padding: 0, fontSize: 13 }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <label style={{ color: theme.colors.muted, fontSize: 13 }}>
        Horário
        <input
          aria-label="Horário"
          type="time"
          step="60"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          style={style}
        />
      </label>
      <span style={{ color: theme.colors.muted, fontSize: 13 }}>
        Horário de Brasília · America/Sao_Paulo
      </span>
    </div>
  );
}
