import { z } from "zod";

const timeRegex = /^\d{2}:\d{2}$/;

/** "00:00" means midnight (end of day) → treat as "24:00" for comparisons. */
function effective(time: string): string {
  return time === "00:00" ? "24:00" : time;
}

export const businessHourSlotSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  opens_at: z.string().regex(timeRegex, "Formato HH:MM"),
  closes_at: z.string().regex(timeRegex, "Formato HH:MM"),
}).refine(
  (s) => effective(s.closes_at) > s.opens_at,
  { message: "La hora de cierre debe ser posterior a la de apertura" },
);

export type BusinessHourSlot = z.infer<typeof businessHourSlotSchema>;

function slotsOverlap(a: BusinessHourSlot, b: BusinessHourSlot): boolean {
  const aClose = effective(a.closes_at);
  const bClose = effective(b.closes_at);
  return a.opens_at < bClose && b.opens_at < aClose;
}

export const businessHoursSchema = z
  .array(businessHourSlotSchema)
  .refine(
    (slots) => {
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          if (
            slots[i].day_of_week === slots[j].day_of_week &&
            slotsOverlap(slots[i], slots[j])
          ) {
            return false;
          }
        }
      }
      return true;
    },
    { message: "Hay franjas horarias superpuestas en el mismo día" },
  );
