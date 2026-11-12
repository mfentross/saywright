import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, answerQuestion, createProject, fetchBlueprint, projectEvents, type ServerEvent } from '../services/api';
import { loadBlueprint } from './sandbox';
import { plan as demoPlan } from './mock';

export type BuildStatus = 'building' | 'question' | 'ready' | 'declined' | 'failed';

export interface BuildPlan {
  name: string;
  tagline: string;
  rows: Array<{ label: string; value: string }>;
}

export interface BuildState {
  live: boolean;
  status: BuildStatus;
  steps: string[];
  plan: BuildPlan | null;
  question: { text: string; options: string[] } | null;
  /** The option the person picked. */
  chosen: string | null;
  message: string | null;
}

const DEMO: BuildState = {
  live: false,
  status: 'ready',
  steps: demoPlan.steps,
  plan: { name: demoPlan.name, tagline: demoPlan.tagline, rows: demoPlan.rows },
  question: { text: 'how often should it remind?', options: ['Per plant', 'Daily', 'Every 2 days'] },
  chosen: null,
  message: null,
};

/**
 * Runs a build for an idea. With a server (EXPO_PUBLIC_API_URL) it creates a project and
 * follows its event stream; without one it shows the demo build of Thirsty.
 */
export function useBuild(idea: string) {
  const liveMode = !!API_URL && !!idea.trim();
  const [state, setState] = useState<BuildState>(
    liveMode ? { live: true, status: 'building', steps: [], plan: null, question: null, chosen: null, message: null } : DEMO,
  );
  const project = useRef<string | null>(null);
  const lastSeq = useRef(0);
  const started = useRef(false);

  const follow = useCallback(async (id: string) => {
    try {
      for await (const { seq, event } of projectEvents(id, lastSeq.current)) {
        lastSeq.current = Math.max(lastSeq.current, seq);
        await apply(event);
      }
    } catch {
      setState((s) => ({ ...s, status: 'failed', message: 'Lost the connection to Saywright. Please try again.' }));
    }

    async function apply(e: ServerEvent) {
      switch (e.type) {
        case 'step':
          setState((s) => ({ ...s, steps: [...s.steps, e.label] }));
          break;
        case 'plan':
          setState((s) => ({
            ...s,
            plan: {
              name: e.name,
              tagline: e.tagline,
              rows: [
                { label: 'Screens', value: e.screens.join(', ') },
                { label: 'Remembers', value: e.remembers },
                { label: 'Notifies', value: e.notifies },
              ],
            },
          }));
          break;
        case 'question':
          setState((s) => ({ ...s, status: 'question', question: { text: e.text, options: e.options } }));
          break;
        case 'ready': {
          const { blueprint } = await fetchBlueprint(id);
          loadBlueprint(blueprint);
          setState((s) => ({ ...s, status: 'ready' }));
          break;
        }
        case 'declined':
          setState((s) => ({ ...s, status: 'declined', message: e.reason }));
          break;
        case 'failed':
          setState((s) => ({ ...s, status: 'failed', message: e.message }));
          break;
      }
    }
  }, []);

  useEffect(() => {
    if (!liveMode || started.current) return;
    started.current = true;
    createProject(idea.trim())
      .then((id) => {
        project.current = id;
        return follow(id);
      })
      .catch(() => setState((s) => ({ ...s, status: 'failed', message: 'Saywright couldn’t start building. Please try again.' })));
  }, [idea, liveMode, follow]);

  const answer = useCallback(
    async (option: string) => {
      if (!state.live) return;
      const id = project.current;
      if (!id || state.status !== 'question') return;
      setState((s) => ({ ...s, status: 'building', chosen: option }));
      try {
        await answerQuestion(id, option);
        await follow(id);
      } catch {
        setState((s) => ({ ...s, status: 'failed', message: 'Saywright couldn’t continue. Please try again.' }));
      }
    },
    [follow, state.live, state.status],
  );

  return { ...state, answer };
}
