# Blueprint building blocks

Everything a generated app can show or do. The generator (packages/ai/src/prompts.ts) and the
player (packages/player) use the same list; the validator rejects anything else.
`packages/blueprint/src/examples/runclub.ts` uses every block.

| Group | Block | What it is |
|---|---|---|
| Display | `hero` | Big colored header, optional avatars + line |
| | `section`, `text` | Small heading; text in 3 sizes and 4 tones |
| | `card` | Callout with icon and tone, optionally conditional |
| | `stats` | 1–4 number tiles |
| | `progress` | Bar or ring, 0–1 |
| | `chart` | Bar or line chart over a collection or the people |
| | `calendar` | Week strip or month grid with dots per record |
| | `illustration` | Large emoji with caption |
| | `divider` | Line |
| | `timer` | Countdown with start / pause / reset, optional action when done |
| Data | `list` | Records as list or grid, with icon, badge, tick box, button, tap → detail screen |
| | `people` | People cards, optionally ranked (leaderboard) with badge |
| Inputs | `search`, `segmented`, `toggle` | Screen state (`ui.<name>`) for filtering |
| | `field` | Edits one field of the record on a detail screen |
| Actions | `buttons` | 1–3 buttons (primary / secondary / danger) |
| | `addButton` | Floating + button |

Field editors (forms and `field` blocks): text, long text, number stepper, slider, star rating,
switch, date picker, choice (segmented), person picker.

Screens: `tab` (in the tab bar, up to 5) and `detail` (one record, opened from a list, with a back button).

Action steps: `update`, `create`, `remove`, `navigate`, `notify`, `toast`, `back`; actions can ask
for a form first and for confirmation (`confirm`).

Not available on purpose (docs/SECURITY.md): web views, images or video from the internet,
maps / location, camera and uploads, payments, chat with strangers, custom code.
