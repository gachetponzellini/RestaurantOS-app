/**
 * Reservation domain types — shared between admin floor-plan editor, customer
 * booking flow, and DB layer. Lives outside `admin/` so the public flow can
 * import without pulling server-only admin deps.
 */

export type TableShape = "circle" | "square" | "rect";
export type TableStatus = "active" | "disabled";

export type FloorPlan = {
  id: string;
  business_id: string;
  name: string;
  width: number;
  height: number;
  background_image_url: string | null;
  background_opacity: number;
  created_at: string;
  updated_at: string;
};

export type OperationalStatus = "libre" | "ocupada" | "pidio_cuenta";

export type FloorTable = {
  id: string;
  floor_plan_id: string;
  label: string;
  seats: number;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  status: TableStatus;
  created_at: string;
  // Added in migration 0023 — optional so existing code without these columns compiles
  operational_status?: OperationalStatus;
  current_order_id?: string | null;
  opened_at?: string | null;
  // Added in migration 0029 (CU-09) — mozo asignado actualmente.
  mozo_id?: string | null;
  // Added in migration 0055 (spec 08) — mesa de barra: venta directa, fuera
  // del motor de reservas. Opcional para compilar sin la columna.
  is_bar?: boolean;
};

/**
 * Single day schedule. `slots` are local "HH:MM" strings (business timezone).
 * Empty `slots` + `open: true` = open with no slots configured = no
 * availability that day.
 */
export type DaySchedule = {
  open: boolean;
  slots: string[];
};

/**
 * Keys are day-of-week 0..6 (0=Sunday). Missing keys are treated as closed.
 */
export type WeeklySchedule = Partial<Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", DaySchedule>>;

export type ReservationSettings = {
  business_id: string;
  slot_duration_min: number;
  buffer_min: number;
  lead_time_min: number;
  advance_days_max: number;
  max_party_size: number;
  schedule: WeeklySchedule;
  updated_at: string;
};

export type ReservationStatus =
  | "confirmed"
  | "seated"
  | "completed"
  | "no_show"
  | "cancelled";

export type ReservationSource = "web" | "admin";

/**
 * "Live" statuses: occupy the table and count against availability. Matches
 * the SQL exclusion constraint filter on reservations_no_overlap.
 */
export const LIVE_RESERVATION_STATUSES: ReservationStatus[] = ["confirmed", "seated"];

export type Reservation = {
  id: string;
  business_id: string;
  table_id: string | null;
  user_id: string | null;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  starts_at: string;
  ends_at: string;
  status: ReservationStatus;
  notes: string | null;
  source: ReservationSource;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_FLOOR_PLAN_WIDTH = 1000;
export const DEFAULT_FLOOR_PLAN_HEIGHT = 700;

export const DEFAULT_RESERVATION_SETTINGS: Omit<ReservationSettings, "business_id" | "updated_at"> = {
  slot_duration_min: 90,
  buffer_min: 15,
  lead_time_min: 60,
  advance_days_max: 30,
  max_party_size: 12,
  schedule: {},
};
