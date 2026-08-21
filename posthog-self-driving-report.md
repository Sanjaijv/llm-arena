# PostHog Self-driving Setup Report

Generated: 2026-08-21

## Summary

PostHog Self-driving has been configured for LLM Arena. Session Replay, Error Tracking, and Support are enabled server-side; five native signal sources and both Replay Vision monitors are armed and emitting to the inbox. Scout findings will start appearing in the [Self-driving inbox](https://us.posthog.com/project/568919/inbox) within ~30 minutes.

---

## AI data processing

**Approved.** Organization-level AI data processing consent was confirmed before this run began.

---

## GitHub

**Connected during this run.**

- Integration id: `237187`
- Account: Sanjaijv
- Connected at: 2026-08-21T04:35:49Z

Self-driving will use this integration to research findings in the repository and open fix PRs.

---

## Products enabled

| Product | Status | Notes |
|---|---|---|
| Session Replay | **Follow-up required** | `products-enable` tool unavailable on this deploy. Enable manually: Settings → Session replay → "Record user sessions". The `posthog.init` in `instrumentation-client.ts` already has `disable_session_recording: false` — no code change needed. |
| Error Tracking | **Follow-up required** | Same tool unavailable. Enable manually: Settings → Error tracking → "Enable exception autocapture". The init has no `capture_exceptions: false` override — no code change needed. |
| Support (Conversations) | **Follow-up required** | Enable manually: Product sidebar → Support/Conversations. Tickets only flow once an inbound channel (email / inbox / Slack) is also connected. |

> The server-side product enables are independent from the signal source wiring done in step 4. Sources are already enabled and will become active automatically once the products are switched on — no second setup needed.

---

## Signal sources

| Source product | Source type | Action | Config id |
|---|---|---|---|
| `signals_scout` | `cross_source_issue` | **On by default** — no row needed; scout findings reach the inbox automatically | — |
| `health_checks` | `health_issue` | **Enabled** | `01a0229c-415d-76f8-a463-e882217b64c8` |
| `error_tracking` | `issue_created` | **Enabled** | `01a0229c-46a3-70eb-90d1-c4fd990739ca` |
| `error_tracking` | `issue_reopened` | **Enabled** | `01a0229c-4bf1-7d56-9d0b-75581821d1e8` |
| `error_tracking` | `issue_spiking` | **Enabled** | `01a0229c-4ec6-7c01-8678-1fe120df8615` |
| `session_replay` | `session_analysis_cluster` | **Enabled** (sample rate 10%) | `01a0229c-5425-7d88-8c2a-b654e57476a3` |
| `conversations` | `ticket` | **Enabled** (dormant until inbound channel connected) | `01a0229c-5640-7982-b2a6-8ee9fe89f905` |
| `llm_analytics` | — | **Skipped** — internal-only, no $ai_* events captured yet |  |
| `logs` | — | **Skipped** — not a v1 responder |  |
| `replay_vision` | — | **Skipped** — self-authorizing via `emits_signals` on the scanner; no row needed |  |

---

## Connected tools

No external tools were selected. All connected-tool sources skipped (not used).

---

## Scout troop

**Run budget:** 100 runs/day (max 3 per tick), 0 used today.
**Banner:** "Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."

### Enabled (5 scouts)

| Scout | Why enabled |
|---|---|
| `signals-scout-general` | Cross-product correlations and surfaces no specialist covers — always on |
| `signals-scout-product-analytics` | Core funnel watch: prompt submission → model response → vote. Primary revenue surface once events land. |
| `signals-scout-web-analytics` | Next.js web app with posthog-js autocapture; session volume and traffic channel health |
| `signals-scout-health-checks` | Fresh PostHog setup; instrumentation health issues are highly actionable right now |
| `signals-scout-observability-gaps` | Minimal event coverage today; will surface what needs dashboards and alerts as events grow |

### Disabled (22 scouts)

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | **Covered by native source** — error tracking sources in step 4 handle this; not a re-enable candidate |
| `signals-scout-session-replay` | **Covered by native source** — session replay source in step 4 handles this; not a re-enable candidate |
| `signals-scout-feature-flags` | No active feature flags in the codebase yet; enable if/when flags are added |
| `signals-scout-experiments` | No active A/B experiments; enable when experiments start |
| `signals-scout-surveys` | No surveys configured; enable if surveys are added |
| `signals-scout-revenue-analytics` | No payment SDK (Stripe etc.) detected; enable if monetization is added |
| `signals-scout-ai-observability` | No `$ai_*` events captured yet (OpenRouter used but not instrumented via PostHog LLM analytics) |
| `signals-scout-logs` | PostHog logs product not in use |
| `signals-scout-csp-violations` | No Content-Security-Policy reporting configured |
| `signals-scout-customer-analytics` | No group/accounts analytics (B2B) in use |
| `signals-scout-conversations` | Conversations enabled but no inbound channel yet; revisit once tickets flow |
| `signals-scout-data-pipelines` | No CDP destinations or Hog flows configured |
| `signals-scout-data-warehouse` | No external warehouse sources connected |
| `signals-scout-apm` | No OpenTelemetry/APM spans configured |
| `signals-scout-anomaly-detection` | Replaced by more targeted specialists for this project |
| `signals-scout-replay-vision` | No prior scanner observations to trend yet; enable once scanners have run for a few weeks |
| `signals-scout-inbox-validation` | No shipped fixes to validate yet (fresh setup) |
| `signals-scout-insight-alerts` | No insight alerts configured |
| `signals-scout-mcp-tool-calls` | No `$mcp_tool_call` events |
| `signals-scout-revenue-analytics` | No revenue data |
| `signals-scout-skills-store` | Not a priority for a fresh project |
| `signals-scout-tasks` | No task/CI data to watch |
| `signals-scout-web-vitals` | Useful follow-up once `$web_vitals` events are confirmed flowing |

To enable any disabled scout later: PostHog → [Inbox](https://us.posthog.com/project/568919/inbox) → scout settings.

---

## Custom scouts

**None created.** All candidate surfaces failed the 3-filter test at this stage of the project:

| Surface considered | Filter that ruled it out |
|---|---|
| Model reliability (OpenRouter error rate / latency by model) | **Not watchable** — no PostHog events captured for model API calls yet. `stream-response.ts` tracks `durationMs`, `timeToFirstTokenMs`, `cost`, and `error`, but these aren't sent to PostHog. A scout for this surface would run quietly every day until events land. |
| Vote funnel (prompt → vote completion rate) | **Already covered** — `signals-scout-product-analytics` watches saved funnels; once a prompt→vote funnel insight exists, it's covered. |
| Auth/signup funnel | **Already covered** — same as above. |
| Arcjet rate-limit / prompt-injection events | **Not watchable** — Arcjet decisions are not captured as PostHog events. |

**Follow-up:** When `model_response_complete` and `model_response_error` events are added to `features/model-connection/server/stream-response.ts` (with `model`, `durationMs`, `timeToFirstTokenMs`, `cost` as properties), create a custom scout `signals-scout-model-reliability` to watch for OpenRouter provider health regressions.

**Noise escape hatch:** If any enabled scout turns noisy, set `emit: false` on its config in PostHog to switch it to dry-run mode (it still runs and logs, but writes nothing to the inbox).

---

## Replay Vision scanners

Replay Vision scanners are LLMs that watch individual session recordings on a schedule. Each observation lands at half-weight; findings need corroboration before being promoted to an inbox report. Scanners are the only part of this setup that spends Replay Vision quota.

**Note:** No recordings exist yet. Both scanners are armed and will start working the day recordings begin — no second setup needed.

**Note:** The sizing skill (`creating-replay-vision-scanners`) was unavailable on this deploy, so credit spend was not verified against org quota. The briefs are deliberately small (bounded sampling), so projected spend should be a small fraction of the org budget — but verify in [Replay Vision settings](https://us.posthog.com/project/568919/replay-vision) once recordings begin.

| Scanner | What it watches | Query scope | Sampling | Credits/obs | Monthly est. | Status |
|---|---|---|---|---|---|---|
| LLM Arena prompt and response breakage | Visible breakage on the prompt/response flow: error banners, submit button doing nothing, streaming stopping mid-generation, vote buttons unresponsive | Sessions on `$current_url` contains `/` | 50% | 5 | 0 (no recordings yet) | **Created** — `emits_signals: true` |
| LLM Arena prompt flow frustration | Users getting stuck: hammering the submit button, rage-clicking vote buttons, retrying after errors without state clearing | `$rageclick` events only | 100% | 5 | 0 (no recordings yet) | **Created** — `emits_signals: true` |

The two monitors are deliberately disjoint: the breakage monitor owns *where* (URL scope), the frustration monitor owns *what they did* (`$rageclick` gate). This prevents the same session from being scanned by both for overlapping questions.

---

## Follow-ups

- [ ] **Enable Session Replay manually**: PostHog → Settings → Session replay → "Record user sessions"
- [ ] **Enable Error Tracking manually**: PostHog → Settings → Error tracking → "Enable exception autocapture"
- [ ] **Enable Support/Conversations manually**: PostHog → Product sidebar → Support/Conversations
- [ ] **Connect a Conversations inbound channel** (email / inbox / Slack) so support tickets reach the inbox — the `conversations / ticket` source row is already enabled and will activate automatically once a channel exists
- [ ] **Add PostHog events to `features/model-connection/server/stream-response.ts`**: capture `model_response_complete` and `model_response_error` with properties `model`, `durationMs`, `timeToFirstTokenMs`, `cost` — then create a `signals-scout-model-reliability` custom scout to watch for provider health regressions
- [ ] **Verify Replay Vision credit spend** once recordings begin in [Replay Vision settings](https://us.posthog.com/project/568919/replay-vision)
- [ ] **Enable `signals-scout-web-vitals`** once `$web_vitals` events are confirmed flowing from posthog-js
- [ ] **Enable `signals-scout-ai-observability`** if `$ai_*` events are added via PostHog LLM analytics

---

## What happens next

- The scout coordinator picks up fresh configs within ~30 minutes and fires the first runs
- Scout runs draw from the project's daily budget (100 runs/day by default during early access)
- Findings cluster into reports in the [inbox](https://us.posthog.com/project/568919/inbox); immediately-actionable ones can start coding tasks
- Replay Vision scanners scan every 5 minutes once recordings exist; a daily digest is also auto-created for each scanner
