import { ValidationPipe } from "@nestjs/common";
import { readFileSync } from "fs";
import path from "path";
import {
  RiderAvailabilityDto,
  RiderProfileDto,
  RiderSupportTicketDto,
} from "./riders/rider-portal.dto";

describe("Phase 4 Rider portal regression gate", () => {
  const apiRoot = path.resolve(__dirname);
  const webRoot = path.resolve(__dirname, "../../admin-dashboard/src");
  const readApi = (relative: string) =>
    readFileSync(path.join(apiRoot, relative), "utf8");
  const readWeb = (relative: string) =>
    readFileSync(path.join(webRoot, relative), "utf8");

  it("exposes Rider-only portal routes for every Phase 4 domain", () => {
    const controller = readApi("riders/rider-portal.controller.ts");
    expect(controller).toMatch(/@Controller\(["']riders\/portal["']\)/);
    expect(controller).toContain("@Roles(Role.RIDER)");
    for (const route of [
      "home",
      "offers",
      "delivery",
      "history",
      "pickup",
      "earnings",
      "cod",
      "performance",
      "availability",
      "profile",
      "documents",
      "support",
    ]) {
      expect(controller).toContain(route);
    }
  });

  it("keeps shift, earning, payout-state, document, bank, and support decisions Admin-only", () => {
    const controller = readApi("riders/rider-admin.controller.ts");
    expect(controller).toMatch(/@Controller\(["']riders\/admin["']\)/);
    expect(controller).toContain("@Roles(Role.ADMIN)");
    for (const route of [
      "shifts",
      "earnings",
      "paid",
      "review",
      "approval",
      "bank-review",
      "support",
    ]) {
      expect(controller).toContain(route);
    }
  });

  it("keeps earnings tied to persisted RiderEarning rows and not order totals", () => {
    const service = readApi("riders/rider-portal.service.ts");
    const history = readWeb("app/(rider)/rider/history/page.tsx");
    const earnings = readWeb("app/(rider)/rider/earnings/page.tsx");
    expect(service).toContain("prisma.riderEarning.findMany");
    expect(history).not.toContain("totalEarnings");
    expect(history).not.toContain("grandTotal");
    expect(earnings).toContain("/riders/portal/earnings");
  });

  it("protects bank values and never returns ciphertext", () => {
    const service = readApi("riders/rider-portal.service.ts");
    expect(service).toContain("aes-256-gcm");
    expect(service).toContain("RIDER_BANK_ENCRYPTION_KEY");
    expect(service).toContain("bankAccountLast4");
    expect(service).toContain("bankAccountCiphertext: _account");
    expect(service).not.toContain(
      "bankAccountCiphertext: rider.bankAccountCiphertext"
    );
  });

  it("stores Rider documents and support evidence in private object storage", () => {
    const uploadController = readApi("upload/upload.controller.ts");
    const uploadService = readApi("upload/upload.service.ts");
    const schema = readFileSync(
      path.resolve(
        __dirname,
        "../../../packages/database/prisma/schema.prisma"
      ),
      "utf8"
    );
    expect(uploadController).toContain("evidence");
    expect(uploadController).toContain("evidence-url");
    expect(uploadService).toContain("R2_EVIDENCE_BUCKET_NAME");
    expect(uploadService).toContain("getSignedUrl");
    expect(schema).toContain("storageKey");
    expect(schema).toContain("evidenceKeys");
    expect(schema).not.toContain("fileUrl             String");
  });

  it("uses canonical Phase 3 operations for OTP, COD, failure, and returns", () => {
    const page = readWeb("app/(rider)/rider/delivery/page.tsx");
    expect(page).toContain("/orders/delivery-operations/jobs/");
    expect(page).toContain("/otp/issue");
    expect(page).toContain("/cod/collect");
    expect(page).toContain("/failure");
    expect(page).toContain("/return/start");
    expect(page).not.toContain("endpoint: 'delivered'");
  });

  it("provides all Rider portal web destinations and a notification unread badge", () => {
    const sidebar = readWeb("components/Sidebar.tsx");
    for (const route of [
      "/rider/offers",
      "/rider/delivery",
      "/rider/pickup",
      "/rider/earnings",
      "/rider/cod",
      "/rider/performance",
      "/rider/availability",
      "/rider/support",
    ]) {
      expect(sidebar).toContain(route);
    }
    expect(sidebar).toContain("riderUnread");
  });

  it("rejects invalid schedule, bank, and support payloads", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(
        {
          entries: [
            { dayOfWeek: 8, startMinute: 0, endMinute: 30, isAvailable: true },
          ],
        },
        { type: "body", metatype: RiderAvailabilityDto } as any
      )
    ).rejects.toBeDefined();
    await expect(
      pipe.transform({ bankAccountNumber: "not-a-number", bankIfsc: "bad" }, {
        type: "body",
        metatype: RiderProfileDto,
      } as any)
    ).rejects.toBeDefined();
    await expect(
      pipe.transform(
        { category: "INVALID", subject: "x", description: "short" },
        { type: "body", metatype: RiderSupportTicketDto } as any
      )
    ).rejects.toBeDefined();
  });
});
