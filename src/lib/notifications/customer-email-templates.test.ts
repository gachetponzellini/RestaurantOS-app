import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  invoiceIssuedEmail,
  orderScheduledEmail,
  orderStatusEmail,
  reservationConfirmedEmail,
  reservationReminderEmail,
} from "./customer-email-templates";

describe("escapeHtml", () => {
  it("neutraliza caracteres peligrosos", () => {
    expect(escapeHtml('<b>"x"</b> & y')).toBe(
      "&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y",
    );
  });
});

describe("orderStatusEmail", () => {
  it("usa el body de delivery como texto y lo envuelve en HTML", () => {
    const mail = orderStatusEmail({
      businessName: "Golf",
      orderNumber: 42,
      body: "Tu pedido #42 ya está listo. 🙌",
    });
    expect(mail.subject).toContain("#42");
    expect(mail.subject).toContain("Golf");
    expect(mail.text).toBe("Tu pedido #42 ya está listo. 🙌");
    expect(mail.html).toContain("Golf");
    expect(mail.html).toContain("listo");
  });

  it("escapa el nombre del negocio en el HTML", () => {
    const mail = orderStatusEmail({
      businessName: "Bar <script>",
      orderNumber: 1,
      body: "hola",
    });
    expect(mail.html).toContain("Bar &lt;script&gt;");
    expect(mail.html).not.toContain("<script>");
  });
});

describe("reservationConfirmedEmail", () => {
  it("incluye datos y CTA de gestión", () => {
    const mail = reservationConfirmedEmail({
      businessName: "House",
      customerName: "Ana",
      whenLabel: "sáb 19/07 21:00",
      partySize: 4,
      manageUrl: "https://x/perfil/reservas",
    });
    expect(mail.subject).toContain("Reserva confirmada");
    expect(mail.text).toContain("Ana");
    expect(mail.text).toContain("mesa para 4");
    expect(mail.html).toContain("Ver mi reserva");
    expect(mail.html).toContain("https://x/perfil/reservas");
  });

  it("sin manageUrl no rompe ni pone CTA", () => {
    const mail = reservationConfirmedEmail({
      businessName: "House",
      customerName: "Ana",
      whenLabel: "sáb 19/07 21:00",
      partySize: 2,
    });
    expect(mail.html).not.toContain("Ver mi reserva");
  });
});

describe("reservationReminderEmail (double opt-in)", () => {
  it("incluye el CTA de confirmar asistencia cuando hay confirmUrl", () => {
    const mail = reservationReminderEmail({
      businessName: "Golf",
      customerName: "Leo",
      whenLabel: "hoy 21:00",
      partySize: 3,
      confirmUrl: "https://x/reservar/confirmar/tok",
    });
    expect(mail.html).toContain("Confirmar asistencia");
    expect(mail.html).toContain("https://x/reservar/confirmar/tok");
    expect(mail.html).toContain("liberamos la mesa");
  });
});

describe("orderScheduledEmail / invoiceIssuedEmail", () => {
  it("agendado nombra el pedido y el momento", () => {
    const mail = orderScheduledEmail({
      businessName: "Golf",
      customerName: "Sol",
      orderNumber: 7,
      whenLabel: "20/07 a las 13:00 hs",
    });
    expect(mail.text).toContain("#7");
    expect(mail.text).toContain("13:00");
  });

  it("comprobante nombra total y pedido", () => {
    const mail = invoiceIssuedEmail({
      businessName: "Golf",
      customerName: "Sol",
      orderNumber: 7,
      totalLabel: "$12.500",
      comprobanteLabel: "Factura B 0001-00000042",
    });
    expect(mail.subject).toContain("#7");
    expect(mail.text).toContain("$12.500");
    expect(mail.text).toContain("Factura B");
  });
});
