"use client";

import { useTransition } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Megaphone,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  cancelCampaign,
  launchCampaign,
  markCampaignMessageSent,
} from "@/lib/admin/campaigns-actions";
import type { CustomerListItem } from "@/lib/admin/customers-query";
import { buildWaMeLink } from "@/lib/campaigns/template";
import { formatCurrency } from "@/lib/currency";
import type { Campaign, CampaignMessage } from "@/lib/campaigns/types";
import {
  SEGMENT_LABEL,
  SEGMENT_TONE,
  type CustomerSegment,
} from "@/lib/customers/segments";
import { formatPromoDiscount } from "@/lib/promos/types";
import { cn } from "@/lib/utils";

export function CampaignDetailView({
  slug,
  businessName,
  campaign,
  messages,
  audiencePreview,
  redemptionAmountCents = 0,
}: {
  slug: string;
  businessName: string;
  campaign: Campaign;
  messages: CampaignMessage[];
  audiencePreview: CustomerListItem[];
  redemptionAmountCents?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const isDraft = campaign.status === "draft";
  const isSent = campaign.status === "sent";
  const isCancelled = campaign.status === "cancelled";

  const handleLaunch = () => {
    if (
      !window.confirm(
        `¿Lanzar "${campaign.name}"? Se van a generar ${audiencePreview.length} códigos personales y mensajes listos para enviar por WhatsApp.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await launchCampaign({
        business_slug: slug,
        campaign_id: campaign.id,
      });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(
          `Campaña lanzada — ${result.data.messages_created} mensajes listos para enviar.`,
        );
        // refresh by navigating in place
        window.location.reload();
      }
    });
  };

  const handleCancel = () => {
    if (!window.confirm(`¿Cancelar la campaña "${campaign.name}"?`)) return;
    startTransition(async () => {
      const result = await cancelCampaign({
        business_slug: slug,
        campaign_id: campaign.id,
      });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Campaña cancelada.");
        window.location.reload();
      }
    });
  };

  const onMarkSent = (messageId: string, sent: boolean) => {
    startTransition(async () => {
      const result = await markCampaignMessageSent({
        business_slug: slug,
        message_id: messageId,
        sent,
      });
      if (!result.ok) toast.error(result.error);
    });
  };

  const audienceCount = isDraft ? audiencePreview.length : campaign.audience_count;
  const sentPct =
    audienceCount > 0
      ? Math.round((campaign.sent_count / audienceCount) * 100)
      : 0;
  const redeemedPct =
    audienceCount > 0
      ? Math.round((campaign.redeemed_count / audienceCount) * 100)
      : 0;

  const promoLabel = formatPromoDiscount(campaign.promo_template);
  const audienceLabel =
    campaign.audience_type === "all"
      ? "Todos los clientes"
      : campaign.audience_type === "manual"
        ? "Selección manual"
        : `Segmento: ${SEGMENT_LABEL[campaign.audience_segment as CustomerSegment] ?? "—"}`;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: "var(--brand, #2563eb)",
              color: "var(--brand-foreground, white)",
            }}
          >
            <Megaphone className="size-6" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-zinc-900">
              {campaign.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              {audienceLabel} · {audienceCount} clientes
            </p>
            {campaign.description && (
              <p className="mt-1 text-sm text-zinc-500">{campaign.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusChip status={campaign.status} />
              <span
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[0.65rem] font-semibold text-zinc-700"
                title={`Tipo de descuento`}
              >
                {promoLabel}
              </span>
              {isDraft &&
                campaign.audience_type === "segment" &&
                campaign.audience_segment && (
                  <SegmentChip segment={campaign.audience_segment} />
                )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-2">
          {isDraft && (
            <>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50"
              >
                <X className="size-3.5" />
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleLaunch}
                disabled={isPending || audienceCount === 0}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition hover:brightness-95 active:translate-y-px disabled:opacity-50"
                style={{
                  background: "var(--brand, #18181B)",
                  color: "var(--brand-foreground, white)",
                }}
              >
                <Send className="size-4" strokeWidth={2.5} />
                {isPending ? "Lanzando…" : "Lanzar campaña"}
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Stats (when launched) ──────────────────────────────────────── */}
      {(isSent || isCancelled) && (
        <section className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Audiencia"
            value={String(campaign.audience_count)}
            sub="clientes con código generado"
            icon={<Users className="size-4" strokeWidth={1.75} />}
          />
          <StatTile
            label="Enviados"
            value={`${campaign.sent_count} / ${campaign.audience_count}`}
            sub={`${sentPct}% del total`}
            icon={<Send className="size-4" strokeWidth={1.75} />}
          />
          <StatTile
            label="Canjeados"
            value={String(campaign.redeemed_count)}
            sub={
              redemptionAmountCents > 0
                ? `${redeemedPct}% · ${formatCurrency(redemptionAmountCents)} en ventas`
                : `${redeemedPct}% de conversión`
            }
            icon={<TrendingUp className="size-4" strokeWidth={1.75} />}
            accent
          />
        </section>
      )}

      {/* ── Body ───────────────────────────────────────────────────────── */}
      {isDraft ? (
        <DraftBody
          audiencePreview={audiencePreview}
          messageTemplate={campaign.message_template}
          businessName={businessName}
          promoLabel={promoLabel}
        />
      ) : (
        <SentBody
          messages={messages}
          isPending={isPending}
          onMarkSent={onMarkSent}
        />
      )}
    </div>
  );
}

// ─── Draft view: shows audience + message preview ─────────────────────────────

function DraftBody({
  audiencePreview,
  messageTemplate,
  businessName,
  promoLabel,
}: {
  audiencePreview: CustomerListItem[];
  messageTemplate: string;
  businessName: string;
  promoLabel: string;
}) {
  const sample = audiencePreview[0];
  const sampleRendered = sample
    ? messageTemplate
        .replaceAll("{name}", sample.name?.split(" ")[0] ?? "")
        .replaceAll("{code}", "VUELVE-A1B2C3")
        .replaceAll("{discount}", promoLabel)
        .replaceAll("{business}", businessName)
    : null;

  return (
    <>
      {/* Audience preview */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70">
        <h2 className="mb-3 inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <Users className="size-3.5" />
          Audiencia ({audiencePreview.length} clientes)
        </h2>
        {audiencePreview.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No hay clientes en este segmento todavía. La campaña no se puede lanzar.
          </p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {audiencePreview.slice(0, 12).map((c) => (
              <li
                key={c.id}
                className="truncate rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
              >
                <span className="font-medium">{c.name || "Sin nombre"}</span>
                <span className="text-zinc-400"> · {c.phone}</span>
              </li>
            ))}
            {audiencePreview.length > 12 && (
              <li className="rounded-lg bg-zinc-50 px-3 py-2 text-sm italic text-zinc-500">
                y {audiencePreview.length - 12} más…
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Message preview */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70">
        <h2 className="mb-3 inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <Sparkles className="size-3.5" />
          Vista previa del mensaje
        </h2>
        <div className="rounded-xl bg-emerald-50/50 p-4 ring-1 ring-emerald-200/40">
          <p className="whitespace-pre-wrap text-sm text-zinc-800">
            {sampleRendered ?? "(no hay clientes para previsualizar)"}
          </p>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Cada cliente recibe el mensaje con su nombre y un código personal único, de un solo uso.
        </p>
      </section>
    </>
  );
}

// ─── Sent view: list of messages with wa.me deep-links ────────────────────────

function SentBody({
  messages,
  isPending,
  onMarkSent,
}: {
  messages: CampaignMessage[];
  isPending: boolean;
  onMarkSent: (id: string, sent: boolean) => void;
}) {
  if (messages.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-zinc-200/70">
        <p className="text-sm text-zinc-500">
          No hay mensajes en esta campaña.
        </p>
      </div>
    );
  }

  const onCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Mensaje copiado.");
    } catch {
      toast.error("No pudimos copiar.");
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200/70">
      <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
        <h2 className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <Send className="size-3.5" />
          Recipientes ({messages.length})
        </h2>
        <p className="text-xs text-zinc-500">
          Tocá <span className="font-semibold text-emerald-600">&ldquo;Abrir WhatsApp&rdquo;</span> para enviar el mensaje pre-cargado a cada cliente.
        </p>
      </header>
      <ul>
        {messages.map((m, idx) => (
          <MessageRow
            key={m.id}
            message={m}
            striped={idx % 2 === 1}
            isPending={isPending}
            onMarkSent={onMarkSent}
            onCopy={onCopy}
          />
        ))}
      </ul>
    </section>
  );
}

function MessageRow({
  message,
  striped,
  isPending,
  onMarkSent,
  onCopy,
}: {
  message: CampaignMessage;
  striped: boolean;
  isPending: boolean;
  onMarkSent: (id: string, sent: boolean) => void;
  onCopy: (text: string) => void;
}) {
  const waLink = buildWaMeLink(message.customer_phone, message.rendered_message);
  const sent = message.status === "sent";
  const redeemed = message.redeemed_at !== null;

  return (
    <li
      style={
        striped
          ? { background: "color-mix(in oklch, var(--brand, #2563eb) 14%, white)" }
          : undefined
      }
      className="border-b border-zinc-100 last:border-b-0"
    >
      <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:gap-4">
        {/* Left: customer info + message preview */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-zinc-900">
              {message.customer_name || "Sin nombre"}
            </p>
            <span className="text-xs text-zinc-500 tabular-nums">
              {message.customer_phone}
            </span>
            {message.promo_code_text && (
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[0.6rem] font-bold uppercase text-white">
                {message.promo_code_text}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-zinc-600">
            {message.rendered_message}
          </p>
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          {redeemed && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-emerald-700"
              title="El cliente usó su código"
            >
              <CheckCircle2 className="size-3" />
              Canjeado
            </span>
          )}

          <button
            type="button"
            onClick={() => onCopy(message.rendered_message)}
            title="Copiar mensaje"
            className="inline-flex size-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Copy className="size-3.5" />
          </button>

          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                // Auto-mark as sent when the owner opens WhatsApp (best-effort UX)
                if (!sent) onMarkSent(message.id, true);
              }}
              title="Abrir WhatsApp con el mensaje pre-cargado"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95"
            >
              <ExternalLink className="size-3" strokeWidth={2.5} />
              Abrir WhatsApp
            </a>
          )}

          <button
            type="button"
            onClick={() => onMarkSent(message.id, !sent)}
            disabled={isPending}
            title={sent ? "Marcar como no enviado" : "Marcar como enviado"}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-full transition",
              sent
                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700",
              isPending && "opacity-50",
            )}
          >
            <Check className="size-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </li>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: Campaign["status"] }) {
  const meta: Record<Campaign["status"], { label: string; tone: string; dot: string }> = {
    draft: {
      label: "Borrador",
      tone: "text-amber-800 bg-amber-50",
      dot: "bg-amber-500",
    },
    sending: {
      label: "Enviando",
      tone: "text-sky-800 bg-sky-50",
      dot: "bg-sky-500",
    },
    sent: {
      label: "Lanzada",
      tone: "text-emerald-800 bg-emerald-50",
      dot: "bg-emerald-500",
    },
    cancelled: {
      label: "Cancelada",
      tone: "text-zinc-700 bg-zinc-100",
      dot: "bg-zinc-400",
    },
  };
  const m = meta[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
        m.tone,
      )}
    >
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

function SegmentChip({ segment }: { segment: CustomerSegment }) {
  const t = SEGMENT_TONE[segment];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
        t.tone,
      )}
    >
      <span className={cn("size-1.5 rounded-full", t.dot)} />
      {SEGMENT_LABEL[segment]}
    </span>
  );
}

function StatTile({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white p-4 ring-1 ring-zinc-200/70",
        accent && "ring-2",
      )}
      style={
        accent
          ? { background: "color-mix(in oklch, var(--brand, #2563eb) 8%, white)" }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {label}
        </p>
        <span className="text-zinc-400">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}
