import { describe, expect, it } from "vitest";
import { SDLC_STAGES, actorCanApprove, actorCanCreateStage, getStageForType } from "./pipeline.ts";

describe("sdlc pipeline", () => {
  it("runs code and test in parallel after design (same order, both require design)", () => {
    expect(SDLC_STAGES.map((row) => row.id)).toEqual(["story", "design", "code", "test"]);
    expect(SDLC_STAGES.find((row) => row.id === "design")?.requiresApprovedStage).toBe("story");
    expect(SDLC_STAGES.find((row) => row.id === "code")?.requiresApprovedStage).toBe("design");
    expect(SDLC_STAGES.find((row) => row.id === "test")?.requiresApprovedStage).toBe("design");
    expect(SDLC_STAGES.find((row) => row.id === "code")?.order).toBe(
      SDLC_STAGES.find((row) => row.id === "test")?.order,
    );
  });

  it("maps artifact types to stages", () => {
    expect(getStageForType("STORY")?.id).toBe("story");
    expect(getStageForType("DESIGN")?.id).toBe("design");
    expect(getStageForType("CODE")?.id).toBe("code");
    expect(getStageForType("TEST")?.id).toBe("test");
  });

  it("gates create/approve by role and permission", () => {
    const po = {
      id: "1",
      username: "po",
      displayName: "PO",
      roles: ["product_owner"],
      permissions: ["requirement:create", "artifact:create", "artifact:approve"],
    };
    expect(actorCanCreateStage(po, "story")).toBe(true);
    expect(actorCanCreateStage(po, "code")).toBe(false);
    expect(actorCanApprove(po)).toBe(true);

    const developer = {
      id: "2",
      username: "dev",
      displayName: "Dev",
      roles: ["developer"],
      permissions: ["artifact:create", "code:view"],
    };
    expect(actorCanCreateStage(developer, "code")).toBe(true);
    expect(actorCanApprove(developer)).toBe(false);
  });
});
