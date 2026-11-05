import { useMemo } from 'react';
import { Blueprint, createSandbox, type BlueprintInput, type Sandbox } from '@saywright/blueprint';

/** Creates one sandbox per blueprint. Sample data only; nothing leaves the device. */
export function useSandbox(input: BlueprintInput): Sandbox {
  return useMemo(() => createSandbox(Blueprint.parse(input)), [input]);
}
