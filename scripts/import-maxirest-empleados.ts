// @ts-nocheck
/**
 * import-maxirest-empleados.ts — Migra empleados reales desde el backup de
 * MaxiRest (tabla mxemp) a business_users de golf-jcr, con su PIN de fichaje.
 *
 * PIN = código de MaxiRest, zero-padeado a 4 dígitos (único en origen, no
 * colisiona con los PINs de seed 1111-5555 porque el máximo código real es
 * 367).
 *
 * Antes de crear los empleados reales, deshabilita (soft-delete) los 5
 * empleados de seed/demo de golf-jcr (Pedro Mozo, Lucía Moza, Ramón Cocina,
 * Sofía Encargada, Marta Limpieza).
 *
 * Uso: `npx tsx scripts/import-maxirest-empleados.ts`
 */

import { resolve } from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(__dirname, "../.env.local") });

const SLUG = "golf-jcr";
const SEED_EMPLOYEE_NAMES = [
  "Pedro Mozo",
  "Lucía Moza",
  "Ramón Cocina",
  "Sofía Encargada",
  "Marta Limpieza",
];

type Row = {
  codigo: number;
  nombre: string;
  apellido: string;
  role: "mozo" | "personal" | "encargado";
};

// tipo M → mozo, tipo O y sin-tipo → personal, tipo C (cajero) → encargado.
const EMPLOYEES: Row[] = [
  // sin tipo cargado en MaxiRest → personal
  { codigo: 112, nombre: "IRMA", apellido: "TORALES", role: "personal" },
  { codigo: 113, nombre: "ROBERTO", apellido: "BARABAS", role: "personal" },
  { codigo: 114, nombre: "FABIAN", apellido: "RUIZ DIAZ", role: "personal" },
  { codigo: 116, nombre: "EDUARDO", apellido: "CORONEL", role: "personal" },
  { codigo: 117, nombre: "JAVIER", apellido: "CANTO", role: "personal" },
  { codigo: 118, nombre: "YANINA", apellido: "CARDOZO", role: "personal" },
  { codigo: 308, nombre: "SARA", apellido: "ESCOBAR", role: "personal" },
  { codigo: 322, nombre: "NICOLAS", apellido: "MARINI", role: "personal" },
  { codigo: 333, nombre: "ANDRES", apellido: "JACQUES", role: "personal" },
  { codigo: 345, nombre: "GISELLE", apellido: "RODRIGUEZ", role: "personal" },
  { codigo: 350, nombre: "CARINA", apellido: "CARDOZO", role: "personal" },
  { codigo: 351, nombre: "MELINA AILEN", apellido: "ACOSTA", role: "personal" },
  { codigo: 360, nombre: "ROCIO", apellido: "ROJAS", role: "personal" },
  // tipo C (cajero) → encargado
  { codigo: 10, nombre: "Sebastian", apellido: "Ramirez", role: "encargado" },
  { codigo: 11, nombre: "Andres", apellido: "Canto", role: "encargado" },
  // tipo M → mozo
  { codigo: 103, nombre: "JOSE LUIS", apellido: "GOMEZ", role: "mozo" },
  { codigo: 104, nombre: "DARIO", apellido: "DESTEFANO", role: "mozo" },
  { codigo: 108, nombre: "XIMENA", apellido: "MARINI", role: "mozo" },
  { codigo: 120, nombre: "MATIAS", apellido: "ZUCCHI", role: "mozo" },
  { codigo: 307, nombre: "LUCIO", apellido: "RODRIGUEZ", role: "mozo" },
  { codigo: 316, nombre: "HUGO", apellido: "MARINI", role: "mozo" },
  { codigo: 318, nombre: "DEBORA", apellido: "VIVAS", role: "mozo" },
  { codigo: 338, nombre: "RAMIRO", apellido: "JUANTO", role: "mozo" },
  { codigo: 346, nombre: "EMILIANO", apellido: "ARRIOLA", role: "mozo" },
  { codigo: 348, nombre: "TIARA", apellido: "LEGUIZA", role: "mozo" },
  { codigo: 355, nombre: "DANIELA", apellido: "GUASTAVINO", role: "mozo" },
  { codigo: 366, nombre: "AZUL", apellido: "ERA", role: "mozo" },
  { codigo: 367, nombre: "ROCIO", apellido: "CETTOUR", role: "mozo" },
  // tipo O → personal
  { codigo: 105, nombre: "MIGUEL", apellido: "ARCE", role: "personal" },
  { codigo: 109, nombre: "GRACIELA", apellido: "PANE", role: "personal" },
  { codigo: 111, nombre: "SHEILA", apellido: "TONSO", role: "personal" },
  { codigo: 201, nombre: "ANALIA", apellido: "LEZCANO", role: "personal" },
  { codigo: 304, nombre: "SEBASTIAN", apellido: "MASUELLI", role: "personal" },
  { codigo: 314, nombre: "ROMINA", apellido: "CACERES", role: "personal" },
  { codigo: 323, nombre: "ARACELI", apellido: "GALVEZ", role: "personal" },
  { codigo: 340, nombre: "DAIANA", apellido: "DIAZ", role: "personal" },
  { codigo: 342, nombre: "CARINA", apellido: "LARES", role: "personal" },
  { codigo: 344, nombre: "NAIARA", apellido: "SALGUERO", role: "personal" },
  { codigo: 356, nombre: "ROCIO", apellido: "RIERA", role: "personal" },
  { codigo: 359, nombre: "GEORGINA", apellido: "CARGEMEL", role: "personal" },
];

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: business, error: bizErr } = await sb
    .from("businesses")
    .select("id")
    .eq("slug", SLUG)
    .single();
  if (bizErr || !business) {
    console.error(`✗ Negocio '${SLUG}' no encontrado:`, bizErr?.message);
    process.exit(1);
  }
  const businessId = business.id;
  console.log(`✓ Negocio ${SLUG} = ${businessId}`);

  // ── Deshabilitar los 5 empleados seed/demo ──
  const { data: seedRows } = await sb
    .from("business_users")
    .select("user_id, full_name")
    .eq("business_id", businessId)
    .in("full_name", SEED_EMPLOYEE_NAMES);

  for (const row of seedRows ?? []) {
    const { error } = await sb
      .from("business_users")
      .update({ disabled_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("user_id", row.user_id);
    if (error) {
      console.error(`✗ No se pudo deshabilitar ${row.full_name}:`, error.message);
    } else {
      console.log(`✓ Deshabilitado seed: ${row.full_name}`);
    }
  }

  // ── Crear empleados reales ──
  let created = 0;
  let skipped = 0;
  const { data: existingUsers } = await sb.auth.admin.listUsers({ perPage: 200 });

  for (const emp of EMPLOYEES) {
    const pin = String(emp.codigo).padStart(4, "0");
    const fullName = titleCase(`${emp.nombre} ${emp.apellido}`.trim());
    const email = `empleado-${pin}@${SLUG}.internal`;
    const password = crypto.randomUUID().slice(0, 16);

    let userId: string;
    const existing = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );

    if (existing) {
      userId = existing.id;
    } else {
      const { data: newUser, error } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !newUser.user) {
        console.error(`✗ Auth user ${fullName} (${pin}):`, error?.message);
        continue;
      }
      userId = newUser.user.id;
    }

    await sb.from("users").upsert(
      { id: userId, email, full_name: fullName },
      { onConflict: "id" },
    );

    const { error: buErr } = await sb.from("business_users").upsert(
      {
        business_id: businessId,
        user_id: userId,
        role: emp.role,
        pin,
        full_name: fullName,
        disabled_at: null,
      },
      { onConflict: "business_id,user_id" },
    );

    if (buErr) {
      console.error(`✗ business_users ${fullName} (${pin}):`, buErr.message);
      continue;
    }

    console.log(`✓ ${fullName} — PIN ${pin} — ${emp.role}`);
    created++;
  }

  console.log(`\nListo. ${created} empleados creados/actualizados, ${skipped} saltados.`);
}

main();
