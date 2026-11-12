import type { BlueprintInput } from '../schema';

/**
 * "Run Club": a reference blueprint that uses every building block — stats, progress,
 * charts, calendar, search, filters, tick boxes, detail screens with all field editors,
 * buttons with confirmation, toasts, a timer and a leaderboard.
 */
export const runclub: BlueprintInput = {
  blueprint: 1,
  name: 'Run Club',
  tagline: 'Weekly runs for our running club',
  theme: {
    primary: '#3446C7',
    onPrimary: '#FFFFFF',
    background: '#F3F4FB',
    surface: '#FFFFFF',
    ink: '#141A3A',
    muted: '#4F5677',
    tint: '#DDE1FA',
    line: '#E1E4F2',
  },
  people: { label: 'Runners' },
  collections: {
    runs: {
      label: 'Runs',
      fields: {
        title: { type: 'text', label: 'Title', required: true },
        runner: { type: 'member', label: 'Runner' },
        km: { type: 'number', label: 'Distance (km)', min: 0, max: 50, step: 0.5, editor: 'slider' },
        minutes: { type: 'number', label: 'Minutes', min: 0, max: 300, step: 5, editor: 'stepper' },
        date: { type: 'date', label: 'Date' },
        kind: { type: 'choice', label: 'Type', options: ['Easy', 'Tempo', 'Long'] },
        feeling: { type: 'number', label: 'How it felt', min: 1, max: 5, editor: 'rating' },
        withGroup: { type: 'bool', label: 'Ran with the group' },
        done: { type: 'bool', label: 'Done' },
        notes: { type: 'longText', label: 'Notes' },
      },
      computed: {
        thisWeek: 'daysSince(item.date) < 7 && daysSince(item.date) >= 0',
        pace: "item.km > 0 ? round(item.minutes / item.km) + ' min/km' : '–'",
      },
    },
  },
  screens: [
    {
      id: 'home',
      title: 'Home',
      icon: 'home',
      blocks: [
        { type: 'hero', eyebrow: '{{weekday(now())}}', title: "{{round(sum(filter(runs, it.thisWeek && it.done), it.km))}} km this week" },
        {
          type: 'stats',
          items: [
            { label: 'Runs', value: '{{count(runs, it.thisWeek && it.done)}}', icon: 'dumbbell' },
            { label: 'Avg feeling', value: "{{round(avg(filter(runs, it.done), it.feeling))}}/5", icon: 'heart' },
            { label: 'Group runs', value: '{{count(runs, it.withGroup && it.done)}}', icon: 'people' },
          ],
        },
        {
          type: 'progress',
          label: 'Club goal: 60 km',
          value: 'min(1, sum(filter(runs, it.thisWeek && it.done), it.km) / 60)',
          caption: "{{max(0, 60 - round(sum(filter(runs, it.thisWeek && it.done), it.km)))}} km to go",
          style: 'ring',
        },
        { type: 'chart', title: 'Km this week', kind: 'bar', of: 'people', label: 'person.name', value: 'sum(filter(runs, it.runner == person.id && it.thisWeek && it.done), it.km)' },
        { type: 'calendar', title: 'This week', collection: 'runs', date: 'item.date', range: 'week' },
        { type: 'card', icon: 'flag', title: 'Saturday long run', text: '9:00 at the park gate. Everyone welcome.', tone: 'primary' },
      ],
    },
    {
      id: 'runs',
      title: 'Runs',
      icon: 'list',
      state: { q: { type: 'text', default: '' }, kind: { type: 'choice', default: 'All' }, mine: { type: 'bool', default: false } },
      blocks: [
        { type: 'search', state: 'q', placeholder: 'Search runs' },
        { type: 'segmented', state: 'kind', options: ['All', 'Easy', 'Tempo', 'Long'] },
        { type: 'toggle', state: 'mine', label: 'Only my runs' },
        {
          type: 'list',
          collection: 'runs',
          where: "contains(lower(item.title), lower(ui.q)) && (ui.kind == 'All' || item.kind == ui.kind) && (!ui.mine || isMe(item.runner))",
          sortBy: '-coalesce(item.date, 0)',
          empty: 'No runs match.',
          item: {
            icon: 'dumbbell',
            title: '{{item.title}}',
            subtitle: "{{memberName(item.runner)}} · {{formatDate(item.date)}} · {{item.km}} km",
            badge: '{{item.kind}}',
            check: 'done',
            open: 'run',
          },
        },
        { type: 'addButton', label: 'Add a run', action: 'addRun' },
      ],
    },
    {
      id: 'run',
      title: 'Run',
      icon: 'dumbbell',
      kind: 'detail',
      collection: 'runs',
      blocks: [
        { type: 'hero', eyebrow: "{{formatDate(item.date, 'long')}}", title: '{{item.title}}' },
        { type: 'stats', items: [{ label: 'Distance', value: '{{item.km}} km' }, { label: 'Pace', value: '{{item.pace}}' }] },
        { type: 'field', field: 'title' },
        { type: 'field', field: 'runner' },
        { type: 'field', field: 'km' },
        { type: 'field', field: 'minutes' },
        { type: 'field', field: 'date' },
        { type: 'field', field: 'kind' },
        { type: 'field', field: 'feeling' },
        { type: 'field', field: 'withGroup' },
        { type: 'field', field: 'notes' },
        { type: 'divider' },
        { type: 'buttons', items: [{ label: 'Delete run', action: 'deleteRun', style: 'danger' }] },
      ],
    },
    {
      id: 'timer',
      title: 'Timer',
      icon: 'timer',
      blocks: [
        { type: 'illustration', emoji: '⏱️', text: 'Interval timer: 4 minutes on, then log it.' },
        { type: 'timer', label: 'Tempo interval', seconds: '240', onDone: 'logInterval' },
      ],
    },
    {
      id: 'team',
      title: 'Runners',
      icon: 'trophy',
      blocks: [
        { type: 'section', text: 'Leaderboard this week' },
        { type: 'text', text: 'Kilometres from runs ticked off this week.', tone: 'muted', size: 'small' },
        {
          type: 'people',
          sortBy: '-sum(filter(runs, it.runner == person.id && it.thisWeek && it.done), it.km)',
          subtitle: "{{plural(count(runs, it.runner == person.id && it.done), 'run')}}",
          badge: '{{round(sum(filter(runs, it.runner == person.id && it.thisWeek && it.done), it.km))}} km',
        },
      ],
    },
  ],
  actions: {
    addRun: {
      form: {
        title: 'Add a run',
        submit: 'Add run',
        fields: {
          title: { type: 'text', label: 'Title', required: true },
          km: { type: 'number', label: 'Distance (km)', min: 0, max: 50, step: 0.5 },
          kind: { type: 'choice', label: 'Type', options: ['Easy', 'Tempo', 'Long'] },
          date: { type: 'date', label: 'Date' },
          withGroup: { type: 'bool', label: 'With the group' },
        },
      },
      steps: [
        {
          create: 'runs',
          set: {
            title: 'form.title',
            km: 'coalesce(form.km, 5)',
            minutes: 'round(coalesce(form.km, 5) * 6)',
            kind: "coalesce(form.kind, 'Easy')",
            date: 'coalesce(form.date, now())',
            withGroup: 'coalesce(form.withGroup, false)',
            runner: 'me.id',
            feeling: '3',
            done: 'false',
            notes: "''",
          },
        },
        { toast: 'Run added. Tick it off when you’re done.' },
      ],
    },
    deleteRun: {
      confirm: 'Delete “{{item.title}}”?',
      steps: [{ remove: 'item' }, { toast: 'Run deleted' }, { back: true }],
    },
    logInterval: {
      steps: [
        {
          create: 'runs',
          set: { title: "'Tempo interval'", km: '1', minutes: '4', kind: "'Tempo'", date: 'now()', runner: 'me.id', feeling: '4', done: 'true', withGroup: 'false', notes: "''" },
        },
        { toast: 'Interval logged' },
      ],
    },
  },
  notifications: [
    { id: 'saturday', collection: 'runs', when: "item.kind == 'Long' && daysUntil(item.date) == 1 && !item.done", to: 'item.runner', text: 'Long run tomorrow: {{item.title}}', at: '19:00' },
  ],
  sample: {
    people: [
      { id: 'mia', name: 'Mia', color: '#FFD66B' },
      { id: 'you', name: 'Alex', color: '#FFFFFF' },
      { id: 'tom', name: 'Tom', color: '#BFE3FF' },
    ],
    me: 'you',
    records: {
      runs: [
        { id: 'r1', title: 'Riverside loop', runner: 'mia', km: 8, minutes: 44, date: '@now-1d', kind: 'Easy', feeling: 4, withGroup: true, done: true, notes: 'Lovely morning' },
        { id: 'r2', title: 'Track tempo', runner: 'you', km: 6, minutes: 30, date: '@now-2d', kind: 'Tempo', feeling: 3, withGroup: false, done: true, notes: '' },
        { id: 'r3', title: 'Hill reps', runner: 'tom', km: 5, minutes: 32, date: '@now-3d', kind: 'Tempo', feeling: 2, withGroup: true, done: true, notes: 'Tough' },
        { id: 'r4', title: 'Saturday long run', runner: 'you', km: 16, minutes: 95, date: '@now+1d', kind: 'Long', feeling: 3, withGroup: true, done: false, notes: '' },
        { id: 'r5', title: 'Recovery jog', runner: 'mia', km: 4, minutes: 26, date: '@now', kind: 'Easy', feeling: 5, withGroup: false, done: false, notes: '' },
      ],
    },
  },
};
