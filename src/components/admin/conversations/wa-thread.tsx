import Image from "next/image";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";

// Primitivas de render estilo WhatsApp compartidas entre la vista del chat por
// cliente (CustomerChatbotView, perspectiva del cliente) y la bandeja de
// conversaciones (spec 32, perspectiva del staff). Acá vive lo que no depende
// de la perspectiva: el formateo de texto WA, el agrupado por día y el avatar.
// Las burbujas (qué lado, qué color) son específicas de cada vista.

// ─── WhatsApp text formatting ──────────────────────────────────────────────
//
// WhatsApp soporta cuatro marcadores inline:
//   *negrita*  _itálica_  ~tachado~  `monoespaciado`
// Reglas: el marcador tiene que tocar el texto (no espacios al borde) y los
// pares se cierran con el mismo char. URLs http(s) se linkean.

type Token =
  | { type: "text"; value: string }
  | { type: "bold" | "italic" | "strike" | "code" | "link"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const markers: Record<string, "bold" | "italic" | "strike" | "code"> = {
    "*": "bold",
    _: "italic",
    "~": "strike",
    "`": "code",
  };

  let i = 0;
  let buffer = "";

  const flush = () => {
    if (buffer) {
      tokens.push({ type: "text", value: buffer });
      buffer = "";
    }
  };

  while (i < input.length) {
    const c = input[i];

    // URL detection (http:// or https://)
    if (c === "h" && (input.startsWith("http://", i) || input.startsWith("https://", i))) {
      const rest = input.slice(i);
      const m = /^https?:\/\/[^\s]+/.exec(rest);
      if (m) {
        flush();
        tokens.push({ type: "link", value: m[0] });
        i += m[0].length;
        continue;
      }
    }

    if (c in markers) {
      const kind = markers[c];
      const prev = i > 0 ? input[i - 1] : "";
      const startsWord = !prev || /\s/.test(prev) || /[\w]/.test(prev) === false;
      // Sólo abre si lo que sigue no es espacio.
      const next = input[i + 1];
      if (startsWord && next && !/\s/.test(next)) {
        // Buscar el cierre.
        const closeIdx = findClose(input, i + 1, c);
        if (closeIdx > 0) {
          flush();
          const inner = input.slice(i + 1, closeIdx);
          tokens.push({ type: kind, value: inner });
          i = closeIdx + 1;
          continue;
        }
      }
    }

    buffer += c;
    i += 1;
  }

  flush();
  return tokens;
}

function findClose(s: string, from: number, marker: string): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] === marker) {
      const before = s[j - 1];
      const after = s[j + 1];
      // No cierra con espacio antes; no cierra si el char siguiente es alfanum
      // (ej: snake_case no debería partir).
      if (before && !/\s/.test(before) && !(after && /\w/.test(after))) {
        return j;
      }
    }
  }
  return -1;
}

export function WaFormatted({ text }: { text: string }) {
  const tokens = tokenize(text);
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.type) {
          case "text":
            return <span key={i}>{t.value}</span>;
          case "bold":
            return (
              <strong key={i} className="font-semibold">
                <WaFormatted text={t.value} />
              </strong>
            );
          case "italic":
            return (
              <em key={i}>
                <WaFormatted text={t.value} />
              </em>
            );
          case "strike":
            return (
              <span key={i} className="line-through">
                <WaFormatted text={t.value} />
              </span>
            );
          case "code":
            return (
              <code
                key={i}
                className="rounded bg-black/5 px-1 py-px font-mono text-[0.85em]"
              >
                {t.value}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={t.value}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-[#027eb5] underline"
              >
                {t.value}
              </a>
            );
        }
      })}
    </>
  );
}

// ─── Day grouping ──────────────────────────────────────────────────────────

export function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-md bg-white/85 px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600 shadow-sm">
        {label}
      </span>
    </div>
  );
}

export type DayGroup<T> = {
  dayKey: string;
  dayLabel: string;
  messages: T[];
};

export function groupMessagesByDay<T extends { created_at: string }>(
  messages: T[],
  timezone: string,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const m of messages) {
    const dayKey = formatInTimeZone(m.created_at, timezone, "yyyy-MM-dd");
    const last = groups.at(-1);
    if (last && last.dayKey === dayKey) {
      last.messages.push(m);
    } else {
      groups.push({
        dayKey,
        dayLabel: formatInTimeZone(m.created_at, timezone, "d 'de' MMMM yyyy", {
          locale: es,
        }),
        messages: [m],
      });
    }
  }
  return groups;
}

// ─── Avatar ────────────────────────────────────────────────────────────────

export function getInitials(s: string): string {
  return (
    s
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function BusinessAvatar({
  logoUrl,
  name,
  size,
  ringColor,
}: {
  logoUrl: string | null;
  name: string;
  size: number;
  ringColor?: string;
}) {
  const initials = getInitials(name);
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-200 text-sm font-bold text-zinc-700"
      style={{
        width: size,
        height: size,
        boxShadow: ringColor ? `0 0 0 1px ${ringColor}` : undefined,
      }}
    >
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={name}
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}
