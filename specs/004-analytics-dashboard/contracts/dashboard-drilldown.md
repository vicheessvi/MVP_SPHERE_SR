# Contract: Dashboard drill-down

Dashboard action contains:

- `route`: `vcs | controllers | panels | upload`
- optional inventory filters: `pollStatus`, `ping`, `vip`, `changed`, `support`, `manufacturer`, `model`, `locationId`

## Rules

- A single-category KPI opens that module and applies filters immediately.
- A global KPI may render one action per category instead of creating a combined page.
- Inventory filter form retains applied drill-down values and supports clear/reset.
- Device/problem/change rows may open the existing device detail through `data-view-inventory` after setting the correct category route.
- Upload and polling-plan actions navigate to the existing Upload flow; Dashboard does not duplicate import or execution logic.
