import { z } from 'zod';

/**
 * The App Blueprint: everything a generated app is, as data.
 *
 * Safety by construction: there is no block, field type or action here that runs code,
 * calls arbitrary URLs, collects passwords/cards/ID documents, or tracks people in the
 * background. If it is not in this schema, a generated app cannot do it.
 */

export const BLUEPRINT_VERSION = 1;

const id = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]{0,39}$/, 'Use a short camelCase id starting with a letter');
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a 6-digit hex color like #1F7A4D');
/** An expression in the blueprint expression language. */
const expr = z.string().min(1).max(600);
/** Text with {{expression}} holes. */
const template = z.string().max(600);

export const ICONS = [
  'sprout',
  'droplet',
  'calendar',
  'people',
  'person',
  'check',
  'plus',
  'clock',
  'book',
  'list',
  'star',
  'heart',
  'home',
  'bell',
  'cart',
  'dumbbell',
  'trophy',
  'money',
  'chart',
  'music',
  'food',
  'car',
  'gift',
  'flag',
  'pin',
  'chat',
  'sun',
  'moon',
  'leaf',
  'paw',
  'tool',
  'timer',
  'note',
  'bolt',
  'target',
  'sparkle',
] as const;
export const IconName = z.enum(ICONS);
export type IconName = z.infer<typeof IconName>;

export const FieldType = z.enum(['text', 'longText', 'number', 'bool', 'date', 'member', 'choice']);

export const Field = z.object({
  type: FieldType,
  label: z.string().max(60).optional(),
  options: z.array(z.string().max(40)).max(20).optional(),
  required: z.boolean().optional(),
  /** Numbers: range and step for steppers and sliders. */
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  /** How the field is edited. Default by type: text field, number stepper, switch, date picker, segmented choice, person picker. */
  editor: z.enum(['auto', 'stepper', 'slider', 'rating']).optional(),
});

export const Collection = z.object({
  label: z.string().max(60),
  /** Stored fields. */
  fields: z.record(id, Field),
  /** Derived values, evaluated per record with `item` bound. */
  computed: z.record(id, expr).optional(),
});

export const Theme = z.object({
  primary: hex,
  onPrimary: hex,
  background: hex,
  surface: hex,
  ink: hex,
  muted: hex,
  tint: hex,
  line: hex,
});

// ---------------------------------------------------------------- blocks

const ItemButton = z.object({
  label: template,
  icon: IconName.optional(),
  action: id,
  visible: expr.optional(),
});

const Tone = z.enum(['normal', 'muted', 'primary', 'danger']);

/**
 * Building blocks. This is the complete list of what a generated app can show.
 * Deliberately absent: web views, images from the web, maps/location, camera,
 * uploads, payments and anything that runs code (see docs/SECURITY.md).
 */
export const Block = z.discriminatedUnion('type', [
  // ---- display
  z.object({
    type: z.literal('hero'),
    eyebrow: template.optional(),
    title: template,
    /** Shows the people avatars next to a line of text. */
    people: z.object({ text: template }).optional(),
  }),
  z.object({ type: z.literal('section'), text: template }),
  z.object({ type: z.literal('text'), text: template, tone: Tone.optional(), size: z.enum(['small', 'body', 'large']).optional() }),
  z.object({ type: z.literal('card'), title: template, text: template.optional(), icon: IconName.optional(), tone: Tone.optional(), visible: expr.optional() }),
  z.object({
    type: z.literal('stats'),
    items: z.array(z.object({ label: template, value: template, icon: IconName.optional() })).min(1).max(4),
  }),
  z.object({
    type: z.literal('progress'),
    label: template,
    /** 0–1 */
    value: expr,
    caption: template.optional(),
    style: z.enum(['bar', 'ring']).optional(),
  }),
  z.object({
    type: z.literal('chart'),
    title: template.optional(),
    kind: z.enum(['bar', 'line']),
    /** A collection id, or "people" (then `person` is bound instead of `item`). */
    of: id,
    where: expr.optional(),
    sortBy: expr.optional(),
    label: expr,
    value: expr,
    max: z.number().int().min(1).max(30).optional(),
  }),
  z.object({
    type: z.literal('calendar'),
    collection: id,
    /** Expression giving the record's date. */
    date: expr,
    where: expr.optional(),
    range: z.enum(['week', 'month']).optional(),
    title: template.optional(),
  }),
  z.object({ type: z.literal('illustration'), emoji: z.string().min(1).max(8), text: template.optional() }),
  z.object({ type: z.literal('divider') }),
  z.object({
    type: z.literal('timer'),
    label: template.optional(),
    /** Countdown length in seconds. */
    seconds: expr,
    /** Runs when the countdown reaches zero (e.g. log a workout). */
    onDone: id.optional(),
  }),
  // ---- data
  z.object({
    type: z.literal('list'),
    collection: id,
    where: expr.optional(),
    sortBy: expr.optional(),
    empty: template.optional(),
    layout: z.enum(['list', 'grid']).optional(),
    item: z.object({
      icon: IconName.optional(),
      title: template,
      subtitle: template.optional(),
      badge: template.optional(),
      /** A bool field shown as a tick box that toggles on tap. */
      check: id.optional(),
      button: ItemButton.optional(),
      /** Tapping the row opens this detail screen with the record. */
      open: id.optional(),
    }),
  }),
  z.object({
    type: z.literal('people'),
    subtitle: template.optional(),
    sortBy: expr.optional(),
    badge: template.optional(),
  }),
  // ---- inputs
  z.object({ type: z.literal('search'), state: id, placeholder: z.string().max(60).optional() }),
  z.object({ type: z.literal('segmented'), state: id, options: z.array(z.string().max(30)).min(2).max(5) }),
  z.object({ type: z.literal('toggle'), state: id, label: template }),
  /** Edits one field of the current record (detail screens). */
  z.object({ type: z.literal('field'), field: id, label: template.optional() }),
  // ---- actions
  z.object({
    type: z.literal('buttons'),
    items: z
      .array(z.object({ label: template, action: id, style: z.enum(['primary', 'secondary', 'danger']).optional(), icon: IconName.optional(), visible: expr.optional() }))
      .min(1)
      .max(3),
  }),
  z.object({ type: z.literal('addButton'), label: z.string().max(40), action: id }),
]);
export type Block = z.infer<typeof Block>;
export type BlockType = Block['type'];

/** Screen-local UI state (search text, selected filter, switches). Read as ui.<name>. */
export const UiState = z.object({
  type: z.enum(['text', 'bool', 'choice', 'number']),
  default: z.union([z.string().max(60), z.number(), z.boolean()]).optional(),
});

export const Screen = z.object({
  id,
  title: z.string().max(30),
  icon: IconName,
  /** "tab" screens appear in the tab bar; "detail" screens open from a list with one record. */
  kind: z.enum(['tab', 'detail']).optional(),
  /** Detail screens: the collection of the record they show (bound as item). */
  collection: id.optional(),
  state: z.record(id, UiState).optional(),
  blocks: z.array(Block).max(40),
});

// ---------------------------------------------------------------- actions

export const Step = z.union([
  z.object({ update: z.literal('item'), set: z.record(id, expr) }),
  z.object({ create: id, set: z.record(id, expr) }),
  z.object({ remove: z.literal('item') }),
  z.object({ navigate: id }),
  z.object({ notify: z.object({ to: expr, text: template }) }),
  /** A short message at the bottom of the screen. */
  z.object({ toast: template }),
  /** Leaves a detail screen (back to where it was opened from). */
  z.object({ back: z.literal(true) }),
]);
export type Step = z.infer<typeof Step>;

export const Action = z.object({
  /** Asks the person for values first; they are available as `form.<field>`. */
  form: z
    .object({
      title: z.string().max(60),
      fields: z.record(id, Field.extend({ label: z.string().max(60) })),
      submit: z.string().max(30),
    })
    .optional(),
  /** Asks "Are you sure?" with this text first (use for removing things). */
  confirm: template.optional(),
  steps: z.array(Step).min(1).max(10),
});

export const Notification = z.object({
  id,
  /** Checked once a day per record of `collection`, with `item` bound. */
  collection: id,
  when: expr,
  to: expr,
  text: template,
  /** Local time of day, "HH:MM". */
  at: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
});

// ---------------------------------------------------------------- sample data

const SampleValue = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);

export const Sample = z.object({
  people: z
    .array(z.object({ id, name: z.string().max(30), color: hex }))
    .min(1)
    .max(10),
  me: id,
  /** Records per collection. Dates may be relative: "@now", "@now-3d", "@now-2h". */
  records: z.record(id, z.array(z.record(id, SampleValue)).max(50)),
});

// ---------------------------------------------------------------- blueprint

export const Blueprint = z.object({
  blueprint: z.literal(BLUEPRINT_VERSION),
  name: z.string().min(1).max(30),
  tagline: z.string().max(80),
  theme: Theme,
  people: z.object({
    /** What the app calls its people, e.g. "Flatmates". */
    label: z.string().max(30),
  }),
  collections: z.record(id, Collection),
  screens: z.array(Screen).min(1).max(10),
  actions: z.record(id, Action),
  notifications: z.array(Notification).max(20).default([]),
  sample: Sample,
});

export type Blueprint = z.infer<typeof Blueprint>;
export type BlueprintInput = z.input<typeof Blueprint>;
export type Collection = z.infer<typeof Collection>;
export type Screen = z.infer<typeof Screen>;
export type Action = z.infer<typeof Action>;
export type Theme = z.infer<typeof Theme>;
export type Field = z.infer<typeof Field>;
