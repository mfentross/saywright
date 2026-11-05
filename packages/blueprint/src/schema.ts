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
] as const;
export const IconName = z.enum(ICONS);
export type IconName = z.infer<typeof IconName>;

export const FieldType = z.enum(['text', 'longText', 'number', 'bool', 'date', 'member', 'choice']);

export const Field = z.object({
  type: FieldType,
  label: z.string().max(60).optional(),
  options: z.array(z.string().max(40)).max(20).optional(),
  required: z.boolean().optional(),
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

export const Block = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hero'),
    eyebrow: template.optional(),
    title: template,
    /** Shows the people avatars next to a line of text. */
    people: z.object({ text: template }).optional(),
  }),
  z.object({ type: z.literal('section'), text: template }),
  z.object({ type: z.literal('text'), text: template, tone: z.enum(['normal', 'muted']).optional() }),
  z.object({
    type: z.literal('list'),
    collection: id,
    where: expr.optional(),
    sortBy: expr.optional(),
    empty: template.optional(),
    item: z.object({
      icon: IconName.optional(),
      title: template,
      subtitle: template.optional(),
      button: ItemButton.optional(),
    }),
  }),
  z.object({ type: z.literal('people'), subtitle: template.optional() }),
  z.object({ type: z.literal('addButton'), label: z.string().max(40), action: id }),
]);
export type Block = z.infer<typeof Block>;

export const Screen = z.object({
  id,
  title: z.string().max(30),
  icon: IconName,
  blocks: z.array(Block).max(30),
});

// ---------------------------------------------------------------- actions

export const Step = z.union([
  z.object({ update: z.literal('item'), set: z.record(id, expr) }),
  z.object({ create: id, set: z.record(id, expr) }),
  z.object({ remove: z.literal('item') }),
  z.object({ navigate: id }),
  z.object({ notify: z.object({ to: expr, text: template }) }),
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
  screens: z.array(Screen).min(1).max(5),
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
