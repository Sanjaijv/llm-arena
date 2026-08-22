import styles from "./placeholder-screens.module.css";

const PLACEHOLDER_MODELS = ["Model A", "Model B", "Model C"] as const;

const MODEL_ROWS = [
  { name: "Free model placeholder", context: "—", provider: "Provider" },
  { name: "Free model placeholder", context: "—", provider: "Provider" },
  { name: "Free model placeholder", context: "—", provider: "Provider" },
  { name: "Free model placeholder", context: "—", provider: "Provider" },
] as const;

const LEADERBOARD_ROWS = [
  { rank: 1, model: "Model A", record: "won 14 of 20", width: "70%" },
  { rank: 2, model: "Model B", record: "won 11 of 19", width: "58%" },
  { rank: 3, model: "Model C", record: "won 8 of 17", width: "47%" },
] as const;

export function ArenaPlaceholder() {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Arena</p>
          <h2>Compare answers, not logos.</h2>
          <p>
            Send one prompt to up to three models. Read every answer, then pick
            the one that helped most.
          </p>
        </div>
        <PreviewBadge label="Shell preview" />
      </header>

      <section className={styles.promptCard} aria-labelledby="prompt-heading">
        <div className={styles.promptCardHeader}>
          <div>
            <span className={styles.stepNumber}>01</span>
            <div>
              <h3 id="prompt-heading">Choose your models</h3>
              <p>Placeholder selections until the live catalog is available.</p>
            </div>
          </div>
          <span className={styles.limit}>3 of 3</span>
        </div>

        <div className={styles.modelChips}>
          {PLACEHOLDER_MODELS.map((model) => (
            <span key={model}>
              <i aria-hidden="true" />
              {model}
              <button type="button" disabled aria-label={`Remove ${model}`}>
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            disabled
            title="Live model catalog arrives in Feature 5"
          >
            + Add model
          </button>
        </div>

        <label className={styles.promptLabel} htmlFor="prompt-preview">
          <span>Your prompt</span>
          <small>Preview input</small>
        </label>
        <textarea
          id="prompt-preview"
          rows={4}
          placeholder="Ask something worth comparing..."
        />
        <div className={styles.promptFooter}>
          <p>
            <span aria-hidden="true">●</span> Live streaming and persistence
            arrive in Feature 6.
          </p>
          <button type="button" disabled>
            Send to 3 models <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section className={styles.answers} aria-labelledby="answers-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Responses</p>
            <h3 id="answers-heading">Waiting for a prompt</h3>
          </div>
          <p>Each model will stream independently.</p>
        </div>
        <div className={styles.answerGrid}>
          {PLACEHOLDER_MODELS.map((model, index) => (
            <article className={styles.answerCard} key={model}>
              <header>
                <div>
                  <span>{String.fromCharCode(65 + index)}</span>
                  <div>
                    <h4>{model}</h4>
                    <p>Free model placeholder</p>
                  </div>
                </div>
                <small>Idle</small>
              </header>
              <div className={styles.emptyAnswer}>
                <span aria-hidden="true">
                  {String.fromCharCode(65 + index)}
                </span>
                <p>The response will appear here.</p>
                <small>
                  Speed and token metrics follow the completed answer.
                </small>
              </div>
              <footer>
                <span>TTFT —</span>
                <span>Tokens/sec —</span>
                <span>Total —</span>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ModelsPlaceholder() {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Model catalog</p>
          <h2>Browse every free model.</h2>
          <p>
            Compare context windows and providers before adding a model to the
            arena.
          </p>
        </div>
        <PreviewBadge label="Feature 5 placeholder" />
      </header>

      <section className={styles.catalogCard}>
        <div className={styles.catalogToolbar}>
          <label>
            <span aria-hidden="true">⌕</span>
            <input type="search" placeholder="Search models" disabled />
          </label>
          <button type="button" disabled>
            Context window ↓
          </button>
        </div>
        <div className={styles.catalogNotice}>
          <span aria-hidden="true">i</span>
          Live OpenRouter catalog data will replace these rows in Feature 5.
        </div>
        <div
          className={styles.modelTable}
          role="table"
          aria-label="Model placeholders"
        >
          <div className={styles.tableHead} role="row">
            <span role="columnheader">Model</span>
            <span role="columnheader">Context</span>
            <span role="columnheader">Pricing</span>
          </div>
          {MODEL_ROWS.map((model, index) => (
            <div className={styles.tableRow} role="row" key={index}>
              <span role="cell">
                <i aria-hidden="true" />
                <span>
                  <strong>{model.name}</strong>
                  <small>{model.provider}</small>
                </span>
              </span>
              <span role="cell">{model.context}</span>
              <span role="cell">
                <b>Free</b>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function LeaderboardPlaceholder() {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Leaderboard</p>
          <h2>The answers people actually chose.</h2>
          <p>Win records lead; speed and response timing add useful context.</p>
        </div>
        <PreviewBadge label="Feature 9 placeholder" />
      </header>

      <section className={styles.leaderboardCard}>
        <div className={styles.boardToolbar}>
          <div aria-label="Leaderboard scope">
            <button className={styles.selectedSegment} type="button">
              Global
            </button>
            <button type="button" disabled>
              Personal
            </button>
          </div>
          <span>Placeholder records</span>
        </div>
        <div className={styles.rankingList}>
          {LEADERBOARD_ROWS.map((row) => (
            <article
              className={row.rank === 1 ? styles.firstPlace : ""}
              key={row.rank}
            >
              <span className={styles.rank}>0{row.rank}</span>
              <div className={styles.rankModel}>
                <i aria-hidden="true" />
                <div>
                  <strong>{row.model}</strong>
                  <small>Free model placeholder</small>
                </div>
              </div>
              <div className={styles.winRecord}>
                <strong>{row.record}</strong>
                <span>
                  <i style={{ width: row.width }} />
                </span>
              </div>
              <dl>
                <div>
                  <dt>Avg. speed</dt>
                  <dd>— tok/s</dd>
                </div>
                <div>
                  <dt>Avg. TTFT</dt>
                  <dd>— ms</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PreviewBadge({ label }: Readonly<{ label: string }>) {
  return (
    <span className={styles.previewBadge}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}
