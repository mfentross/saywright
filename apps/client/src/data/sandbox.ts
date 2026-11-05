import { Blueprint, createSandbox, thirsty } from '@saywright/blueprint';

/**
 * The sandbox for the app currently being tested. Shared by the inline preview
 * (Test drive) and the fullscreen test, so both show the same sample data.
 * Sample data only: nothing is saved or sent anywhere.
 */
export const currentSandbox = createSandbox(Blueprint.parse(thirsty));
