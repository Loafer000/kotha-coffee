import { Page, expect } from '@playwright/test';

declare global {
  interface Window {
    __kothaAudioPlayedCount?: number;
    __kothaAudioPlayedEvents?: Array<{ source: string; timestamp: number }>;
  }
}

/**
 * Injects audio spies into the page before DOM load.
 * Intercepts both HTMLAudioElement.prototype.play and Web Audio API synthesis
 * (AudioContext / webkitAudioContext oscillators and resume calls).
 */
export async function installAudioSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__kothaAudioPlayedCount = 0;
    window.__kothaAudioPlayedEvents = [];

    // 1. Spy on HTMLAudioElement.prototype.play
    const originalPlay = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function (this: HTMLAudioElement) {
      window.__kothaAudioPlayedCount = (window.__kothaAudioPlayedCount || 0) + 1;
      window.__kothaAudioPlayedEvents = window.__kothaAudioPlayedEvents || [];
      window.__kothaAudioPlayedEvents.push({
        source: this.src || 'HTMLAudioElement',
        timestamp: Date.now()
      });

      // Dispatch custom event for real-time listeners
      window.dispatchEvent(new CustomEvent('kotha-sound-played', {
        detail: { src: this.src, type: 'HTMLAudioElement' }
      }));

      // Return a resolved promise to prevent AbortError / NotAllowedError in headless
      return Promise.resolve();
    };

    // 2. Spy on Web Audio API (AudioContext)
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const origResume = AudioCtx.prototype.resume;
      AudioCtx.prototype.resume = function (this: AudioContext) {
        return origResume ? origResume.apply(this) : Promise.resolve();
      };

      const origCreateOscillator = AudioCtx.prototype.createOscillator;
      if (origCreateOscillator) {
        AudioCtx.prototype.createOscillator = function (this: AudioContext) {
          const osc = origCreateOscillator.apply(this);
          const origStart = osc.start;
          osc.start = function (when?: number) {
            window.__kothaAudioPlayedCount = (window.__kothaAudioPlayedCount || 0) + 1;
            window.__kothaAudioPlayedEvents = window.__kothaAudioPlayedEvents || [];
            window.__kothaAudioPlayedEvents.push({
              source: 'WebAudioOscillator',
              timestamp: Date.now()
            });
            window.dispatchEvent(new CustomEvent('kotha-sound-played', {
              detail: { type: 'WebAudioOscillator' }
            }));
            if (origStart) {
              try {
                origStart.call(osc, when);
              } catch (_) {
                // Ignore headless WebAudio graph errors
              }
            }
          };
          return osc;
        };
      }
    }
  });
}

/**
 * Returns total count of audio alerts recorded since spy installation or reset.
 */
export async function getAudioPlayedCount(page: Page): Promise<number> {
  return await page.evaluate(() => window.__kothaAudioPlayedCount || 0);
}

/**
 * Returns all audio events captured.
 */
export async function getAudioEvents(page: Page): Promise<Array<{ source: string; timestamp: number }>> {
  return await page.evaluate(() => window.__kothaAudioPlayedEvents || []);
}

/**
 * Resets recorded audio counter and events.
 */
export async function resetAudioSpy(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__kothaAudioPlayedCount = 0;
    window.__kothaAudioPlayedEvents = [];
  });
}

/**
 * Waits until at least targetCount audio alerts have fired on the page.
 */
export async function waitForAudioAlert(page: Page, targetCount = 1, timeoutMs = 5000): Promise<void> {
  await expect.poll(async () => {
    return await page.evaluate(() => window.__kothaAudioPlayedCount || 0);
  }, {
    message: `Expected at least ${targetCount} audio alert(s) within ${timeoutMs}ms`,
    timeout: timeoutMs,
  }).toBeGreaterThanOrEqual(targetCount);
}
