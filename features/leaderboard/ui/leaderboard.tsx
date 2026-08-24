import Link from "next/link";

import type {
  LeaderboardEntry,
  LeaderboardScope,
} from "@/features/leaderboard/server/leaderboard";

import { PersonalLeaderboardSignIn } from "./personal-sign-in";
import styles from "./leaderboard.module.css";

type LeaderboardProps = Readonly<{
  entries: readonly LeaderboardEntry[];
  isAuthenticated: boolean;
  scope: LeaderboardScope;
}>;

const formatSpeed = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)} tok/s`;

const formatTimeToFirstToken = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value).toLocaleString()} ms`;

const getProviderLabel = (entry: LeaderboardEntry): string =>
  entry.provider === "openrouter"
    ? (entry.providerModelId.split("/")[0] ?? entry.provider)
    : entry.provider;

export function Leaderboard({
  entries,
  isAuthenticated,
  scope,
}: LeaderboardProps) {
  const isSignedOutPersonal = scope === "personal" && !isAuthenticated;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Leaderboard</p>
          <h2>The answers people actually chose.</h2>
          <p>Win records lead; speed and response timing add useful context.</p>
        </div>
        <span className={styles.liveBadge}>
          <i aria-hidden="true" />
          Live vote data
        </span>
      </header>

      <section className={styles.leaderboardCard} aria-label="Model rankings">
        <div className={styles.boardToolbar}>
          <nav aria-label="Leaderboard scope">
            <Link
              className={scope === "global" ? styles.selectedSegment : ""}
              href="/leaderboard"
              aria-current={scope === "global" ? "page" : undefined}
            >
              Global
            </Link>
            <Link
              className={scope === "personal" ? styles.selectedSegment : ""}
              href="/leaderboard?scope=personal"
              aria-current={scope === "personal" ? "page" : undefined}
            >
              Personal
            </Link>
          </nav>
          <span>{scope === "personal" ? "Your votes" : "All arena votes"}</span>
        </div>

        {isSignedOutPersonal ? (
          <PersonalLeaderboardSignIn />
        ) : entries.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyMark} aria-hidden="true">
              00
            </span>
            <h3>No ranked models yet.</h3>
            <p>
              {scope === "personal"
                ? "Cast your first vote after comparing two or more answers."
                : "The first completed vote will start the global leaderboard."}
            </p>
            <Link className={styles.arenaLink} href="/">
              Start a comparison <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : (
          <ol className={styles.rankingList}>
            {entries.map((entry, index) => (
              <li
                className={index === 0 ? styles.firstPlace : undefined}
                key={entry.id}
              >
                <span className={styles.rank} aria-label={`Rank ${index + 1}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className={styles.rankModel}>
                  <i aria-hidden="true" />
                  <div>
                    <strong>{entry.displayName}</strong>
                    <small>{getProviderLabel(entry)}</small>
                  </div>
                </div>
                <div className={styles.winRecord}>
                  <strong>
                    won {entry.wins.toLocaleString()} of{" "}
                    {entry.appearances.toLocaleString()}
                  </strong>
                  <span aria-hidden="true">
                    <i style={{ width: `${entry.winRate * 100}%` }} />
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Avg. speed</dt>
                    <dd>{formatSpeed(entry.averageSpeed)}</dd>
                  </div>
                  <div>
                    <dt>Avg. TTFT</dt>
                    <dd>
                      {formatTimeToFirstToken(entry.averageTimeToFirstTokenMs)}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
