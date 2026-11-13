---
id: SCHED-4515
title: Ack moves from the row to an incident panel
status: done
plan: R1, R2
---

Found in the step-1 recording at 00:22: the pointer was on Ack for INC-1980, a new incident landed on top and
pushed the rows down, and the click acked INC-6356. Product decided: new incidents stay live at the top; Ack
leaves the row; a row opens its incident panel, and Ack lives there.

- Rows have no Ack button (`data-testid="ack"` is gone).
- Click / Enter / Space on a row opens `data-testid="incident-panel"`, which names the incident id.
- `data-testid="panel-ack"` acks the incident the panel names; the row then shows `data-testid="acked"`.
- The panel is fixed on screen: list inserts never move it. Escape or × closes it.

Acceptance: aim at a row, let a new incident land, click: the panel names whatever row was clicked; on-call
reads the id before Ack, and Ack acks exactly that incident.
