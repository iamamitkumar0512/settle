# AI usage

Settle was built with Claude Code during ETHGlobal Mumbai 2026.

- **Planning and design:** the build plan, architecture and UI design were developed with Claude.
- **Code:** Claude Code wrote the contracts, tests, web app, scripts and documentation, working one
  step at a time from Amit Kumar's direction.
- **Decisions and review:** Amit chose the product scope, reviewed each step, ran deployments and
  decided what was committed.
- **Testing:** contract tests run against the real test USDT on a fork. Claude Code tested app
  flows on local forks with a scripted wallet in a headless browser, and with read-only checks
  against the live contract. It could not test email login, so Amit tested that, and ran the real
  payments and refunds on Whitechain Sepolia.
- **The restock agent:** `apps/agent` uses Claude through the Anthropic API to decide what to
  reorder. That is a runtime use of AI, and it pays with test USDT only.
- **Feedback files:** `WHITECHAIN_FEEDBACK.md` and `arkiv/friction.md` record problems hit during
  the build. Claude Code drafted them from the session's own log, and Amit reviewed them.
