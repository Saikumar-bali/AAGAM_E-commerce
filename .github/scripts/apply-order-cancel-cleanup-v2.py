from pathlib import Path
import runpy

service_path = Path("apps/api-gateway/src/orders/order.service.ts")
source = service_path.read_text()

helper = """  private async cancelAssociatedDeliveryJob(orderId: string, tx: any) {
    const deliveryJob = await tx.deliveryJob.findUnique({
      where: { orderId },
    });

    if (!deliveryJob || ['DELIVERED', 'RETURNED_TO_STORE', 'CANCELLED'].includes(deliveryJob.status)) {
      return;
    }

    const respondedAt = new Date();

    await tx.deliveryJob.update({
      where: { id: deliveryJob.id },
      data: {
        status: 'CANCELLED',
        currentRiderId: null,
      },
    });

    await tx.dispatchAssignment.updateMany({
      where: {
        deliveryJobId: deliveryJob.id,
        status: { in: ['CREATED', 'OFFERED'] },
      },
      data: { status: 'CANCELLED', respondedAt },
    });
  }

"""

if "private async cancelAssociatedDeliveryJob" not in source:
    marker = "  private statusNote(nextStatus: OrderStatus, actorRole?: Role) {"
    if source.count(marker) != 1:
        raise SystemExit(f"Expected one statusNote marker, found {source.count(marker)}")
    source = source.replace(marker, helper + marker, 1)


def insert_cleanup_call(method_name: str, update_id: str, call_order_id: str) -> None:
    global source
    method_start = source.index(f"  async {method_name}(")
    next_method = source.find("\n  async ", method_start + 1)
    method_end = len(source) if next_method == -1 else next_method
    region = source[method_start:method_end]
    call = f"      await this.cancelAssociatedDeliveryJob({call_order_id}, tx);"
    if call in region:
        return

    update = f"""      const updated = await tx.order.update({{
        where: {{ id: {update_id} }},
        data: {{ status: OrderStatus.CANCELLED, cancelledAt: new Date() }},
      }});"""
    if region.count(update) != 1:
        raise SystemExit(
            f"Expected one cancellation update in {method_name}, found {region.count(update)}"
        )
    region = region.replace(update, update + "\n\n" + call, 1)
    source = source[:method_start] + region + source[method_end:]


insert_cleanup_call("cancelMyOrder", "order.id", "order.id")
insert_cleanup_call("forceCancel", "orderId", "orderId")
service_path.write_text(source)

# Reuse the original script only for deterministic regression-test generation.
# Its source replacements are skipped because the helper and both calls now exist.
runpy.run_path(".github/scripts/apply-order-cancel-cleanup.py", run_name="__main__")
