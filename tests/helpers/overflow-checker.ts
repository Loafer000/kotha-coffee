import { Page, expect } from '@playwright/test';

export interface OverflowResult {
  docWidth: number;
  bodyScrollWidth: number;
  docScrollWidth: number;
  hasOverflow: boolean;
  offending: Array<{
    tag: string;
    id: string;
    className: string;
    textPreview: string;
    right: number;
    width: number;
  }>;
}

/**
 * Asserts that the current page has zero horizontal overflow at its current viewport width.
 * Verifies documentElement.scrollWidth <= documentElement.clientWidth and body.scrollWidth <= documentElement.clientWidth.
 * Also scans DOM elements to identify specific overflowing culprits for diagnostic reporting.
 */
export async function assertNoHorizontalOverflow(page: Page, viewName: string): Promise<OverflowResult> {
  const result: OverflowResult = await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const docScrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body ? document.body.scrollWidth : 0;

    const offending: Array<{
      tag: string;
      id: string;
      className: string;
      textPreview: string;
      right: number;
      width: number;
    }> = [];

    // Scan all visible elements
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      // Skip non-rendered or zero-dimension elements
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      // 1.5px margin of error for subpixel / display scaling antialiasing
      if (rect.right > docWidth + 1.5) {
        // Exclude elements styled with overflow-x: auto/scroll inside containers
        const style = window.getComputedStyle(el);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll' || style.display === 'none') {
          continue;
        }

        offending.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          className: (el.className && typeof el.className === 'string') ? el.className.slice(0, 100) : '',
          textPreview: (el.textContent || '').trim().slice(0, 50),
          right: Math.round(rect.right * 10) / 10,
          width: Math.round(rect.width * 10) / 10
        });
      }
    }

    const hasOverflow = bodyScrollWidth > docWidth + 1 ||
                        docScrollWidth > docWidth + 1 ||
                        offending.length > 0;

    return {
      docWidth,
      bodyScrollWidth,
      docScrollWidth,
      hasOverflow,
      offending: offending.slice(0, 5) // Top 5 culprits
    };
  });

  expect(
    result.hasOverflow,
    `Horizontal overflow detected on "${viewName}"! Viewport clientWidth: ${result.docWidth}px, doc.scrollWidth: ${result.docScrollWidth}px, body.scrollWidth: ${result.bodyScrollWidth}px. Offending elements: ${JSON.stringify(result.offending, null, 2)}`
  ).toBe(false);

  return result;
}
