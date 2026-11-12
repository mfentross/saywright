import type { IconKey } from '@saywright/player';

/** Mock content until the backend exists (phase 2). */

export const starterIdeas = ['Habit tracker', 'Shared shopping list', 'Booking page', 'Workout timer'];

export const sampleIdea =
  'An app where my flatmates and I can see which plants need water, and it pings whoever’s turn it is.';

export const draft = { name: 'Run Club', status: 'Testing · version 2' };

export const plan = {
  name: 'Thirsty',
  tagline: 'Plant care for a shared flat',
  rows: [
    { label: 'Screens', value: 'Plants, Schedule, Flatmates' },
    { label: 'Remembers', value: 'Your plants, who watered when, whose turn is next' },
    { label: 'Notifies', value: 'The flatmate whose turn it is' },
  ],
  steps: ['Planned 3 screens', 'Designed the look', 'Wired up turns and reminders', 'Filling in sample data to test with'],
};

export const changeSuggestions = ['Add plant photos', 'Remind at 8 am', 'Darker look'];

export const plans = [
  {
    id: 'own',
    name: 'Keep it',
    price: '€4.99 / month',
    desc: 'This version, live on your phone, the web and the stores. Saywright hosts it and keeps it working.',
    cta: 'Start · €4.99 / month',
  },
  {
    id: 'plus',
    name: 'Keep it + changes',
    price: '€9.99 / month',
    desc: 'Everything in Keep it, plus reshape it by voice or text whenever you like.',
    cta: 'Start · €9.99 / month',
  },
] as const;
export type PlanId = (typeof plans)[number]['id'];

export const included = [
  'A finished app, not code',
  'Checked and published by Saywright',
  '50 active people a month, then pay as you grow',
  'Export your data',
];

export const routes: Array<{ id: RouteId; name: string; desc: string; icon: IconKey }> = [
  {
    id: 'phone',
    name: 'Add to my phone',
    desc: 'Puts Thirsty on your home screen in about a minute, with notifications. No store needed.',
    icon: 'phone',
  },
  {
    id: 'store',
    name: 'Publish to App Store & Google Play',
    desc: 'Published under your name, from your own Apple and Google developer accounts (store fees are paid to Apple and Google). We guide you through the one-time setup, then write the listing, take the screenshots and handle review.',
    icon: 'bag',
  },
  {
    id: 'link',
    name: 'Share as a web link',
    desc: 'Anyone with the link opens it in their browser. Nothing to install.',
    icon: 'link',
  },
];
export type RouteId = 'phone' | 'store' | 'link';

export const storeSteps = [
  { title: 'Approved by Saywright', desc: 'Content, privacy and quality check passed', state: 'done' },
  { title: 'Developer accounts connected', desc: 'Apple and Google, under your name', state: 'done' },
  { title: 'Built and signed', desc: 'iPhone and Android versions', state: 'done' },
  { title: 'Store listing written', desc: 'Description, screenshots, privacy details', state: 'done', edit: true },
  { title: 'Submitted for review', desc: 'Apple and Google check every new app', state: 'current' },
  { title: 'Live in the stores', desc: 'Usually 1–7 days · we’ll notify you', state: 'todo' },
] as const;

export const library = {
  live: [
    { name: 'Thirsty', status: 'v1 · on your phone · in store review', icon: 'droplet' as IconKey, bg: '#1F7A4D', fg: '#FFFFFF' },
    { name: 'Studio booking', status: 'v4 · changes plan', icon: 'calendar' as IconKey, bg: '#3446C7', fg: '#FFFFFF' },
  ],
  testing: [
    { name: 'Run Club', status: 'Testing · v2', icon: 'clock' as IconKey, action: 'Test' },
    { name: 'Recipe box', status: 'Building', icon: 'book' as IconKey },
  ],
};
