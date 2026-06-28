import { MessagesSquare } from "lucide-react";

// Panel derecho cuando no hay conversación elegida (desktop). En mobile esta
// ruta no se ve: el InboxShell muestra la lista a pantalla completa.
export default function ConversacionesEmptyPage() {
  return (
    <div className="hidden h-full w-full flex-col items-center justify-center gap-3 bg-[#F7F4EF] text-center text-zinc-500 md:flex">
      <MessagesSquare className="size-10 opacity-40" strokeWidth={1.5} />
      <p className="max-w-xs text-sm">
        Elegí una conversación de la lista para verla y responder.
      </p>
    </div>
  );
}
