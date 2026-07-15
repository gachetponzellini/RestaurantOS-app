"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Maximize2,
  Minimize2,
  RotateCcw,
  Send,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ToolTraceEntry = {
  name: string;
  args: Record<string, unknown>;
  result: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  at: Date;
  toolTrace?: ToolTraceEntry[];
};

const STORAGE_KEY = "chatbotTesterContactId";

function randomContactId() {
  return `test-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatbotTester({
  businessSlug,
  businessName,
}: {
  businessSlug: string;
  businessName: string;
}) {
  const [contactIdentifier, setContactIdentifier] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Escape closes the expanded view.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setContactIdentifier(stored);
      else {
        const fresh = randomContactId();
        localStorage.setItem(STORAGE_KEY, fresh);
        setContactIdentifier(fresh);
      }
    } catch {
      setContactIdentifier(randomContactId());
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  // Auto-grow textarea.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  const persistContact = (value: string) => {
    setContactIdentifier(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
    setConversationId(null);
    setMessages([]);
  };

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    if (!contactIdentifier.trim()) {
      toast.error("Ingresá un identificador de contacto");
      return;
    }

    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed, at: new Date() },
    ]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chatbot/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessSlug,
          contactIdentifier: contactIdentifier.trim(),
          message: trimmed,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: {
        conversationId: string;
        assistantMessage: string;
        toolTrace?: ToolTraceEntry[];
      } = await res.json();
      setConversationId(data.conversationId);
      if (!data.assistantMessage?.trim()) {
        // Respuesta vacía: agente en handoff (spec 32) o el bot no devolvió nada.
        // No agregamos una burbuja vacía.
        toast.info("Sin respuesta del bot (puede estar en handoff — lo atiende una persona).");
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.assistantMessage,
          at: new Date(),
          toolTrace: data.toolTrace,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`No pude obtener respuesta: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const resetConversation = async () => {
    if (conversationId) {
      try {
        await fetch(
          `/api/chatbot/test?businessSlug=${encodeURIComponent(businessSlug)}&conversationId=${encodeURIComponent(conversationId)}`,
          { method: "DELETE" },
        );
      } catch {
        // ignore
      }
    }
    setConversationId(null);
    setMessages([]);
    toast.success("Nueva conversación");
  };

  const initials =
    businessName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div
      className={cn(
        expanded
          ? "fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 backdrop-blur-sm"
          : "flex w-full max-w-sm flex-col items-stretch gap-3",
      )}
    >
      {expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Cerrar vista ampliada"
        >
          <X className="size-5" />
        </button>
      )}

      {/* Dev controls — fuera del mockup */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-sm",
          expanded
            ? "w-[min(560px,92vw)] border-white/10 bg-white/10 text-white"
            : "w-full border-zinc-200 bg-white",
        )}
      >
        <span
          className={cn(
            "text-[0.65rem] font-semibold uppercase tracking-wide",
            expanded ? "text-white/60" : "text-zinc-400",
          )}
        >
          Test
        </span>
        <Input
          id="contact-id"
          value={contactIdentifier}
          onChange={(e) => persistContact(e.target.value)}
          placeholder="+5491122334455"
          className={cn(
            "h-7 flex-1 text-xs",
            expanded
              ? "border-white/20 bg-white/5 text-white placeholder:text-white/40"
              : "border-zinc-200",
          )}
          aria-label="Teléfono simulado"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2.5"
          onClick={resetConversation}
          disabled={loading}
        >
          <RotateCcw className="size-3.5" />
          Reiniciar
        </Button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex size-7 items-center justify-center rounded-md border transition",
            expanded
              ? "border-white/20 text-white hover:bg-white/10"
              : "border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
          )}
          aria-label={expanded ? "Contraer" : "Ampliar"}
          title={expanded ? "Contraer" : "Ampliar (Esc)"}
        >
          {expanded ? (
            <Minimize2 className="size-3.5" />
          ) : (
            <Maximize2 className="size-3.5" />
          )}
        </button>
      </div>

      {/* Phone frame */}
      <div
        className={cn(
          "relative rounded-[2.75rem] bg-zinc-900 p-2.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] ring-1 ring-zinc-800",
          expanded ? "w-[min(560px,92vw)]" : "w-full",
        )}
      >
        {/* Notch */}
        <div className="absolute left-1/2 top-2.5 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-zinc-900" />

        <div
          className={cn(
            "flex flex-col overflow-hidden rounded-[2.25rem] bg-[#EFE9E1]",
            expanded ? "h-[min(85vh,900px)]" : "h-[640px]",
          )}
        >
          {/* WA header */}
          <div className="flex shrink-0 items-center gap-3 bg-[#008069] px-3 py-3 pt-8 text-white">
            <ArrowLeft className="size-5 shrink-0 opacity-80" />
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold tracking-tight">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">
                {businessName}
              </p>
              <p className="truncate text-[0.7rem] leading-tight opacity-80">
                {loading ? "escribiendo..." : "en línea"}
              </p>
            </div>
          </div>

          {/* Chat background */}
          <div
            ref={scrollRef}
            className="wa-bg flex-1 overflow-y-auto px-3 py-3"
          >
            {messages.length === 0 && !loading ? (
              <div className="mx-auto mt-8 max-w-[85%] rounded-lg bg-[#FFF3C4] px-3 py-2 text-center text-[0.7rem] text-zinc-700 shadow-sm">
                🔒 Los mensajes están cifrados de extremo a extremo. Escribí
                para empezar a probar el bot.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const isFirstOfRun = !prev || prev.role !== m.role;
                  return (
                    <div key={i}>
                      <Bubble
                        role={m.role}
                        content={m.content}
                        time={formatTime(m.at)}
                        firstOfRun={isFirstOfRun}
                      />
                      {m.role === "assistant" &&
                        m.toolTrace &&
                        m.toolTrace.length > 0 && (
                          <ToolTrace trace={m.toolTrace} />
                        )}
                    </div>
                  );
                })}
                {loading && <TypingBubble />}
              </div>
            )}
          </div>

          {/* Input bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex shrink-0 items-end gap-2 bg-[#F0F2F5] px-3 py-2.5"
          >
            <div className="flex flex-1 items-center rounded-3xl bg-white px-4 py-1 shadow-sm">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Mensaje"
                rows={1}
                className="min-h-[20px] w-full resize-none bg-transparent py-1.5 text-sm leading-5 placeholder:text-zinc-400 focus:outline-none"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full text-white transition",
                "bg-[#008069] hover:bg-[#006E5C] disabled:bg-zinc-300",
              )}
              aria-label="Enviar"
            >
              <Send className="size-[18px] translate-x-[-1px]" />
            </button>
          </form>
        </div>
      </div>

      <style>{`
        .wa-bg {
          background-color: #EFE9E1;
          background-image:
            radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px),
            radial-gradient(rgba(0,0,0,0.025) 1px, transparent 1px);
          background-size: 24px 24px, 48px 48px;
          background-position: 0 0, 12px 12px;
        }
      `}</style>
    </div>
  );
}

function Bubble({
  role,
  content,
  time,
  firstOfRun,
}: {
  role: "user" | "assistant";
  content: string;
  time: string;
  firstOfRun: boolean;
}) {
  const isUser = role === "user";
  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
        !firstOfRun && "mt-0.5",
      )}
    >
      <div
        className={cn(
          "relative max-w-[80%] px-2.5 pb-1 pt-1.5 text-sm shadow-sm",
          isUser ? "bg-[#D9FDD3]" : "bg-white",
          "rounded-lg",
          firstOfRun && (isUser ? "rounded-tr-[3px]" : "rounded-tl-[3px]"),
        )}
      >
        <p className="whitespace-pre-wrap break-words pr-10 text-zinc-900">
          {content}
        </p>
        <span className="absolute bottom-0.5 right-2 text-[0.6rem] text-zinc-500">
          {time}
        </span>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="rounded-lg rounded-tl-[3px] bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1">
          <Dot delay="0ms" />
          <Dot delay="150ms" />
          <Dot delay="300ms" />
        </div>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-zinc-400"
      style={{ animationDelay: delay }}
    />
  );
}

function ToolTrace({ trace }: { trace: ToolTraceEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 flex justify-start">
      <div className="max-w-[80%]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.65rem] font-medium text-zinc-500 transition hover:bg-black/5 hover:text-zinc-700"
        >
          <Wrench className="size-3" />
          {trace.length} herramienta{trace.length === 1 ? "" : "s"}
          <ChevronDown
            className={cn("size-3 transition", open && "rotate-180")}
          />
        </button>
        {open && (
          <div className="mt-1 space-y-1 rounded-md bg-zinc-900/5 p-2">
            {trace.map((t, i) => (
              <TraceEntry key={i} entry={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TraceEntry({ entry }: { entry: ToolTraceEntry }) {
  const [resultOpen, setResultOpen] = useState(false);
  let prettyResult = entry.result;
  try {
    prettyResult = JSON.stringify(JSON.parse(entry.result), null, 2);
  } catch {
    // leave as-is
  }
  const hasArgs = Object.keys(entry.args).length > 0;
  return (
    <div className="rounded bg-white/70 p-1.5 text-[0.65rem] font-mono text-zinc-700">
      <div className="flex items-center gap-1.5">
        <code className="font-semibold text-zinc-900">{entry.name}</code>
        {hasArgs && (
          <code className="truncate text-zinc-500">
            ({JSON.stringify(entry.args)})
          </code>
        )}
      </div>
      <button
        type="button"
        onClick={() => setResultOpen((v) => !v)}
        className="mt-0.5 text-[0.6rem] text-zinc-500 hover:text-zinc-700"
      >
        {resultOpen ? "ocultar resultado" : "ver resultado"}
      </button>
      {resultOpen && (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-900 p-2 text-[0.6rem] leading-tight text-emerald-200">
          {prettyResult}
        </pre>
      )}
    </div>
  );
}
