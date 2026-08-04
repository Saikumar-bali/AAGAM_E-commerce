import { ConflictException, Injectable } from "@nestjs/common";
import { prisma } from "@aagam/database";
import { SettleCodDto } from "./delivery-operations.dto";
import { DeliveryOperationsService } from "./delivery-operations.service";

@Injectable()
export class CodSettlementFacadeService {
  constructor(private readonly operations: DeliveryOperationsService) {}

  async settle(
    deliveryJobId: string,
    actor: any,
    input: SettleCodDto,
    idempotencyKey?: string
  ) {
    const settlementReference = input.settlementReference.trim();
    const conflicting = await prisma.codLedger.findFirst({
      where: {
        settlementReference,
        NOT: { deliveryJobId },
      },
      select: { id: true, deliveryJobId: true },
    });
    if (conflicting) {
      throw new ConflictException(
        "Settlement reference is already attached to another COD ledger"
      );
    }

    try {
      return await this.operations.settleCod(
        deliveryJobId,
        actor,
        { ...input, settlementReference },
        idempotencyKey
      );
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException(
          "Settlement reference is already attached to another COD ledger"
        );
      }
      throw error;
    }
  }
}
