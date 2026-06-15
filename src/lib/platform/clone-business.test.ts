import { describe, expect, it } from "vitest";

import {
  OPERATIONAL_TABLES,
  SECRET_BUSINESS_COLUMNS,
  STRUCTURE_TABLES,
} from "./clone-business";

describe("cloneBusiness / whitelist de estructura", () => {
  it("no incluye ninguna tabla operativa", () => {
    for (const op of OPERATIONAL_TABLES) {
      expect(STRUCTURE_TABLES).not.toContain(op);
    }
  });

  it("incluye las tablas de estructura esperadas", () => {
    const expected = [
      "stations",
      "super_categories",
      "categories",
      "products",
      "modifier_groups",
      "modifiers",
      "floor_plans",
      "tables",
      "daily_menus",
      "daily_menu_components",
      "ingredients",
      "ingredient_presentations",
      "ingredient_recipes",
      "recipes",
      "business_hours",
      "reservation_settings",
      "payment_method_configs",
      "chatbot_configs",
    ];
    for (const t of expected) {
      expect(STRUCTURE_TABLES).toContain(t);
    }
  });

  it("secretos de businesses que nunca se clonan", () => {
    expect(SECRET_BUSINESS_COLUMNS).toContain("mp_access_token");
    expect(SECRET_BUSINESS_COLUMNS).toContain("mp_webhook_secret");
    expect(SECRET_BUSINESS_COLUMNS).toContain("afip_provider_api_key");
    expect(SECRET_BUSINESS_COLUMNS).toContain("afip_provider_api_token");
    expect(SECRET_BUSINESS_COLUMNS).toContain("afip_provider_user_token");
  });
});
