# Store Mobile — Complete Feature Checklist (every finding)

Every store capability, enumerated. Legend for mobile status:

- **✅** present on mobile
- **📦** present in mobile *source* but STALE (not in the installed APK `android-1421-b8feae6`)
- **🟢** shipped on this branch (milk-grid console)
- **🟡** partial (reduced vs web)
- **❌** missing — API already exists (only mobile UI needed)
- **⚙️** missing — needs new/changed backend
- **👻** orphaned/unreachable screen on mobile
- **⬜** not applicable (desktop-only / intentionally different)

---

## 1. Milk grid — the CELL ON-CLICK sheet (3 tabs)  ← the core

### 1.1 Quick status tab
1. Status pill (Delivered / Skipped / Scheduled) — 🟢
2. Shift pill (AM / PM) — 🟢
3. Customer name + address + plan + base quantity header — 🟢
4. "Marked as Delivered" / "Scheduled for Delivery" state text — 🟢
5. Base quantity + extra display — 🟢
6. **Mark Delivered ✓** (`TOGGLE_DELIVERED`) — 🟢
7. **Undo Delivery** (revert to Scheduled) — 🟢
8. **Shift to PM Shift / AM Shift** (`TOGGLE_SLOT`) — 🟢
9. **Mark Skipped (Not Taken)** (`SKIP`) — 🟢
10. Pre-assigned Default Rider display — 🟢
11. Assigned Rider + **Reassign** (opens dispatch pre-selected on that stop) — ❌
12. **Set {name} as permanent default rider** link per cell — ❌
13. **Delegate Stop to Rider** select (rider list + "Set as permanent default rider" checkbox) — ❌
14. **Temporary Substitute Rider**: rider select + `From Date` + `To Date` + "Also re-dispatch existing deliveries" + **Set Temporary Rider** — ❌
15. Photo proof block: "Proof of Delivery Captured", GPS lat/lng, accuracy, **View Proof** — 🟢 (View Proof present)
16. Ledger snapshot: **Paid in Month** / **Current Outstanding Due** — 🟢
17. Empty state "No scheduled delivery record for this date." — 🟢
18. Footer hint "Press Esc or click outside" + **Close** — 🟢

### 1.2 Extra / Shift add-on tab
19. Unit mode tabs: **Grams/Kg**, **Bowls/Pk**, **Liters/ml**, **Custom** — 🟢
20. **Catalog Product** select with `<optgroup> Store Products</optgroup>` + `Custom Product / Manual Rate` — 🟡 (presets/custom only; no catalog picker)
21. Product Name (custom) — 🟢
22. Unit Price (₹) (custom) — 🟢
23. Custom Portion / Qty Label + Price Multiplier — 🟡
24. Portion Weight presets (weight: 250g…5kg; count: bowls; volume: 0.25L…3L) — 🟢 (subset)
25. **Consecutive Days** select (1…30) — 🟢
26. **Shift Target** (PM Evening / AM Morning) — 🟢
27. Live calc: "Adding {label}", ₹/day, total — 🟡
28. **Attach {n} Days {slot} Delivery** (`ATTACH_EVENING_MILK`) — 🟢
29. **Add as Single Day Extra Today Only** (`EXTRA_MILK`) — 🟢

### 1.3 Payment & Renew tab
30. Due badge (₹ outstanding) — 🟢
31. **Record Subscriber Payment** header + "Current Due" — 🟢
32. Presets **Full Due / ₹80 / ₹160 / ₹500 / ₹1,000** — 🟢 (₹80–₹1,000 subset)
33. **Amount ₹** input — 🟢
34. Mode select **Cash in Hand / PhonePe / UPI** — 🟢
35. **Save** (`RECORD_PAYMENT`) — 🟢
36. **Void Recorded Payment** + "Void this day's payment" (`VOID_PAYMENT`) — 🟢
37. **Renew 30 Days** (`POST …/subscribers/:id/renew`) — 🟢

---

## 2. Milk grid — toolbar / view / filters

38. View switcher **Today's Route (cards)** / **31-Day Matrix** — ❌ (matrix only)
39. Previous / Next month — 🟢
40. **Today ({n})** slide-to-today jump — ❌
41. **Dispatch to Rider** button — ✅ (auto-dispatch only)
42. **Pack Summary** modal (Buffalo/Cow/Total litres + route stops + completed) — 🟢
43. **Export Sheets** → CSV download — 🟢 (share sheet)
44. **Fullscreen / Exit Fullscreen** toggle — ⬜
45. **Refresh Grid** — 🟢 (pull-to-refresh)
46. Search "customer, phone, locality…" + clear — 🟢
47. Slot filter **All / AM / PM** — 🟢
48. **Filter Dues / ⚠️ Only Dues** toggle — 🟢
49. Customer channel **All / 🌐 Online / 🏪 Offline** — 🟢
50. Cards-view sort **Pending First** / **# Sequence** — ❌
51. **Hide Done ({n}) / Show Done** — ❌

### 2.1 Cards view ("Today's Route Checklist")
52. Header "Today's Route Checklist", day label — ❌
53. KPI tiles **Completed / Packed / Sold / Left** + progress bar — ❌
54. Sections "Upcoming Deliveries ({n} Stops Remaining)", "All Deliveries Completed for Today!", "Delivered Today ({n})" — ❌
55. Per card: **Mark Delivered**, **Undo**, **+ Extra / Pay**, **Share2 (bill)**, **Proof** — 🟡 (matrix cell sheet covers these)

### 2.2 Matrix view columns / badges
56. Columns `#`, `Customer`, `Plan & Slot`, days 1..N, `Total L`, `Paid`, `Due`, `Bill` — 🟡 (name/slot/due; Bill button present; Total L per row not a column)
57. Footer Σ row "Daily Total Liters" — ❌
58. Cell badges: delivered qty, `Skip`, extra milk, payment `₹`/`Due`, rider `Truck name`, `Proof` — 🟡 (status glyph + litres; rider/payment badges not in cell)
59. Row bill button (`Share2`, "Generate Monthly Bill Statement") — 🟢
60. Row default-rider display (title "Pre-assigned default rider") — 🟡
61. Row ON/OFF type badge (online/offline) — ❌

---

## 3. Milk grid — bulk dispatch modal (web) vs mobile

62. **Target Delivery Date** single (Today / Tomorrow / day select) — ❌
63. **Date Range** mode (`From (Day)` / `To (Day)`) — ❌
64. **Auto-Dispatch (⚡ {n})** for pre-assigned default riders — ✅
65. Rider selector (name · phone · active runs) — ❌
66. **Shift Filter** All Slots / AM / PM — ❌
67. **Customer Channel** All / Online / Offline — ❌
68. Per-stop checkboxes + **Select All** + **Clear** — ❌
69. Summary "Selected: {n} stops", "Estimated Volume", "Expected Cash" — ❌
70. **Save as temporary substitute rider for this date range** — ❌
71. **Save as permanent default rider for selected customers** — ❌
72. **Dispatch {n} Stops** (`POST …/dispatch-to-rider`) — ❌

---

## 4. Milk grid — other modals

73. **Monthly Bill Statement** modal (Customer, Plan, Deliveries, Extra Milk, Total Paid, Balance Due, WhatsApp preview, Copy Text, Send on WhatsApp) — 🟢
74. **Proof of Delivery** viewer (photo, Captured At, GPS + Maps link, Accuracy, Cash Collected) — 🟢 (no Maps link)
75. Dispatch summary / morning packing sheet (BM/CM/Total tiles, stop list) — 🟢

---

## 5. Subscriptions hub — tabs

76. Tab **Milk Grid (Sheet View)** — 🟢
77. Tab **Subscribers** — ✅ (read-only)
78. Tab **Rider Assignments** — ✅
79. Tab **Prep list** — ✅ (D-1 modal)
80. Tab **Demand** (forecast) — ✅
81. Tab **Plans** — ✅ (read-only)
82. Tab **Calendar** — ❌
83. Tab **Runs** — ✅
84. Tab **Cash** — ✅
85. Tab **Exceptions** — ✅
86. Tab **Analytics** — ❌
87. Header buttons **Refresh / Rider Assignments / Prep list / Deliver at store** — 🟡
88. KPI tiles **Subscribers / Active plans / Routes today / Cash to count** — 🟡

---

## 6. Subscribers list

89. Columns Customer / Phone / Plan / Store / Delivery / Status / Progress / Collected-due / Actions — 🟡 (name/plan/status/due/funded only)
90. Source filter **All / Online / Offline** — ❌
91. Status filter **All / Active / Paused / Cancelled** — ✅ (segments)
92. **Add Offline Customer** button — ✅
93. **Recycle Bin** quick link — 📦 (via offline directory)
94. Row **Track** (history) — ❌
95. Row **Manage / Switch** — ❌
96. Row **Cancel** — ❌
97. "Cancelled" on-demand load — 🟡

---

## 7. Manage-subscriber modal (web) — MISSING on mobile in full

98. Profile banner (name/phone/plan/Progress/Collected/Due/status) — ❌
99. **Change / Renew Plan** tab:
100. Renewal option cards **Same Plan / Switch Plan / Split AM/PM** — ❌
101. **Choose New Plan** select — ❌
102. Split AM/PM custom setup (AM/PM product + qty selectors) — ❌
103. Delivery frequency **Daily / Alternate Days / Weekdays Only** — ❌
104. **Planned Vacation**: Vacation From / Vacation To — ❌
105. Vacation policy **EXTEND_PLAN / DEDUCT_BILL** — ❌
106. **Cycle Start Date**, **Total Deliveries** — ❌
107. Past cycle dues display — ❌
108. **Initial Payment Collected Now** (₹) — ❌
109. **Payment Mode** Cash / PhonePe / Post-Paid — ❌
110. **Renewal Note** — ❌
111. Confirm → `POST …/renew` — ❌
112. **Delivery Slot** tab (AM/PM, "apply to remaining") → `PATCH …/manual-edit` — ❌
113. **Split AM/PM** tab — ❌
114. **Cash Flow** tab: ledger (Total Collected / Balance Due) — ❌
115. **Record Customer Payment** (Amount ₹, mode, note) → `…/record-payment` — ❌
116. **Edit Balances** tab (Amount Due ₹, Amount Collected ₹, Note) → `PATCH …/manual-edit` — ❌
117. **Cancel Subscription** block + reason modal — ❌
118. Danger zone: **Move to Recycle Bin** / **Delete Forever** (offline) — 📦 (in directory, not from record)
119. Online-account non-deletable notice — ❌

---

## 8. Plans

120. Plan cards (price, MRP, deliveries, frequency, funding, skip, items, status) — ✅
121. **Show {n} more / Show less** expand — ❌
122. Plan create/edit/delete — ⚙️ (web also read-only)

---

## 9. Rider assignments

123. Date nav (Today / Tomorrow) — ✅
124. Slot filter All slots / AM / PM — ❌
125. Summary cards Stops today / Assigned / Unassigned / Cash to collect — 🟡
126. Unassigned warning banner — ✅
127. Per-rider cards (vehicle, status, runs, stops) — ✅
128. Unassigned multi-select + **Select all** + dispatch — ✅

---

## 10. Orders

129. Status tabs (New/Preparing/Ready/Pickup/Delivered/Issues) — ✅
130. Store switcher chips — ✅
131. Search (order/customer/phone/email) — ✅
132. Order type filter **All / Subscription / One-time** — ❌
133. Sort **Work order / Newest first / Scheduled first** — ❌
134. Day sections **Needs action now / Scheduled today / tomorrow / later / Unscheduled** — ❌
135. KPI group filters Needs action / In progress / With rider / Done / Cancelled — 🟡
136. **Clear {n} filters** control — ❌
137. Pagination Previous/Next — ✅
138. Order card (id, status, customer, items preview, total, payment pill) — ✅
139. Order detail: picking list items — ✅
140. **Unavailable** item — ✅
141. **Substitutes** + apply replacement — ✅
142. Status actions Accept/Reject/Start preparing/Ready/Deliver with store staff/Mark delivered — ✅
143. Store-delivery start/complete — ✅
144. Order tracking link (`/orders/:id/tracking`) — ❌

---

## 11. Deliveries (store self-delivery)

145. Screen reachable — 👻 (orphaned; needs wiring)
146. Date rail (today + 13) — ❌
147. Status KPIs All/Pending/Out for delivery/Delivered/Failed — ❌
148. Search "customer, phone or sequence" — ❌
149. Slot filter All slots / Morning / Evening — ❌
150. **Start delivery** — ❌
151. **Complete & collect cash** modal (name, phone, cash ₹, notes) — ❌
152. **Mark failed** modal (reason) — ❌
153. **Edit delivery record** modal (status, cash, failure reason/notes) — ❌
154. Cash summary To collect / Recorded — ❌

---

## 12. Pickup proof / verification

155. Pickup alerts tabs Waiting / En Route / Other — ✅
156. Pickup verification: rider card, call, order info — ✅
157. Packed items checklist + readiness — ✅
158. **Generate Rider PIN** + regenerate — ✅
159. **Confirm Handoff** → success receipt — ✅
160. **Issue QR** (`QR_CODE` challenge) — ❌
161. Explicit **Parcel count** input — 🟡

---

## 13. Inventory

162. My products (price, stock steppers, save) — ✅
163. Listed/Hidden toggle — ✅
164. Auto-hide toggle — ✅
165. Add products (catalogue search, opening stock, price, add) — ✅
166. Load more (pagination) — ✅
167. Stats My products / To add / Low stock — ✅
168. Product delete/delist from store — ⚙️ (no backend)

---

## 14. Settings

169. Store profile edit (name/address/phone) — ✅ (mobile ahead of web)
170. Location coordinates display — ✅
171. Store snapshot (orders/revenue) — ✅
172. **Operating Hours** editor (weekly schedule, open/closed, Add window, Remove) — ❌
173. **Timezone** select — ❌
174. Open/closed status summary ("Open now", "Closed · Opens …") — ❌
175. **Recycle Bin** tab entry — 📦

---

## 15. Notifications

176. Inbox (All / Unread / Updates, mark read) — ✅
177. Stats Unread / Last 24h / Push / Push pref — 🟡
178. **Enable device push** — ❌
179. Global **Device push** toggle — ❌
180. Global **In-app inbox** toggle — ❌
181. Per-event push/in-app toggles (18 events) — ❌
182. Deep-link on notification open — 🟡

---

## 16. Offline customers

183. Create offline customer — ✅
184. List + search — ✅
185. **Move to Recycle Bin** (delete) — 📦
186. **Recycle Bin** toggle (Bin {n}) — 📦
187. **Restore** — 📦
188. **Delete Forever** (purge) — 📦
189. Customer **detail view** (stats, address, subscriptions) — ❌
190. **Delivery tracker** per subscription (per-day table + filters) — ❌
191. Create with **map + GPS** picker + reverse geocode — 🟡
192. Pagination Previous/Next — ❌
193. **Edit** an offline customer — ⚙️ (no backend)

---

## 17. Dashboard

194. Revenue hero + sparkline — ✅
195. Stat cards Orders/Revenue/Stores/Products — ✅
196. Store search — ✅
197. Store list (name, address, status) — ✅
198. **Low-stock** indicator — ❌
199. Per-store product/order counts on card — 🟡
200. Notifications bell — ✅
201. Subscription-runs entry card — ✅

---

## 18. Store-reachable endpoints mobile does NOT use (all ❌ API-ready)

202. `GET /store/subscriptions/grid/export-csv` — now 🟢
203. `GET /store/subscriptions/calendar` — ❌
204. `GET /store/subscriptions/analytics` — ❌
205. `GET /store/subscriptions/dispatch-summary` — now 🟢
206. `GET /store/subscriptions/customer/:id/statement` — now 🟢
207. `GET /store/subscriptions/subscribers/:id/history` — ❌
208. `GET /store/subscriptions/subscribers/:id/audit` — ❌
209. `POST /store/subscriptions/deliveries/:id/quick-action` — now 🟢
210. `POST /store/subscriptions/subscribers/:id/renew` — 🟢 (30-day)
211. `POST /store/subscriptions/subscribers/:id/cancel` — ❌
212. `POST /store/subscriptions/subscribers/:id/record-payment` — 🟢 (grid cell)
213. `PATCH /store/subscriptions/subscribers/:id/manual-edit` — ❌
214. `POST /store/subscriptions/custom-subscribe` — ❌
215. `POST /store/subscription-operations/runs/:runId/stops/:stopId/return` — ❌
216. `GET/POST /store-self-delivery/{queue,start,complete,fail,update}` — ❌
217. `GET/PUT /store-owner/stores/:id/operating-hours` — ❌
218. `GET/PATCH /notifications/preferences` — ❌
219. `POST/GET/DELETE /notifications/push/subscriptions` — ❌
220. `GET /upload/evidence-url` — now 🟢
221. `GET /stores/:id/orders` — ❌
222. `GET /orders/:id/tracking` — ❌

---

## 19. Backend gaps (not on web either)

223. Store-side subscription **pause / resume** — ⚙️
224. **Delete/delist product** from assortment — ⚙️
225. **Edit offline customer** — ⚙️
226. **Import (CSV)** customers/products — ⚙️
227. **Print** — ⚙️
228. **Promotions / coupons** (store scope) — ⚙️
229. **Invoices** entity — ⚙️
230. **Staff / users / roles** management — ⚙️
231. Store **delete/restore** (store-owner scope) — ⚙️

---

## 20. Orphaned mobile screens (exist, unreachable)

232. `StoreSelfDeliveryScreen.tsx` — 👻
233. `StoreOrderDetailsReferenceScreen.tsx` — 👻
234. `StoreOperationsRouteScreen.tsx` — 👻

---

## Counts

- Items catalogued: **234**
- Shipped on this branch (🟢): milk-grid console incl. cell sheet, filters,
  statement, pack summary, proof, CSV export.
- API-ready missing (❌): the bulk of sections 1–16.
- Backend-needed (⚙️): section 19.
