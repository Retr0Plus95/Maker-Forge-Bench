# Bench 0.4 "Your board" — design

Date: 2026-11-13. Asked for by the owner while building the fume extractor on their own placement
(a 7×9 cm electrokit board that differs from sheet 4): "how would the app help in this situation,
build those features" and then "build all plus 30 suggested improvements".

## Why

Building on your own board, three questions came up that Bench couldn't answer, so they were
worked out by hand from photos:

1. **What's still to wire?** The chip's power pins (7, 8, 20, 22) had no wires, so the chip would have
   had no power. Bench knew every connection but had no way to tick them off.
2. **Which pin is which, especially underneath?** Turned over, the chip's two rows swap sides.
3. **Where does a part go on *my* board?** Sheet 4's hole numbers don't match a board you laid out
   yourself.

## The three features

### F1 What to wire

- **Where:** a panel section under Build steps.
- **What it lists:** every connection in the project's netlist (`board.nets`), one group per line
  (net). The group heading is the net's label and a count: "+5 V — 3 of 14 wired". Power lines
  come first (labels like `+12 V`, `+5 V`, then `0 V`), then the rest A–Z. Nets with one member need
  no wire and aren't listed.
- **Ticking:** each member is a tick box, for example "U2 pin 7". Ticked means that leg is soldered
  to that line. The key is `REF:PIN`; a pin is on one net only.
- **Saved like the part ticks:** the ticks are undoable and saved with the progress. Progress files
  gain an optional `wired` list (older files read as empty).
- **Filter:** "Only not wired" hides what's done.
- **Copy:** "Copy as text" copies the list.
- **The part card:** each connection line gets its own "wired" tick, and "Still to wire: pin 2".
- **Showing a line:** a group's "Show" button rings every part on that line on the drawing.
- **Any layout:** connections don't depend on where parts sit, so this works for any board.

### F2 Chip pin view

- **Where:** on the card of any board part with three or more pins, through a "Show pins" button.
- **The drawing:** made with `createElementNS`, no markup strings.
  - **DIP:** two rows with the notch at the top. Pins are numbered counter-clockwise seen from the
    top: 1 at top left, down to N/2, then up the right side to N.
  - **Header:** one row.
- **Each pin shows:** its number, its line's label (`+5 V`, `0 V`, `TACHA`) and a colour: supply,
  0 V or signal. A filled dot means wired (F1); a hollow one means not yet.
- **Top / Underneath switch:** Underneath mirrors the drawing left to right, the way the rows swap
  when you turn the board over. The choice is remembered.
- **Clicking a pin:** shows what that pin connects to, with its wired tick.

### F3 Your board, from your photos

Photos of your own board are images in the project folder, so Bench already shows them as sheets.
On any image sheet, "My board" opens the "Your board" panel section:

1. **This photo shows:** Top or Underneath.
2. **Line it up.**
   - Tap the *anchor part's* first pin, then the far pin of the same row. The anchor is the
     project's board part with the most pins: the ATmega328P, pins 1 and 14.
   - The anchor's shape is known from the project's board data, so two taps fix the scale, the
     turn, and the mirror (Top or Underneath). Bench then knows where every hole is on that
     photo.
3. **Every anchor pin is labelled on the photo** with its number and line, coloured wired or not
   wired, the same as F1.
4. **Placing a part:** its card gets "Place on my board". Tap each pin's hole in order. Taps snap
   to the nearest hole, Esc stops, and each placement can be undone. Placed parts are drawn on
   every lined-up photo: the selected part ringed, the open step's parts highlighted.
5. **The card says:** "On your board: placed (see your photos)", with "Show on photo".

**The maths** is in `myboard.js`, which is pure and unit-tested:

- **The board frame:** the project's own hole coordinates, anchored on the anchor part, so the
  anchor's pins sit where `board.parts` puts them.
- **Each photo:** has a similarity transform from that frame to its pixels, worked out from the two
  taps: pixel = P_A + z·(f − f_A) in complex form. An underside photo mirrors f's column first.
- **A tap:** goes through the inverse transform and rounds to the nearest whole hole.

**Stored:** per project in the browser, and in progress files as an optional `myBoard` object:
`{ anchor, photos: { sheetId: { side, a: {pin, x, y}, b: {pin, x, y} } }, placed: { ref: { pin: [c, r] } } }`.
Everything is checked on read, like every other progress field.

**The overlay:** an SVG layer the viewer puts over the image, the same size as the photo, so it zooms
and pans with it. It ignores the pointer. The viewer also reports taps (a click that isn't a drag)
in image pixels.

**The photos stay on the computer:** they're files in your own folder, served only to your own
browser by `dev.py`.

## The 30 improvements

### Wiring and connections

1. Find knows line names: "+5 V", "0 V", "TACHA" open that line in What to wire and ring its parts.
2. A line's "Show" button in What to wire rings every part on it.
3. The part card has a "wired" tick on each pin's line.
4. The part card says "Still to wire: pin 2".
5. "Copy as text" for the wiring list.
6. Printing the page gives a clean wiring list and checklist (print stylesheet).

### Parts and the checklist

7. Checklist "Only not soldered" switch.
8. "Way round matters" badge for polarised parts, on the card and in the checklist.
9. Find knows values: "100 nF", "10k" list the parts with that value.
10. Your own note on each part (saved, undoable, in the progress file): "used a 4.7k here".
11. "Next part in this step" on the card.
12. Clicking a part's name in the checklist opens its card.

### Steps

13. Overall progress at the top of Build steps: "4 of 10 steps done".
14. A ✓ on every finished step in the list.
15. "Show in 3D" on the open step.

### 3D board

16. The selected part's holes light up.
17. The selected part lifts a little and its label grows.
18. "Wiring underneath" on/off.
19. Double-click a part to turn the camera to it; "Reset view".
20. Keys: T top, U underside, B turns the 3D board on and off (the number keys pick sheets).
21. Each insulated link is one mesh (faster on big boards).
22. The camera is remembered per project.

### Moving around

23. "?" opens a list of every keyboard shortcut.
24. Number keys 1–9 pick sheets.
25. The zoom level shows on the stage; click it to fit.
26. The last sheet you looked at is remembered per project.
27. The status says "Updated 14:02" when the project file or a sheet refreshes.
28. "Brighter" for dark photos.

### Robustness and checks

29. An unexpected error reading forge-project.json says what went wrong, not "server down".
30. **Before power:** meter checks from the project's own supply lines, which you can tick:
    - a beep test from each supply to 0 V (it must not beep);
    - each supply measured with the chip out.

## Out of scope (later)

- Dragging parts in 3D and the JS port of pcb.py's checks: now 0.5 "Make it yours".
- Suggested wire routes with options.
- Naming holes by the board's printed labels.
- A file picker for photos when Bench is hosted (0.6 "Everywhere").
- Pin function names (PD2, AVCC) from a parts library.
