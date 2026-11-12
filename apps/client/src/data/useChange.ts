import { useCallback, useState } from 'react';
import { API_URL, ApiError, fetchBlueprint, projectEvents, requestChange } from '../services/api';
import { loadBlueprint } from './sandbox';
import { flow } from './store';

export type ChangeStatus = 'idle' | 'changing' | 'done' | 'declined' | 'failed' | 'unavailable';

/** Sends a change request for the live project and loads the new version when it's ready. */
export function useChange() {
  const [status, setStatus] = useState<ChangeStatus>('idle');
  const [step, setStep] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const request = useCallback(async (text: string) => {
    const project = flow.get().project;
    if (!API_URL || !project) {
      setStatus('unavailable');
      setMessage('Changes need a live app. Build one from the Create tab first.');
      return;
    }
    setStatus('changing');
    setStep('Sending your change');
    setMessage(null);
    try {
      await requestChange(project.id, text);
      let seq = project.seq;
      for await (const { seq: s, event } of projectEvents(project.id, seq)) {
        seq = Math.max(seq, s);
        if (event.type === 'step') setStep(event.label);
        else if (event.type === 'changed') {
          const { blueprint, version } = await fetchBlueprint(project.id);
          loadBlueprint(blueprint);
          flow.set({ project: { id: project.id, version, seq } });
          setStatus('done');
          setMessage(`v${version} · ${event.summary}`);
          return;
        } else if (event.type === 'change_declined') {
          flow.set({ project: { ...project, seq } });
          setStatus('declined');
          setMessage(event.reason);
          return;
        } else if (event.type === 'change_failed') {
          flow.set({ project: { ...project, seq } });
          setStatus('failed');
          setMessage(event.message);
          return;
        }
      }
      setStatus('failed');
      setMessage('Lost the connection to Saywright. Please try again.');
    } catch (e) {
      setStatus('failed');
      setMessage(e instanceof ApiError && (e.status === 429 || e.status === 409) ? e.message : 'Saywright couldn’t make that change. Please try again.');
    } finally {
      setStep(null);
    }
  }, []);

  return { status, step, message, request };
}
