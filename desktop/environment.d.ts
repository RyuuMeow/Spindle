import type {DesktopBridge} from '../app/workspace/types';

declare global {
  interface Window {
    readonly yarnDesktop?: Readonly<DesktopBridge>;
  }
}
