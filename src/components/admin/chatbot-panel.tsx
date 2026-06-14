"use client";

import { ChatbotPromptEditor } from "@/components/admin/chatbot-prompt-editor";
import { ChatbotStatusBadge } from "@/components/admin/chatbot-status";
import { ChatbotTester } from "@/components/admin/chatbot-tester";

export function ChatbotPanel({
  businessSlug,
  businessName,
}: {
  businessSlug: string;
  businessName: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="pb-6">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Asistente · WhatsApp
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
          Chatbot
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600">
          Probá cómo se comporta el bot en WhatsApp. Editá el prompt y las
          herramientas. Todo en vivo.
        </p>
        <div className="mt-3">
          <ChatbotStatusBadge businessSlug={businessSlug} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        {/* Tester (phone) — fixed width on desktop */}
        <aside className="flex shrink-0 justify-center lg:w-96 lg:justify-start">
          <ChatbotTester
            businessSlug={businessSlug}
            businessName={businessName}
          />
        </aside>

        {/* Configuration — takes the rest */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ChatbotPromptEditor
            businessSlug={businessSlug}
            businessName={businessName}
          />
        </section>
      </div>
    </div>
  );
}
