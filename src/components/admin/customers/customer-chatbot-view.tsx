"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  MoreVertical,
  Phone,
  Send,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import {
  BusinessAvatar,
  DayDivider,
  WaFormatted,
  groupMessagesByDay,
} from "@/components/admin/conversations/wa-thread";
import type {
  CustomerChatbotConversation,
  CustomerChatbotMessage,
} from "@/lib/admin/customers-query";
import { useEscapeToClose } from "@/lib/ui/use-escape-to-close";
import { cn } from "@/lib/utils";

// Vista dedicada del chat con el bot, presentada como si abrieras el chat
// con el negocio en la app de WhatsApp del cliente. Es un client component
// porque permite escribir mensajes y probar el bot en vivo: usa el endpoint
// `/api/chatbot/test` con el teléfono del cliente como contactIdentifier
// (mismo identifier que la conversación real, así los turnos se acumulan
// sobre el mismo hilo).
export function CustomerChatbotView({
  slug,
  timezone,
  businessName,
  businessLogoUrl,
  customerId,
  customerName,
  customerPhone,
  conversation,
}: {
  slug: string;
  timezone: string;
  businessName: string;
  businessLogoUrl: string | null;
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  conversation: CustomerChatbotConversation | null;
}) {
  const [messages, setMessages] = useState<CustomerChatbotMessage[]>(
    () => conversation?.messages ?? [],
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Esc cierra la vista full-screen → mismo destino que el link "Volver a la
  // demo" (no es un Dialog, por eso usa el hook en vez de migrar). Spec 043.
  const router = useRouter();
  useEscapeToClose(() => router.push(`/${slug}/demo`));

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Si el contact_identifier viene de la conversación lo usamos (formato
  // exacto con el que estaba registrado el contacto). Si no hay conversación
  // todavía, usamos los dígitos del teléfono del cliente.
  const contactIdentifier = useMemo(() => {
    if (conversation?.contact_identifier) return conversation.contact_identifier;
    const digits = customerPhone.replace(/\D/g, "");
    return digits || customerPhone;
  }, [conversation, customerPhone]);

  // Auto-scroll al final cuando llegan mensajes nuevos.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  // Auto-grow del textarea.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  const groups = groupMessagesByDay(messages, timezone);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const now = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed, created_at: now },
    ]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chatbot/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessSlug: slug,
          contactIdentifier,
          message: trimmed,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: { assistantMessage: string } = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.assistantMessage,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`No pude obtener respuesta: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0b141a]">
      {/* Tira superior con back link al cliente */}
      <div className="flex shrink-0 items-center justify-between bg-zinc-900 px-4 py-2 text-xs text-zinc-300">
        <Link
          href={`/${slug}/demo`}
          className="inline-flex items-center gap-1 transition hover:text-white"
        >
          <ArrowLeft className="size-3.5" />
          Volver a la demo
        </Link>
        <span className="opacity-70">
          Probá el chat — los mensajes se guardan como si los mandara el cliente
        </span>
      </div>

      {/* Marco "celular" centrado */}
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-4">
        <div className="relative w-[min(440px,96vw)] rounded-[2.75rem] bg-zinc-900 p-2.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] ring-1 ring-zinc-800">
          {/* Notch */}
          <div className="absolute left-1/2 top-2.5 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-zinc-900" />

          <div className="flex h-[min(86vh,820px)] flex-col overflow-hidden rounded-[2.25rem] bg-[#EFE9E1]">
            {/* WA header */}
            <div className="flex shrink-0 items-center gap-3 bg-[#008069] px-3 py-3 pt-8 text-white">
              <ArrowLeft className="size-5 shrink-0 opacity-80" />
              <BusinessAvatar
                logoUrl={businessLogoUrl}
                name={businessName}
                size={40}
                ringColor="rgba(255,255,255,0.25)"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">
                  {businessName}
                </p>
                <p className="truncate text-[0.7rem] leading-tight opacity-80">
                  {loading ? "escribiendo..." : "en línea"}
                </p>
              </div>
              <Video className="size-5 shrink-0 opacity-80" />
              <Phone className="size-5 shrink-0 opacity-80" />
              <MoreVertical className="size-5 shrink-0 opacity-80" />
            </div>

            {/* Chat background */}
            <div ref={scrollRef} className="wa-bg flex-1 overflow-y-auto px-3 py-3">
              <div className="mx-auto mb-3 max-w-[85%] rounded-lg bg-[#FFF3C4] px-3 py-2 text-center text-[0.7rem] text-zinc-700 shadow-sm">
                🔒 Los mensajes están cifrados de extremo a extremo.
              </div>

              {messages.length === 0 && !loading ? (
                <p className="mt-12 text-center text-xs text-zinc-500">
                  Escribí algo para empezar a chatear con el bot.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {groups.map((group) => (
                    <div key={group.dayKey} className="flex flex-col gap-1.5">
                      <DayDivider label={group.dayLabel} />
                      {group.messages.map((m, i) => {
                        const prev = group.messages[i - 1];
                        const isFirstOfRun = !prev || prev.role !== m.role;
                        return (
                          <Bubble
                            key={`${group.dayKey}-${i}`}
                            role={m.role}
                            content={m.content}
                            time={formatInTimeZone(
                              m.created_at,
                              timezone,
                              "HH:mm",
                              { locale: es },
                            )}
                            firstOfRun={isFirstOfRun}
                          />
                        );
                      })}
                    </div>
                  ))}
                  {loading && <TypingBubble />}
                </div>
              )}
            </div>

            {/* Input bar real */}
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

// ─── Internals ─────────────────────────────────────────────────────────────

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
  // Punto de vista del cliente: lo que mandó él (user) va a la derecha
  // (verde); lo que respondió el bot (assistant) va a la izquierda (blanco).
  const isFromCustomer = role === "user";
  return (
    <div
      className={cn(
        "flex w-full",
        isFromCustomer ? "justify-end" : "justify-start",
        !firstOfRun && "mt-0.5",
      )}
    >
      <div
        className={cn(
          "relative max-w-[80%] px-2.5 pb-1 pt-1.5 text-sm shadow-sm",
          isFromCustomer ? "bg-[#D9FDD3]" : "bg-white",
          "rounded-lg",
          firstOfRun && (isFromCustomer ? "rounded-tr-[3px]" : "rounded-tl-[3px]"),
        )}
      >
        <div className="whitespace-pre-wrap break-words pr-10 text-zinc-900">
          <WaFormatted text={content} />
        </div>
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
