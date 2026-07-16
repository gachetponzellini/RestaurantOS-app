import { describe, expect, it } from "vitest";

import { notificationOrFilter, visibleTargetRoles } from "./visibility";

describe("visibleTargetRoles", () => {
  it("el dueño (admin) ve todo lo broadcast: admin + encargado + mozo", () => {
    const roles = visibleTargetRoles("admin");
    expect(roles).toEqual(expect.arrayContaining(["admin", "encargado", "mozo"]));
  });

  it("el encargado ve lo operativo: encargado + mozo, pero NO lo de admin", () => {
    const roles = visibleTargetRoles("encargado");
    expect(roles).toEqual(expect.arrayContaining(["encargado", "mozo"]));
    expect(roles).not.toContain("admin");
  });

  it("el mozo ve solo lo suyo", () => {
    expect(visibleTargetRoles("mozo")).toEqual(["mozo"]);
  });

  it("personal ve solo lo suyo (no participa del feed operativo)", () => {
    expect(visibleTargetRoles("personal")).toEqual(["personal"]);
  });

  it("rol null (platform admin sin membership) ve todo — se comporta como dueño", () => {
    const roles = visibleTargetRoles(null);
    expect(roles).toEqual(expect.arrayContaining(["admin", "encargado", "mozo"]));
  });
});

describe("notificationOrFilter", () => {
  it("dueño (admin): matchea su userId + broadcasts admin/encargado/mozo (OR plano, sin in.())", () => {
    expect(notificationOrFilter("u-1", "admin")).toBe(
      "user_id.eq.u-1,target_role.eq.admin,target_role.eq.encargado,target_role.eq.mozo",
    );
  });

  it("encargado: su userId + broadcasts encargado/mozo, nunca admin", () => {
    const filter = notificationOrFilter("u-2", "encargado");
    expect(filter).toBe(
      "user_id.eq.u-2,target_role.eq.encargado,target_role.eq.mozo",
    );
    expect(filter).not.toContain("target_role.eq.admin");
  });

  it("mozo: solo su userId + broadcasts mozo", () => {
    expect(notificationOrFilter("u-3", "mozo")).toBe(
      "user_id.eq.u-3,target_role.eq.mozo",
    );
  });
});
