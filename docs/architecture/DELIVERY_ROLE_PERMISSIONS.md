# Delivery Role Permissions

Branch: `phase-0-delivery-domain-foundation`

## Principles

1. Every delivery action is authorized by both role and resource ownership.
2. A valid role alone is insufficient; store and rider ownership checks are mandatory.
3. Riders never browse a public order pool.
4. Customers cannot mutate delivery operations.
5. Admin overrides remain constrained by the state machine and audit events.
6. Generic order-status mutation is not a rider API.

## Permission matrix

| Capability | Customer | Rider | Store owner | Admin |
|---|---:|---:|---:|---:|
| View own customer order/tracking | Own only | No | No | Yes |
| View rider workspace | No | Own only | No | Yes through board/audit |
| View dispatch board | No | No | Own stores only | All stores |
| Mark store order packed | No | No | Own stores only | Through admin order tooling |
| Create delivery job | No | No | Own packed order | Any packed order |
| Create rider offer | No | No | Own store job | Any waiting job |
| Accept/reject offer | No | Offered rider only | No | No |
| Start trip to store | No | Assigned rider only | No | State-machine override |
| Mark rider arrived at store | No | Assigned rider only | No | State-machine override |
| Verify pickup | No | No | Own store only | Yes |
| Start out-for-delivery | No | Assigned rider only | No | State-machine override |
| Mark arrival at customer | No | Assigned rider only | No | State-machine override |
| Mark delivered | No | Assigned rider only | No | State-machine override |
| Cancel/exception transition | No in Phase 0 | Limited failure/return actions | No in Phase 0 | Yes |
| Generic `PATCH /orders/:id/status` | No | **Removed** | Store order transitions only | Yes |
| Rider self-assignment `/orders/assign` | No | **410 Gone** | No | No |

## Ownership rules

### Store owner

For every dispatch-board query, offer creation, or pickup verification:

```text
DeliveryJob.order.store.ownerId must equal authenticated user id.
```

A store owner cannot operate on another store even if they know its order or delivery-job identifier.

### Rider

For active delivery transitions:

```text
DeliveryJob.currentRiderId must equal authenticated rider profile id.
```

For assignment acceptance/rejection:

```text
DispatchAssignment.riderProfileId must equal authenticated rider profile id.
```

A rider cannot accept an offer intended for another rider.

### Customer

Customer permissions remain on `Order`, not `DeliveryJob`. Customer tracking must continue checking:

```text
Order.customerId equals authenticated user id.
```

## Data exposure rules

### Before offer acceptance

The rider offer may show:

- store name and location
- customer delivery area
- parcel items/count
- payment method and order value

It should avoid unnecessary customer personal details before acceptance. Phase 0 retains some legacy order fields for compatibility; later API hardening should introduce a dedicated redacted offer DTO.

### After acceptance

The assigned rider may receive the customer delivery address and phone required to perform the delivery.

### Rider queue

`GET /orders/rider/queue` is retained only as a compatibility endpoint. It returns:

- the authenticated rider's active delivery
- unexpired offers addressed to the authenticated rider

It never returns general `CONFIRMED`, `PICKING`, or unoffered `PACKED` orders.

## Explicit denial cases

The API must reject:

- customer attempting any dispatch action
- rider accepting another rider's offer
- rider starting a job they did not accept
- rider verifying pickup
- store owner verifying pickup for another store
- store owner moving a rider through travel/customer states
- rider changing an order through generic status mutation
- offer creation for a non-packed job
- offer creation for an offline/busy rider
- second active delivery for the same rider
- second open offer for the same delivery job
- any invalid state transition, including admin requests

## Audit requirements

Each successful operational mutation records:

- delivery job id
- assignment id when relevant
- actor user id
- actor role
- previous delivery status
- next delivery status
- timestamp
- structured metadata/reason

Legacy `OrderStatusHistory` is also written during Phase 0 compatibility. `DeliveryEvent` is the canonical delivery audit stream.

## Future permissions

Later phases should add explicit capabilities rather than broad roles:

```text
delivery.dispatch.view
delivery.offer.create
delivery.offer.cancel
delivery.reassign
delivery.pickup.verify
delivery.exception.manage
delivery.return.confirm
delivery.force_complete
```

This will allow dispatcher, support, supervisor, and store-staff subroles without granting full `ADMIN` access.
