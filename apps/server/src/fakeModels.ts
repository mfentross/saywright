import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { thirsty } from '@saywright/blueprint';
import type { ModelFactory } from '@saywright/ai';

/**
 * DEV ONLY (SAYWRIGHT_FAKE_AI=1): scripted replies instead of real AI calls, so the app
 * can be developed without an API key or spending money. Every idea becomes Thirsty,
 * after one clarifying question. Ideas containing "bank login" are declined.
 */
export function fakeModels(): ModelFactory {
  const allow = JSON.stringify({ allowed: true, category: 'ok', reason: '' });
  const plan = JSON.stringify({
    name: 'Thirsty',
    tagline: 'Plant care for a shared flat',
    peopleLabel: 'Flatmates',
    screens: ['Plants', 'Schedule', 'Flatmates'],
    remembers: 'Your plants, who watered when, whose turn is next',
    notifies: 'The flatmate whose turn it is',
    question: { text: 'how often should it remind?', options: ['Per plant', 'Daily', 'Every 2 days'] },
  });
  return async (role) => {
    if (role === 'screen') {
      // The pipeline only calls invoke(); look at the input to decide.
      return {
        invoke: async (messages: BaseMessage[]) => {
          const text = messages.map(contentText).join(' ').toLowerCase();
          await new Promise((r) => setTimeout(r, 400));
          return new AIMessage(
            text.includes('bank login')
              ? JSON.stringify({ allowed: false, category: 'phishing', reason: 'Saywright can’t build apps that copy a bank’s login.' })
              : allow,
          );
        },
      } as unknown as BaseChatModel;
    }
    if (role === 'write') {
      return {
        invoke: async (messages: BaseMessage[]) => {
          await new Promise((r) => setTimeout(r, 800));
          const all = messages.map(contentText).join('\n');
          if (!all.includes('You change existing Saywright app blueprints')) return new AIMessage(JSON.stringify(thirsty));
          const request = (all.match(/<request>\n([\s\S]*?)\n<\/request>/)?.[1] ?? '').toLowerCase();
          const patch = request.includes('dark')
            ? [
                { op: 'replace', path: '/theme/background', value: '#14241B' },
                { op: 'replace', path: '/theme/surface', value: '#1F3328' },
                { op: 'replace', path: '/theme/ink', value: '#EAF4EC' },
                { op: 'replace', path: '/theme/muted', value: '#A9C2B1' },
                { op: 'replace', path: '/theme/tint', value: '#2C4A38' },
                { op: 'replace', path: '/theme/line', value: '#2C4A38' },
              ]
            : request.includes('8')
              ? [{ op: 'replace', path: '/notifications/0/at', value: '08:00' }]
              : [{ op: 'replace', path: '/tagline', value: request.slice(0, 60) || 'Changed' }];
          const summary = request.includes('dark') ? 'Darker look' : request.includes('8') ? 'Reminders at 8 am' : 'Updated the tagline';
          return new AIMessage(JSON.stringify({ summary, patch }));
        },
      } as unknown as BaseChatModel;
    }
    return new FakeListChatModel({ responses: [plan], sleep: 600 }) as unknown as BaseChatModel;
  };
}

/** Message text, whether content is a string or a list of content blocks. */
function contentText(m: BaseMessage): string {
  if (typeof m.content === 'string') return m.content;
  return m.content.map((b) => (typeof b === 'string' ? b : 'text' in b ? String(b.text) : '')).join('');
}
