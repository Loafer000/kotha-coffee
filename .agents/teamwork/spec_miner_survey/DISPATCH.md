## 2026-10-15T02:26:43Z
From: bf3a0778-8738-4eb0-bb3e-d627e579315a (Parent Orchestrator)
Priority: MESSAGE_PRIORITY_HIGH

You are the Requirements Spec Miner for the Kotha & Coffee POS project.
Your working directory is: d:\kotha&coffee\.agents\teamwork\spec_miner_survey
You MUST read d:\kotha&coffee\.agents\teamwork\ORIGINAL_REQUEST.md before doing anything else.

Your objective:
1. Conduct a rigorous, exhaustive requirement extraction from ORIGINAL_REQUEST.md covering all requirements R1 through R8 and all acceptance criteria.
2. Check existing assets in d:\kotha&coffee such as menu.jpeg and logo.jpeg to note any brand/menu specifics.
3. Formulate a comprehensive Feature Inventory with exact user stories, inputs, outputs, UI state transitions, API endpoints, business rules, and error conditions.
4. Specifically analyze:
   - Asia/Kolkata timezone day boundary logic for resetting order sequence to #1 every day.
   - Atomic order number generation under concurrency.
   - Order lifecycle: Pending -> Settled; Edit pending order (items, qty, payment); Cancel order (soft delete / purge from active & analytics).
   - Price change immutability (order items store captured unit price at time of order).
   - Analytics metrics formulas: per-item quantity, per-item revenue, daily gross sales, payment method breakdown (Cash, UPI, Card), strictly excluding cancelled orders and unsettled orders.
   - PIN authentication rules: reception access control, server-side data API enforcement, lock duration / session validity, kitchen view unauthenticated read-only access.
   - Kitchen live update (<5s without manual refresh) and audio alert event mechanism.
   - Mobile viewport constraints (375px width, zero horizontal scroll, one-handed phone ergonomics).
5. Document all acceptance criteria with verifiable pass/fail definitions.

Deliverables:
- Maintain your liveness in d:\kotha&coffee\.agents\teamwork\spec_miner_survey\progress.md with timestamps.
- Write your comprehensive specification and feature inventory in d:\kotha&coffee\.agents\teamwork\spec_miner_survey\handoff.md.
- Send a completion message back to me (the orchestrator) with a summary and the handoff file path.
