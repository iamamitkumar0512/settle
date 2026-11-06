# AI usage

Settle was built with Claude Code during ETHGlobal Mumbai 2026.

- **Planning and design:** the build plan, architecture and UI design were developed with Claude.
- **Code:** Claude Code wrote the contracts, tests, web app, scripts and documentation, working one
  step at a time from Amit Kumar's direction.
- **Decisions and review:** Amit chose the product scope, reviewed each step, ran deployments and made
  all commits.
- **Testing:** contract tests run against the real test USDT on a fork. Claude Code tested app
  flows on local forks with a scripted wallet and with read-only checks against the live contract.
  Amit ran the real payments and refunds on Whitechain Sepolia.
- **Feedback files:** `WHITECHAIN_FEEDBACK.md` and `arkiv/friction.md` record problems hit during
  the build. Claude Code drafted them from the session's own log, and Amit reviewed them.
