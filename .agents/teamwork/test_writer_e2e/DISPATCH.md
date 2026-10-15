## 2026-10-15T03:17:09Z
You are the E2E Test Writer for the Kotha & Coffee POS project.
Your working directory is: d:\kotha&coffee\.agents\teamwork\test_writer_e2e

You MUST read these files before doing anything:
1. d:\kotha&coffee\.agents\teamwork\ORIGINAL_REQUEST.md
2. d:\kotha&coffee\PROJECT.md
3. d:\kotha&coffee\.agents\teamwork\explorer_test_survey\handoff.md
4. d:\kotha&coffee\.agents\teamwork\spec_miner_survey\handoff.md

Your Scope:
Design and implement the complete, turnkey automated E2E test suite runnable on Windows with a single command (`npm test` or `npm run test:e2e`).

Detailed Tasks:
1. Configure `playwright.config.ts`:
   - Base URL `http://localhost:3000` (or `process.env.BASE_URL`), viewport `{ width: 375, height: 667 }`, timezone `Asia/Kolkata`, locale `en-IN`, workers: 1, `webServer` block launching `npm start`.
2. Implement test helpers under `tests/helpers/`:
   - `audio-spy.ts`: Spying on `HTMLAudioElement.prototype.play` and Web Audio API `AudioContext`.
   - `overflow-checker.ts`: Tests `scrollWidth <= clientWidth` on 375px mobile viewports.
   - `clock-controller.ts`: Timezone date injection helper via `X-Mock-Date` or `/api/test/set-time`.
   - `server-controller.ts`: Process restart and health poll helper.
3. Implement test fixtures under `tests/fixtures/`:
   - `menu-items.fixture.ts`: 34 items matching `menu.jpeg`.
   - `seeded-analytics.fixture.ts`: Multi-day dataset (>=3 days, >=5 items, mixed payment methods, cancelled orders) with exact expected mathematical sums matching Section 4.3 of `explorer_test_survey/handoff.md`.
4. Implement all 4 test tiers under `tests/e2e/`:
   - `tier1-feature-coverage/` (>=5 tests per feature across Landing, Reception, Menu, Kitchen, Analytics, PIN)
   - `tier2-boundary-edge/` (Concurrency burst, PIN bypass, 375px overflow, Server restart, Cart limits)
   - `tier3-interactions/` (Real-time live sync <5s without reload, Date roll #1 reset in Asia/Kolkata, Price immutability, Kitchen audio alert, Order settle/cancel sync)
   - `tier4-real-world-workflows/` (Rush hour simulation, 3-day seeded math audit, full daily lifecycle)
5. Implement deliverable screenshot generator:
   - `tests/e2e/screenshots/generate-deliverable-screenshots.spec.ts` capturing all 7 required 375px mobile screenshots into `./screenshots/`.
6. Add npm test scripts to `package.json` if needed (`test:e2e`, `test:tier1`, etc.).
7. Author `d:\kotha&coffee\TEST_INFRA.md` at project root documenting test architecture, methodology, and runner commands.
8. When the test suite files are created, publish `d:\kotha&coffee\TEST_READY.md` at project root with the test runner command and coverage summary.

Write Ownership:
- `playwright.config.ts`
- `tests/helpers/**`
- `tests/fixtures/**`
- `tests/e2e/**`
- `TEST_INFRA.md`
- `TEST_READY.md`
(Do NOT modify server implementation code in src/server/ or src/client/).

Deliverables:
- Maintain `d:\kotha&coffee\.agents\teamwork\test_writer_e2e\progress.md` with timestamps.
- Publish `TEST_INFRA.md` and `TEST_READY.md` at project root.
- Write handoff report to `d:\kotha&coffee\.agents\teamwork\test_writer_e2e\handoff.md`.
- Send a completion message back to me (the orchestrator).
