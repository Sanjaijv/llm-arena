"use client";

import { SignInButton } from "@clerk/nextjs";

import styles from "./leaderboard.module.css";

export function PersonalLeaderboardSignIn() {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyMark} aria-hidden="true">
        01
      </span>
      <h3>Your picks, ranked.</h3>
      <p>Sign in to see a leaderboard built only from your votes.</p>
      <SignInButton mode="modal">
        <button className={styles.signInButton} type="button">
          Sign in to view yours
        </button>
      </SignInButton>
    </div>
  );
}
