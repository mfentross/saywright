import type { BlueprintInput } from '../schema';

/** "Thirsty": plant care for a shared flat. Hand-written reference blueprint. */
export const thirsty: BlueprintInput = {
  blueprint: 1,
  name: 'Thirsty',
  tagline: 'Plant care for a shared flat',
  theme: {
    primary: '#1F7A4D',
    onPrimary: '#FFFFFF',
    background: '#F2F7EF',
    surface: '#FFFFFF',
    ink: '#12301F',
    muted: '#3F5E4B',
    tint: '#CFE5C6',
    line: '#DCE7D6',
  },
  people: { label: 'Flatmates' },
  collections: {
    plants: {
      label: 'Plants',
      fields: {
        name: { type: 'text', label: 'Name', required: true },
        everyDays: { type: 'number', label: 'Water every (days)' },
        lastWatered: { type: 'date', label: 'Last watered' },
        lastWateredBy: { type: 'member', label: 'Watered by' },
        turn: { type: 'member', label: 'Whose turn' },
      },
      computed: {
        due: 'daysSince(item.lastWatered) >= item.everyDays',
        daysLeft: 'max(0, item.everyDays - daysSince(item.lastWatered))',
        status:
          "daysSince(item.lastWatered) >= item.everyDays" +
          " ? 'Water today · ' + (isMe(item.turn) ? 'your turn' : memberName(item.turn) + '’s turn')" +
          " : minutesSince(item.lastWatered) < 60 && isMe(item.lastWateredBy)" +
          " ? 'Watered just now by you · next turn: ' + memberName(item.turn)" +
          " : isToday(item.lastWatered)" +
          " ? 'Watered today by ' + (isMe(item.lastWateredBy) ? 'you' : memberName(item.lastWateredBy))" +
          " : 'Next in ' + plural(max(0, item.everyDays - daysSince(item.lastWatered)), 'day') + ' · ' + memberName(item.turn)",
      },
    },
  },
  screens: [
    {
      id: 'plants',
      title: 'Plants',
      icon: 'sprout',
      blocks: [
        {
          type: 'hero',
          eyebrow: '{{weekday(now())}}',
          title:
            "{{count(plants, it.due) == 0 ? 'All plants happy' : count(plants, it.due) == 1 ? '1 plant is thirsty' : count(plants, it.due) + ' plants are thirsty'}}",
          people: {
            text:
              "{{count(plants, it.due && isMe(it.turn)) > 0" +
              " ? 'Your turn: ' + join(map(filter(plants, it.due && isMe(it.turn)), it.name)) + '.'" +
              " + (count(plants, it.due && !isMe(it.turn)) > 0 ? ' ' + memberName(first(filter(plants, it.due && !isMe(it.turn))).turn) + ' has the ' + first(filter(plants, it.due && !isMe(it.turn))).name + '.' : '')" +
              " : 'You’re done for today. ' + memberName(nextMember(me.id)) + ' is up next.'}}",
          },
        },
        { type: 'section', text: 'Today' },
        {
          type: 'list',
          collection: 'plants',
          sortBy: 'item.due ? 0 : 1',
          empty: 'No plants yet. Add your first one.',
          item: {
            icon: 'sprout',
            title: '{{item.name}}',
            subtitle: '{{item.status}}',
            button: { label: 'Watered', icon: 'check', action: 'water', visible: 'item.due' },
          },
        },
        { type: 'addButton', label: 'Add a plant', action: 'addPlant' },
      ],
    },
    {
      id: 'schedule',
      title: 'Schedule',
      icon: 'calendar',
      blocks: [
        { type: 'hero', eyebrow: 'Coming up', title: 'Schedule' },
        { type: 'section', text: 'Next waterings' },
        {
          type: 'list',
          collection: 'plants',
          sortBy: 'item.daysLeft',
          item: {
            icon: 'droplet',
            title: '{{item.name}}',
            subtitle:
              "{{item.due ? 'Today' : 'In ' + plural(item.daysLeft, 'day')}} · {{isMe(item.turn) ? 'you' : memberName(item.turn)}}",
          },
        },
      ],
    },
    {
      id: 'flatmates',
      title: 'Flatmates',
      icon: 'people',
      blocks: [
        { type: 'hero', eyebrow: 'Your flat', title: 'Flatmates' },
        { type: 'people', subtitle: "{{count(plants, it.turn == person.id)}} plants on their turn" },
      ],
    },
  ],
  actions: {
    water: {
      steps: [
        { update: 'item', set: { lastWatered: 'now()', lastWateredBy: 'me.id', turn: 'nextMember(me.id)' } },
      ],
    },
    addPlant: {
      form: {
        title: 'Add a plant',
        submit: 'Add plant',
        fields: {
          name: { type: 'text', label: 'Name', required: true },
          everyDays: { type: 'number', label: 'Water every … days' },
        },
      },
      steps: [
        {
          create: 'plants',
          set: {
            name: 'form.name',
            everyDays: 'max(1, coalesce(form.everyDays, 3))',
            lastWatered: 'now()',
            lastWateredBy: 'me.id',
            turn: 'nextMember(me.id)',
          },
        },
      ],
    },
  },
  notifications: [
    {
      id: 'dueReminder',
      collection: 'plants',
      when: 'item.due',
      to: 'item.turn',
      text: '{{item.name}} is thirsty. It’s your turn to water it.',
      at: '09:00',
    },
  ],
  sample: {
    people: [
      // Order is also the turn rotation: Lea → you → Jonas → Lea.
      { id: 'lea', name: 'Lea', color: '#FFD66B' },
      { id: 'you', name: 'Alex', color: '#FFFFFF' },
      { id: 'jonas', name: 'Jonas', color: '#BFE3FF' },
    ],
    me: 'you',
    records: {
      plants: [
        { id: 'monstera', name: 'Monstera', everyDays: 7, lastWatered: '@now-7d', lastWateredBy: 'jonas', turn: 'lea' },
        { id: 'pilea', name: 'Pilea', everyDays: 4, lastWatered: '@now-4d', lastWateredBy: 'lea', turn: 'you' },
        { id: 'fern', name: 'Fern', everyDays: 2, lastWatered: '@now-3h', lastWateredBy: 'jonas', turn: 'lea' },
        { id: 'basil', name: 'Basil', everyDays: 3, lastWatered: '@now-1d', lastWateredBy: 'lea', turn: 'jonas' },
      ],
    },
  },
};
