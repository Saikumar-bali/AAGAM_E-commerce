# Regional Multi-Rider Route Splitting

## Purpose

Subscription delivery occurrences are planned into operationally feasible delivery runs using authoritative delivery latitude and longitude. The planner does not assign all deliveries to the first rider and does not force a numeric 50/50 split. It preserves geographic cohesion, delivery windows, pickup-store ownership, vehicle requirements, capacity, distance, duration and rider-specific cash responsibility.

## Authoritative chain

```text
CustomerAddress latitude/longitude
  -> DeliveryZone resolution
  -> CustomerSubscription / SubscriptionDelivery / Order zone snapshot
  -> hard-constraint planning group
  -> deterministic geographic cluster
  -> DeliveryRun
  -> DeliveryRunStop
  -> eligible RiderProfile
  -> existing DeliveryJob, proof and COD ledger
```

Normal checkout dispatch remains unchanged. Only generated subscription occurrences with no current run stop enter the regional planner.

## Geographic delivery zones

A zone supports:

- unique code and name;
- polygon boundary;
- optional centre and fallback radius;
- active status and priority;
- eligible stores and preferred riders;
- delivery slots;
- daily subscription capacity;
- maximum stops, parcels, route distance and duration;
- optional weight capacity;
- vehicle types;
- rider cash-risk limit;
- slot-end buffer;
- neighbouring-zone identifiers.

Resolution order:

1. active polygon containment;
2. configured fallback radius;
3. explicit unresolved exception.

The system does not resolve routes from locality text or pincode. The selected zone is persisted on the current address, subscription, occurrence, generated order snapshot, run and stop. Existing order snapshots are not rewritten when a zone changes later.

## Planning and splitting

The planner first groups by hard compatibility:

- service date;
- pickup store;
- delivery slot;
- geographic zone;
- handling requirement;
- vehicle requirement;
- cash-funded or cash-collection requirement.

Within each group, deterministic nearest-neighbour ordering is applied. A cluster is divided whenever adding a stop would exceed any configured limit:

- stops;
- parcel count;
- expected cash;
- route distance;
- estimated duration.

Default policy values are stored on each zone rather than repeated as constants throughout services. Route metadata records the algorithm version, planned time, original stop count, cluster identifier, distance, duration, manual override and assignment reasoning.

Planner retries use an advisory transaction lock, unique delivery-run ownership and deterministic cluster identifiers. A subscription delivery can have only one run stop.

## Rider eligibility and assignment

A rider is considered only when:

- the user and rider account are active and approved;
- rider status is ONLINE;
- an approved, unexpired document exists;
- a covering shift exists unless the deployment explicitly disables that rule;
- the rider is not on an active break;
- no overlapping active run exists;
- the current vehicle is allowed by the zone;
- parcel capacity covers the route;
- current cash plus route cash stays within both rider and zone limits;
- no unresolved cash variance exists;
- the rider is within the configured pickup-distance limit.

Eligible riders are scored deterministically using pickup distance, preferred/home-zone affinity and current cash exposure. Assignment reasoning and the score-policy version are persisted. Internal scoring details are not returned to customer surfaces.

When no rider is eligible, the route becomes `RIDER_NEEDED`. It is never silently added to an already loaded rider.

## Admin route operations

The Admin Route Planning workspace provides:

- zone readiness cards;
- map and list view for zones, stores, riders and stops;
- planned route cards with distance, duration and cash;
- unassigned generated deliveries;
- event history;
- automatic or selected-stop split preview;
- maximum-stop and time-capacity split;
- compatible route merge;
- pending stop move;
- rider reassignment;
- pending-stop reorder;
- unstarted run cancellation and release;
- active run interruption and recovery creation.

Every mutation requires a reason, checks optimistic versions, runs in a serializable transaction, uses advisory locks where ownership changes, creates an immutable audit entry and emits a deduplicated route event.

The server rejects:

- delivered, arrived or returned stop movement;
- movement of a stop with collected COD cash;
- incompatible date/store/slot/zone merge or move;
- capacity- or cash-breaking merge/move;
- stale run or stop versions;
- duplicate recovery runs;
- cancellation after packing, handoff, pickup or route start.

## Mid-route recovery

When a route is interrupted:

1. delivered stops remain on the original run and rider;
2. proofs and COD entries remain untouched;
3. only unresolved stops move to a recovery run;
4. the recovery run receives independent assignment and cash totals;
5. a requested recovery rider must pass the same eligibility policy;
6. the original route becomes `INTERRUPTED`;
7. deduplicated interruption and recovery events are recorded.

Cash from the original rider and the recovery rider is never combined. Deposit batches remain linked to one route and one rider's individual COD ledgers.

## Store and Rider experience

Store preparation is route-specific and shows region, route code, rider, stop count, bag count, estimated distance/duration, product totals and expected cash. Packing, crate labels and handoff remain separate for every run.

Riders see only runs assigned to their rider profile. Each route identifies its region, pickup store, slot, stops, estimated distance/duration, expected cash and progress. Stop completion remains individual; there is no bulk delivery action.

Customers continue to receive simple delivery and reassignment messages. They are not shown rider scoring, cash limits or internal balancing details.

## Event types

- `DELIVERY_REGION_RESOLVED`
- `ROUTE_CLUSTER_CREATED`
- `DELIVERY_RUN_SPLIT`
- `DELIVERY_RUN_MERGED`
- `DELIVERY_RUN_ASSIGNED`
- `DELIVERY_RUN_REASSIGNED`
- `DELIVERY_RUN_CAPACITY_WARNING`
- `DELIVERY_RUN_CASH_LIMIT_WARNING`
- `DELIVERY_RUN_INTERRUPTED`
- `RECOVERY_RUN_CREATED`
- `RUN_STOP_MOVED`
- `RUN_STOP_REORDERED`
- `DELIVERY_RUN_CANCELLED`

Admin, Store and Rider clients poll the idempotent event feed and safely refresh their authoritative route view.

## Manual validation

1. Create PM Palem and Madhurawada polygon zones with respective stores and preferred riders.
2. Generate 10 subscription deliveries inside each polygon for the same date and slot.
3. Run the regional planner.
4. Confirm two independent routes and no duplicate stop.
5. Confirm each rider receives only their regional route.
6. Confirm Store preparation shows two route-specific bag lists.
7. Complete cash deliveries and verify rider-specific deposit batches.
8. Preview a 6/4 split and confirm updated distance, duration and cash before applying.
9. Attempt to move a delivered stop and confirm rejection.
10. Interrupt a partially completed route and confirm only pending stops move to recovery.
11. Submit a stale route version and confirm a conflict response.
12. Place a normal non-subscription order and confirm existing one-order dispatch still operates.
