"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { cloneBusinessStructure } from "@/lib/platform/clone-business";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const BusinessInput = z.object({
  name: z.string().min(1, "Requerido.").max(120),
  slug: z
    .string()
    .min(2, "Muy corto.")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Sólo minúsculas, números y guiones."),
  timezone: z.string().min(1),
  admin_email: z.string().email("Email inválido."),
});

async function assertPlatformAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("No autenticado.");
  const service = createSupabaseServiceClient();
  const { data: profile } = await service
    .from("users")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_platform_admin) {
    return actionError("Permiso denegado.");
  }
  return null;
}

export async function createBusiness(
  input: unknown,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const guard = await assertPlatformAdmin();
  if (guard) return guard;

  const parsed = BusinessInput.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Datos inválidos.",
    );
  }
  const { name, slug, timezone, admin_email } = parsed.data;

  if (RESERVED_SLUGS.has(slug)) {
    return actionError("Ese slug está reservado.");
  }

  const service = createSupabaseServiceClient();

  // Check slug uniqueness
  const { data: existing } = await service
    .from("businesses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) return actionError("Ya existe un negocio con ese slug.");

  // 1. Invite business admin (creates auth.user + sends email). Idempotent:
  // if the user already exists, fetch its id instead.
  let userId: string | null = null;
  const {
    data: { users: allUsers },
  } = await service.auth.admin.listUsers({ perPage: 200 });
  const existingUser = allUsers.find(
    (u) => u.email?.toLowerCase() === admin_email.toLowerCase(),
  );

  const adminRedirectTo = `${getSiteUrl()}/${slug}/admin`;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    const { data: invite, error: inviteErr } =
      await service.auth.admin.inviteUserByEmail(admin_email, {
        redirectTo: adminRedirectTo,
      });
    if (inviteErr || !invite.user) {
      console.error("inviteUserByEmail", inviteErr);
      return actionError("No pudimos enviar la invitación.");
    }
    userId = invite.user.id;
  }

  // 2. Create business
  const { data: business, error: bizErr } = await service
    .from("businesses")
    .insert({
      slug,
      name,
      timezone,
      settings: {
        primary_color: "#E11D48",
        primary_foreground: "#FFFFFF",
      },
    })
    .select("id, slug")
    .single();
  if (bizErr || !business) {
    console.error("createBusiness insert", bizErr);
    return actionError("No pudimos crear el negocio.");
  }

  // 3. Ensure public.users row exists
  const { error: userUpsertErr } = await service
    .from("users")
    .upsert({ id: userId, email: admin_email }, { onConflict: "id" });
  if (userUpsertErr) {
    console.error("users upsert", userUpsertErr);
    return actionError("No pudimos registrar al admin.");
  }

  // 4. Link admin as business_user
  const { error: buErr } = await service.from("business_users").insert({
    business_id: business.id,
    user_id: userId,
    role: "admin",
  });
  if (buErr) {
    console.error("business_users insert", buErr);
    return actionError("No pudimos asignar al admin.");
  }

  revalidatePath("/");
  return actionOk({ id: business.id, slug: business.slug });
}

// ── Provisioning por clonación (spec 14) ──────────────────────

const CloneBusinessInput = z.object({
  name: z.string().min(1, "Requerido.").max(120),
  slug: z
    .string()
    .min(2, "Muy corto.")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Sólo minúsculas, números y guiones."),
  timezone: z.string().min(1),
  admin_email: z.string().email("Email inválido."),
  source_business_id: z.string().uuid("ID de negocio plantilla inválido."),
});

export async function cloneBusiness(
  input: unknown,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const guard = await assertPlatformAdmin();
  if (guard) return guard;

  const parsed = CloneBusinessInput.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Datos inválidos.",
    );
  }
  const { name, slug, timezone, admin_email, source_business_id } =
    parsed.data;

  if (RESERVED_SLUGS.has(slug)) {
    return actionError("Ese slug está reservado.");
  }

  const service = createSupabaseServiceClient();

  const { data: existing } = await service
    .from("businesses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) return actionError("Ya existe un negocio con ese slug.");

  const { data: source } = await service
    .from("businesses")
    .select("id")
    .eq("id", source_business_id)
    .maybeSingle();
  if (!source) return actionError("Negocio plantilla no encontrado.");

  let userId: string | null = null;
  const {
    data: { users: allUsers },
  } = await service.auth.admin.listUsers({ perPage: 200 });
  const existingUser = allUsers.find(
    (u) => u.email?.toLowerCase() === admin_email.toLowerCase(),
  );

  const adminRedirectTo = `${getSiteUrl()}/${slug}/admin`;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    const { data: invite, error: inviteErr } =
      await service.auth.admin.inviteUserByEmail(admin_email, {
        redirectTo: adminRedirectTo,
      });
    if (inviteErr || !invite.user) {
      console.error("inviteUserByEmail", inviteErr);
      return actionError("No pudimos enviar la invitación.");
    }
    userId = invite.user.id;
  }

  const { data: business, error: bizErr } = await service
    .from("businesses")
    .insert({
      slug,
      name,
      timezone,
      settings: {
        primary_color: "#E11D48",
        primary_foreground: "#FFFFFF",
      },
    })
    .select("id, slug")
    .single();
  if (bizErr || !business) {
    console.error("cloneBusiness insert", bizErr);
    return actionError("No pudimos crear el negocio.");
  }

  const { error: userUpsertErr } = await service
    .from("users")
    .upsert({ id: userId, email: admin_email }, { onConflict: "id" });
  if (userUpsertErr) {
    console.error("users upsert", userUpsertErr);
    return actionError("No pudimos registrar al admin.");
  }

  const { error: buErr } = await service.from("business_users").insert({
    business_id: business.id,
    user_id: userId,
    role: "admin",
  });
  if (buErr) {
    console.error("business_users insert", buErr);
    return actionError("No pudimos asignar al admin.");
  }

  await cloneBusinessStructure(service, source_business_id, business.id);

  revalidatePath("/");
  return actionOk({ id: business.id, slug: business.slug });
}

const InviteInput = z.object({
  business_id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "encargado"]),
});

export async function inviteBusinessMember(
  input: unknown,
): Promise<ActionResult<null>> {
  const guard = await assertPlatformAdmin();
  if (guard) return guard;

  const parsed = InviteInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");
  const { business_id, email, role } = parsed.data;

  const service = createSupabaseServiceClient();

  const { data: business } = await service
    .from("businesses")
    .select("slug")
    .eq("id", business_id)
    .maybeSingle();
  if (!business) return actionError("Negocio no encontrado.");

  const {
    data: { users: allUsers },
  } = await service.auth.admin.listUsers({ perPage: 200 });
  let user = allUsers.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  if (!user) {
    const { data: invite, error: inviteErr } =
      await service.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${getSiteUrl()}/${business.slug}/admin`,
      });
    if (inviteErr || !invite.user) {
      console.error("inviteUserByEmail", inviteErr);
      return actionError("No pudimos enviar la invitación.");
    }
    user = invite.user;
  }

  const { error: userUpsertErr } = await service
    .from("users")
    .upsert({ id: user.id, email }, { onConflict: "id" });
  if (userUpsertErr) return actionError("No pudimos registrar el usuario.");

  const { error: buErr } = await service.from("business_users").upsert(
    {
      business_id,
      user_id: user.id,
      role,
    },
    { onConflict: "business_id,user_id" },
  );
  if (buErr) {
    console.error("business_users upsert", buErr);
    return actionError("No pudimos asignar al miembro.");
  }

  revalidatePath(`/negocios/${business_id}`);
  return actionOk(null);
}

export async function removeBusinessMember(
  businessId: string,
  userId: string,
): Promise<ActionResult<null>> {
  const guard = await assertPlatformAdmin();
  if (guard) return guard;

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("business_users")
    .delete()
    .eq("business_id", businessId)
    .eq("user_id", userId);
  if (error) {
    console.error("removeBusinessMember", error);
    return actionError("No pudimos quitar al miembro.");
  }
  revalidatePath(`/negocios/${businessId}`);
  return actionOk(null);
}

function getSiteUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const rootDomain = process.env.ROOT_DOMAIN ?? "localhost:3000";
  const proto = rootDomain.includes("localhost") ? "http" : "https";
  return `${proto}://${rootDomain}`;
}
