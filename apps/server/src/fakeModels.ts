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
          const text = messages.map((m) => String(m.content)).join(' ').toLowerCase();
          await new Promise((r) => setTimeout(r, 400));
          return new AIMessage(
            text.includes('bank login')
              ? JSON.stringify({ allowed: false, category: 'phishing', reason: 'Saywright can’t build apps that copy a bank’s login.' })
              : allow,
          );
        },
      } as unknown as BaseChatModel;
    }
    return new FakeListChatModel({ responses: [role === 'plan' ? plan : JSON.stringify(thirsty)], sleep: 600 }) as unknown as BaseChatModel;
  };
}
