import { z } from "zod";

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const TableShapeSchema = z.enum(["circle", "square", "rect"]);
export const TableStatusSchema = z.enum(["active", "disabled"]);

export const FloorTableInputSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1, "El nombre es obligatorio.").max(40),
  seats: z.coerce.number().int().min(1).max(50),
  shape: TableShapeSchema,
  x: z.coerce.number().int(),
  y: z.coerce.number().int(),
  width: z.coerce.number().int().min(20),
  height: z.coerce.number().int().min(20),
  rotation: z.coerce.number().int().min(-360).max(360).default(0),
  status: TableStatusSchema.default("active"),
});

export const SaveFloorPlanInputSchema = z.object({
  business_slug: z.string().min(1),
  /** Si viene, edita ese floor_plan específico. Si no, comportamiento legacy
   *  (primero existente o crea uno). Necesario para multi-salón. */
  floor_plan_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(60).default("Salón"),
  width: z.coerce.number().int().min(100).max(5000),
  height: z.coerce.number().int().min(100).max(5000),
  background_image_url: z
    .string()
    .url()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  background_opacity: z.coerce.number().int().min(0).max(100).default(60),
  tables: z.array(FloorTableInputSchema).max(200),
});

export type SaveFloorPlanInput = z.infer<typeof SaveFloorPlanInputSchema>;
export type FloorTableInput = z.infer<typeof FloorTableInputSchema>;

export const DayScheduleSchema = z.object({
  open: z.boolean(),
  slots: z
    .array(z.string().regex(TIME_HHMM, "Formato HH:MM"))
    .max(30),
});

export const WeeklyScheduleSchema = z.record(
  z.enum(["0", "1", "2", "3", "4", "5", "6"]),
  DayScheduleSchema,
);

export const ReservationSettingsInputSchema = z.object({
  business_slug: z.string().min(1),
  slot_duration_min: z.coerce.number().int().min(15).max(600),
  buffer_min: z.coerce.number().int().min(0).max(180),
  lead_time_min: z.coerce.number().int().min(0).max(60 * 24 * 7),
  advance_days_max: z.coerce.number().int().min(1).max(365),
  max_party_size: z.coerce.number().int().min(1).max(100),
  schedule: WeeklyScheduleSchema,
});

export type ReservationSettingsInput = z.infer<typeof ReservationSettingsInputSchema>;

export const CreateReservationInputSchema = z.object({
  business_slug: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  slot: z.string().regex(TIME_HHMM, "Hora inválida"),
  party_size: z.coerce.number().int().min(1).max(100),
  customer_name: z.string().trim().min(1).max(80),
  customer_phone: z.string().trim().min(4).max(40),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (!v ? null : v)),
  /** Salón elegido cuando el negocio tiene más de uno. Si no viene, el
   *  flujo asume el primer floor_plan (legacy single-salón). */
  floor_plan_id: z.string().uuid().optional(),
});

export type CreateReservationInput = z.infer<typeof CreateReservationInputSchema>;

export const AdminCreateReservationInputSchema = CreateReservationInputSchema.extend({
  table_id: z.string().uuid().optional(),
});

export type AdminCreateReservationInput = z.infer<typeof AdminCreateReservationInputSchema>;

export const UpdateReservationStatusInputSchema = z.object({
  business_slug: z.string().min(1),
  id: z.string().uuid(),
  status: z.enum(["confirmed", "seated", "completed", "no_show", "cancelled"]),
});

export const SentarReservaInputSchema = z.object({
  business_slug: z.string().min(1),
  reservation_id: z.string().uuid(),
});

export type UpdateReservationStatusInput = z.infer<typeof UpdateReservationStatusInputSchema>;

export const CancelOwnReservationInputSchema = z.object({
  id: z.string().uuid(),
});

export const AvailabilityQuerySchema = z.object({
  business_slug: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  party_size: z.coerce.number().int().min(1).max(100),
  /** Si viene, restringe los horarios a las mesas de ese salón. */
  floor_plan_id: z.string().uuid().optional(),
});

export const ListSalonesQuerySchema = z.object({
  business_slug: z.string().min(1),
});

export type ListSalonesQuery = z.infer<typeof ListSalonesQuerySchema>;

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;
