# Customer subscription order-detail manual E2E

Starting main SHA: `cb9e874ae69aab03290454e06be157647f5b3ead`

1. Use a FULL_PLAN subscription priced at ₹849 with 30 deliveries.
2. Generate the first subscription order while full-plan cash collection is still due.
3. Open Customer Android > Orders > the generated subscription order.
4. Hero must show `Cash due ₹849`, never ₹28.30.
5. Items must show the delivery item as included in the subscription and must not present ₹28.30 as another customer charge.
6. Bill Summary must show `Cash due ₹849` and explain that this is the subscription funding event.
7. Payment section must repeat the same authoritative due amount.
8. After the first funding is collected, open a later generated subscription delivery: it must show `Funded delivery ₹0` and state that no cash should be collected.
9. Open a normal buy-once order and confirm its ordinary grand total/item prices are unchanged.
10. Final physical-device acceptance must use the stable Customer APK built from the accepted post-merge main SHA.
