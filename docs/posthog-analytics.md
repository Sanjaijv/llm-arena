# PostHog analytics

## Measurement principles

- Product events are captured after the corresponding database transition, not
  from button clicks.
- Prompt and answer content must never be included in event properties.
- Session replay masks all form inputs and elements marked `data-private`.
- Elements containing prompt or answer text use `ph-no-capture` so autocapture
  does not attach their text to interaction events.
- IDs are used for correlation; model IDs, counts, timing, cost, status, and
  error codes are safe analytics dimensions.

## Event dictionary

| Event                      | Meaning                                 | Primary dimensions                                                                |
| -------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| `prompt_sent`              | A comparison was committed              | `thread_id`, `comparison_id`, `turn_sequence`, `is_new_thread`, `selected_models` |
| `answer_finished`          | One model returned a usable answer      | model, duration, TTFT, tokens                                                     |
| `model_response_failed`    | One model failed or disconnected        | model, status, error code, duration                                               |
| `model_response_cancelled` | The user deliberately cancelled a run   | model and comparison IDs                                                          |
| `comparison_finished`      | Every run in a comparison settled       | outcome counts, duration, `vote_eligible`                                         |
| `vote_cast`                | The user selected a winner              | selected model and position, candidate count                                      |
| `thread_shared`            | The owner copied a share link           | thread ID, method, turn count                                                     |
| `public_thread_viewed`     | A non-owner opened a public thread      | thread ID, source, turn/run/vote counts                                           |
| `$ai_generation`           | One OpenRouter generation settled       | provider/model, latency, TTFT, tokens, cost, error                                |
| `$web_vitals`              | PostHog browser performance measurement | LCP, CLS, FCP, INP                                                                |
| `$exception`               | Browser or Next.js server exception     | operation or route context                                                        |

## Hosted PostHog setup

Run `pnpm posthog:setup` to idempotently create or verify the dashboard and its
insights. It reads the private PostHog credentials from `.env.local`, never
prints the key, and validates each query against PostHog after setup.

The hosted dashboard is **Arena product health** in project `568919`.

Create a dashboard named **Arena product health** with these insights:

1. **Core value funnel** — `prompt_sent` → `comparison_finished` filtered to
   `vote_eligible = true` → `vote_cast`. Use a 24-hour conversion window and
   break down by `is_new_thread` and `selected_model_count`.
2. **Comparison reliability** — trend `comparison_finished`, broken down by
   `status`; also graph average `completed_model_count`, `failed_model_count`,
   and `cancelled_model_count`.
3. **Model reliability** — `$ai_generation` count and error percentage broken
   down by `$ai_requested_model`; add p50/p95 `$ai_latency` and
   `$ai_time_to_first_token` plus total `$ai_total_cost_usd`.
4. **Winner selection** — `vote_cast` broken down by `selected_model`. Compare
   against `answer_finished` participation before interpreting this as a win
   rate.
5. **Sharing conversion** — `thread_shared` → `public_thread_viewed`, joined or
   filtered by `thread_id`; break public views down by `share_source`.
6. **Retention** — weekly retention where the start and return event are
   `prompt_sent`; add a second view using `vote_cast` as the return event.
7. **Frontend performance** — p75 LCP, CLS, and INP from `$web_vitals`, broken
   down by pathname and device type.

After at least seven days of representative production traffic, add alerts for:

- `$ai_generation` error percentage materially above its seven-day baseline.
- p95 `$ai_latency` or `$ai_time_to_first_token` above the agreed UX budget.
- `comparison_finished` with `vote_eligible = false` above its baseline.
- Core funnel conversion falling materially below its seven-day baseline.

Then enable the model-reliability and web-vitals scouts described in
`posthog-self-driving-report.md`. Do not set static alert thresholds before a
baseline exists.

## Deliberately excluded

Do not capture raw prompts, raw answers, streaming deltas, or model-picker
clicks. Do not enable revenue, group analytics, experiments, surveys, support,
warehouse, or log/APM products until the application has the corresponding
workflow or a concrete decision that requires them.
