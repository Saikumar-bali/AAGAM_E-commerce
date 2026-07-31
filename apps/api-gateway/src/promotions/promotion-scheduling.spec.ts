import { PromotionStatus } from "@aagam/database";
import { resolveCampaignStatus } from "./promotion-scheduling";

describe("resolveCampaignStatus", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");

  test("publishes a campaign when no lifecycle status is supplied", () => {
    expect(resolveCampaignStatus(undefined, null, now)).toBe(
      PromotionStatus.ACTIVE,
    );
  });

  test("schedules a publish request with a future start", () => {
    expect(
      resolveCampaignStatus(
        PromotionStatus.ACTIVE,
        "2026-08-01T00:00:00.000Z",
        now,
      ),
    ).toBe(PromotionStatus.SCHEDULED);
  });

  test("preserves an explicit draft or paused state", () => {
    expect(resolveCampaignStatus(PromotionStatus.DRAFT, null, now)).toBe(
      PromotionStatus.DRAFT,
    );
    expect(resolveCampaignStatus(PromotionStatus.PAUSED, null, now)).toBe(
      PromotionStatus.PAUSED,
    );
  });
});
