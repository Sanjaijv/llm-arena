"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import styles from "./app-shell.module.css";

type IconName =
  "arena" | "chevron" | "close" | "leaderboard" | "menu" | "models" | "new";

const NAVIGATION = [
  { href: "/", label: "Arena", icon: "arena" },
  { href: "/models", label: "Models", icon: "models" },
  { href: "/leaderboard", label: "Leaderboard", icon: "leaderboard" },
] as const;

type ThreadListItem = Readonly<{
  id: string;
  title: string;
  updatedAt: string;
  modelRecords: readonly Readonly<{
    id: string;
    label: string;
    wins: number;
  }>[];
}>;

const formatThreadDate = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [threads, setThreads] = useState<readonly ThreadListItem[]>([]);

  const activeThreadId = searchParams.get("thread");
  const visibleThreads = isSignedIn ? threads : [];
  const activeThread = visibleThreads.find(({ id }) => id === activeThreadId);
  const isThreadView = pathname === "/";
  const pageTitle =
    pathname === "/models"
      ? "Model catalog"
      : pathname === "/leaderboard"
        ? "Leaderboard"
        : (activeThread?.title ?? "Untitled comparison");

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const loadThreads = async () => {
      const response = await fetch("/api/threads");
      if (!response.ok) {
        return;
      }
      const body: unknown = await response.json();
      if (Array.isArray(body)) {
        setThreads(
          body.filter(
            (thread): thread is ThreadListItem =>
              typeof thread === "object" &&
              thread !== null &&
              "id" in thread &&
              "title" in thread &&
              "updatedAt" in thread &&
              "modelRecords" in thread,
          ),
        );
      }
    };

    void loadThreads();
  }, [activeThreadId, isSignedIn]);

  const selectThread = () => {
    setIsMenuOpen(false);
  };

  const startNewThread = () => {
    setIsMenuOpen(false);
  };

  return (
    <div className={styles.shell}>
      <button
        className={`${styles.overlay} ${isMenuOpen ? styles.overlayVisible : ""}`}
        type="button"
        aria-label="Close navigation"
        tabIndex={isMenuOpen ? 0 : -1}
        onClick={() => setIsMenuOpen(false)}
      />

      <aside
        id="app-navigation"
        className={`${styles.sidebar} ${isMenuOpen ? styles.sidebarOpen : ""}`}
        aria-label="Application navigation"
      >
        <div className={styles.brandRow}>
          <Link className={styles.brand} href="/" onClick={startNewThread}>
            <span aria-hidden="true">A</span>
            <span>
              LLM <strong>ARENA</strong>
            </span>
          </Link>
          <button
            className={styles.closeButton}
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsMenuOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>

        <Link
          className={styles.newThreadButton}
          href="/"
          onClick={startNewThread}
        >
          <Icon name="new" />
          New comparison
          <span aria-hidden="true">⌘ K</span>
        </Link>

        <nav className={styles.primaryNav} aria-label="Workspace">
          {NAVIGATION.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setIsMenuOpen(false)}
              >
                <Icon name={item.icon} />
                {item.label}
                {isActive && (
                  <span className={styles.activeMark} aria-hidden="true" />
                )}
              </Link>
            );
          })}
        </nav>

        <section className={styles.history} aria-labelledby="history-heading">
          <div className={styles.historyHeading}>
            <h2 id="history-heading">Recent threads</h2>
            <span>{isSignedIn ? "Synced" : "Sign in"}</span>
          </div>
          <div className={styles.threadList}>
            {visibleThreads.map((thread) => {
              const isActive = thread.id === activeThreadId && isThreadView;
              return (
                <Link
                  key={thread.id}
                  className={`${styles.threadButton} ${isActive ? styles.threadButtonActive : ""}`}
                  href={`/?thread=${encodeURIComponent(thread.id)}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={selectThread}
                >
                  <span>
                    <strong>{thread.title}</strong>
                    <small>{formatThreadDate(thread.updatedAt)}</small>
                  </span>
                  <Icon name="chevron" />
                </Link>
              );
            })}
          </div>
        </section>

        {isSignedIn && visibleThreads.length === 0 && (
          <div className={styles.sidebarFootnote}>
            <span aria-hidden="true" />
            <p>
              <strong>No saved threads</strong>
              Your first comparison will appear here.
            </p>
          </div>
        )}
      </aside>

      <header className={styles.topbar}>
        <div className={styles.topbarStart}>
          <button
            className={styles.menuButton}
            type="button"
            aria-label="Open navigation"
            aria-controls="app-navigation"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <div className={styles.threadTitle}>
            <span>{isThreadView ? "Current thread" : "Workspace"}</span>
            <h1>{pageTitle}</h1>
          </div>
        </div>

        <div className={styles.topbarEnd}>
          {isThreadView && activeThread && (
            <div className={styles.modelRecords} aria-label="Model win records">
              {activeThread.modelRecords.map((record) => (
                <span
                  key={record.id}
                  title={`${record.label}: ${record.wins} wins`}
                >
                  <i aria-hidden="true" />
                  <b>{record.label}</b>
                  <strong>{record.wins}</strong>
                </span>
              ))}
            </div>
          )}

          <div className={styles.account}>
            {isLoaded && isSignedIn ? (
              <UserButton />
            ) : (
              <SignInButton mode="modal">
                <button type="button">Sign in</button>
              </SignInButton>
            )}
          </div>
        </div>
      </header>

      <main className={styles.content}>{children}</main>
    </div>
  );
}

function Icon({ name }: Readonly<{ name: IconName }>) {
  const paths: Readonly<Record<IconName, ReactNode>> = {
    arena: (
      <>
        <path d="M4 5.5h16v13H4z" />
        <path d="M8 9h8M8 12h5M8 15h7" />
      </>
    ),
    chevron: <path d="m9 6 6 6-6 6" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    leaderboard: (
      <>
        <path d="M5 20v-7h4v7M10 20V7h4v13M15 20V4h4v16" />
        <path d="M3 20h18" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    models: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
      </>
    ),
    new: <path d="M12 5v14M5 12h14" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <g
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[name]}
      </g>
    </svg>
  );
}
