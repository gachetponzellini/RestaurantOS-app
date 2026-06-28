"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import { ArrowLeft, Bot, Clock, Hand, Send } from "lucide-react";
import { toast } from "sonner";

import type { InboxConversationDetail, InboxMessage } from "@/lib/chatbot/inbox-query";
import { sendStaffMessage, toggleConversationAgent } from "@/lib/chatbot/staff-actions";
import { isWindowOpen, WHATSAPP_WINDOW_HOURS } from "@/lib/chatbot/staff-window";
import { cn } from "@/lib/utils";

import {
  DayDivider,
  WaFormatted,
  getInitials,
  groupMessagesByDay,
} from "./wa-thread";

// Vista de una conversación en la bandeja (spec 32), perspectiva del staff: los
// mensajes del cliente van a la izquierda, los salientes (bot o humano) a la
// derecha. Toggle de agente (handoff) + caja condicionada por la regla "no se
// pisan" y la ventana de 24 h. Optimista; el polling del shell reconcilia con
// el server.
export function ConversationDetailView({
  slug,
  timezone,
  detail,
  currentUserName,
}: {
  slug: string;
  timezone: string;
  detail: InboxConversationDetail;
  currentUserName?: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<InboxMessage[]>(detail.messages);
  const [agentEnabled, setAgentEnabled] = useState(detail.agent_enabled);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [togglePending, setTogglePending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reconciliación con el server cuando el polling trae datos frescos. La firma
  // primitiva evita re-sincronizar en cada render (detail es un objeto nuevo).
  const serverSig = `${detail.updated_at}|${detail.messages.length}|${detail.agent_enabled}`;
  useEffect(() => {
    setMessages(detail.messages);
    setAgentEnabled(detail.agent_enabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSig]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  const title = detail.contact_display_name?.trim() || detail.contact_identifier;
  // Ventana de 24 h: la reabre sólo el cliente; los mensajes del staff/bot no.
  const windowOpen = isWindowOpen(detail.last_inbound_at, Date.now());
  const canWrite = !agentEnabled && windowOpen;
  const groups = groupMessagesByDay(messages, timezone);

  const toggleAgent = async () => {
    if (togglePending) return;
    const next = !agentEnabled;
    setTogglePending(true);
    setAgentEnabled(next);
    const res = await toggleConversationAgent(slug, detail.conversation_id, next);
    if (!res.ok) {
      setAgentEnabled(!next);
      toast.error(res.error);
    } else {
      router.refresh();
    }
    setTogglePending(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !canWrite) return;
    setSending(true);
    const optimistic: InboxMessage = {
      role: "assistant",
      content: text,
      created_at: new Date().toISOString(),
      sent_by: "staff",
      author_name: currentUserName ?? null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    const res = await sendStaffMessage(slug, detail.conversation_id, text);
    if (!res.ok) {
      setMessages((prev) => prev.filter((m) => m !== optimistic));
      setInput(text);
      toast.error(res.error);
    } else {
      router.refresh();
    }
    setSending(false);
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[#EFE9E1]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-emerald-900/10 bg-[#008069] px-3 py-2.5 text-white">
        <Link
          href={`/${slug}/admin/conversaciones`}
          className="md:hidden"
          aria-label="Volver a la lista"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
          {getInitials(title)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{title}</p>
          <p className="truncate text-[0.7rem] leading-tight opacity-80">
            {detail.contact_identifier}
            {detail.channel === "web-test" ? " · prueba" : ""}
          </p>
        </div>
        <AgentToggle
          enabled={agentEnabled}
          pending={togglePending}
          onToggle={toggleAgent}
        />
      </div>

      {/* Hilo */}
      <div ref={scrollRef} className="wa-bg min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="mt-12 text-center text-xs text-zinc-500">
            Todavía no hay mensajes en esta conversación.
          </p>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
            {groups.map((group) => (
              <div key={group.dayKey} className="flex flex-col gap-1.5">
                <DayDivider label={group.dayLabel} />
                {group.messages.map((m, i) => {
                  const prev = group.messages[i - 1];
                  const isFirstOfRun =
                    !prev || prev.role !== m.role || prev.sent_by !== m.sent_by;
                  return (
                    <InboxBubble
                      key={`${group.dayKey}-${i}`}
                      message={m}
                      time={formatInTimeZone(m.created_at, timezone, "HH:mm", {
                        locale: es,
                      })}
                      firstOfRun={isFirstOfRun}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Caja condicionada */}
      <Composer
        agentEnabled={agentEnabled}
        windowOpen={windowOpen}
        canWrite={canWrite}
        input={input}
        sending={sending}
        inputRef={inputRef}
        onChange={setInput}
        onSend={send}
      />

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

// ─── Toggle de agente (handoff) ──────────────────────────────────────────────

function AgentToggle({
  enabled,
  pending,
  onToggle,
}: {
  enabled: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Agente activado — tocar para tomar la conversación" : "Agente desactivado — tocar para devolvérsela al bot"}
      disabled={pending}
      onClick={onToggle}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-60",
        enabled ? "bg-white/90 text-emerald-800" : "bg-amber-400 text-amber-950",
      )}
      title={
        enabled
          ? "El bot atiende. Apagalo para escribirle vos al cliente."
          : "Lo estás atendiendo vos. Prendé el agente para devolvérselo al bot."
      }
    >
      {enabled ? <Bot className="size-3.5" /> : <Hand className="size-3.5" />}
      {enabled ? "Agente activo" : "Atendés vos"}
    </button>
  );
}

// ─── Caja de escritura ───────────────────────────────────────────────────────

function Composer({
  agentEnabled,
  windowOpen,
  canWrite,
  input,
  sending,
  inputRef,
  onChange,
  onSend,
}: {
  agentEnabled: boolean;
  windowOpen: boolean;
  canWrite: boolean;
  input: string;
  sending: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  if (agentEnabled) {
    return (
      <Banner>
        <Bot className="size-4 shrink-0" />
        El agente está atendiendo esta conversación. Apagá el agente (arriba a la
        derecha) para escribirle vos al cliente.
      </Banner>
    );
  }
  if (!windowOpen) {
    return (
      <Banner>
        <Clock className="size-4 shrink-0" />
        Se cerró la ventana de {WHATSAPP_WINDOW_HOURS} h de WhatsApp. No se puede
        enviar texto libre hasta que el cliente vuelva a escribir.
      </Banner>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="flex shrink-0 items-end gap-2 bg-[#F0F2F5] px-3 py-2.5"
    >
      <div className="flex flex-1 items-center rounded-3xl bg-white px-4 py-1 shadow-sm">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Escribí un mensaje al cliente"
          rows={1}
          disabled={sending || !canWrite}
          className="min-h-[20px] w-full resize-none bg-transparent py-1.5 text-sm leading-5 placeholder:text-zinc-400 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={sending || !input.trim()}
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full text-white transition",
          "bg-[#008069] hover:bg-[#006E5C] disabled:bg-zinc-300",
        )}
        aria-label="Enviar"
      >
        <Send className="size-[18px] translate-x-[-1px]" />
      </button>
    </form>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 border-t border-zinc-200 bg-[#F0F2F5] px-4 py-3 text-center text-xs text-zinc-600">
      {children}
    </div>
  );
}

// ─── Burbuja (perspectiva del staff) ─────────────────────────────────────────

function InboxBubble({
  message,
  time,
  firstOfRun,
}: {
  message: InboxMessage;
  time: string;
  firstOfRun: boolean;
}) {
  // Perspectiva del negocio: el cliente (user) a la izquierda; lo saliente
  // (assistant, sea bot o staff) a la derecha.
  const isOutgoing = message.role === "assistant";
  const isStaff = isOutgoing && message.sent_by === "staff";
  const authorLabel = isStaff
    ? message.author_name?.trim() || "Vos"
    : isOutgoing
      ? "Bot"
      : null;

  return (
    <div
      className={cn(
        "flex w-full",
        isOutgoing ? "justify-end" : "justify-start",
        !firstOfRun && "mt-0.5",
      )}
    >
      <div
        className={cn(
          "relative max-w-[80%] px-2.5 pb-1 pt-1.5 text-sm shadow-sm rounded-lg",
          isOutgoing ? (isStaff ? "bg-[#D1F4CC]" : "bg-[#D9FDD3]") : "bg-white",
          firstOfRun && (isOutgoing ? "rounded-tr-[3px]" : "rounded-tl-[3px]"),
        )}
      >
        {firstOfRun && authorLabel && (
          <p
            className={cn(
              "mb-0.5 flex items-center gap-1 text-[0.65rem] font-semibold",
              isStaff ? "text-amber-700" : "text-emerald-700",
            )}
          >
            {isStaff ? <Hand className="size-2.5" /> : <Bot className="size-2.5" />}
            {authorLabel}
          </p>
        )}
        <div className="whitespace-pre-wrap break-words pr-10 text-zinc-900">
          <WaFormatted text={message.content} />
        </div>
        <span className="absolute bottom-0.5 right-2 text-[0.6rem] text-zinc-500">
          {time}
        </span>
      </div>
    </div>
  );
}
