# PSU-like: a small test project

Laid out like the bench PSU's README, with things wrong on purpose (W22 isn't on the drawing, the buck
picture isn't in the folder, and no step mentions W18).

![Front](images/front.png)

## Printed parts

| File | Qty |
|---|---|
| `case.stl` | 1 |

## Wiring (see `wiring.svg`: the W numbers are its wire numbers)

1. **Mains:** one wire → fuse (W1, W2) → switch pole 1 → transformer (W3). Heat-shrink every mains joint.
   Route the switch wires along the left wall, tied down.
2. **Transformer → board:** the two leads → the little board → the board's **AC24V** terminal.
   With the board unplugged, set your meter to beep.
3. **Output:** board **OUT +** → red post (W9).
4. **Meter (the trap):**
   - **thin black** → board **OUT −** as well, *not* ground.
   - otherwise the current limit stops working.
5. **Fan:** buck → fan (W17, W22). **Set the buck to 12.0 V before connecting anything.**

   ![The buck](images/buck.png)

> **Can the fan go on the FAN header?** No: go through the buck.

## Assembly order

1. **Inserts** into the body.
2. **Low-voltage wiring** as above.

## First power-up

1. Unplugged, meter on beep: mains to anything low-voltage is **open**.
2. Power up with no load.

## Safety

This box has 230 V inside it. Never work on it plugged in. <script>alert(1)</script>

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Completely dead | Fuse; switch wiring |
| Current limit doesn't work | Meter thin black on ground |
