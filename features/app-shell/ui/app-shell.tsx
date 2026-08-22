"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import {
  THREAD_HISTORY_CHANGED_EVENT,
  threadListSchema,
  type ThreadList,
} from "@/features/arena/contract";

import styles from "./app-shell.module.css";

type IconName =
  "arena" | "chevron" | "close" | "leaderboard" | "menu" | "models" | "new";

const NAVIGATION = [
  { href: "/", label: "Arena", icon: "arena" },
  { href: "/models", label: "Models", icon: "models" },
  { href: "/leaderboard", label: "Leaderboard", icon: "leaderboard" },
] as const;

const formatThreadDate = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [threads, setThreads] = useState<ThreadList>([]);
  const [threadsOwnerId, setThreadsOwnerId] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");

  const routeThreadId = pathname.startsWith("/threads/")
    ? pathname.slice("/threads/".length).split("/")[0]
    : null;
  const activeThreadId = routeThreadId ?? searchParams.get("thread");
  const visibleThreads = isSignedIn && threadsOwnerId === userId ? threads : [];
  const activeThread = visibleThreads.find(({ id }) => id === activeThreadId);
  const isThreadView = pathname === "/" || routeThreadId !== null;
  const pageTitle =
    pathname === "/models"
      ? "Model catalog"
      : pathname === "/leaderboard"
        ? "Leaderboard"
        : (activeThread?.title ??
          (routeThreadId ? "Shared comparison" : "Untitled comparison"));

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
    if (!isLoaded || !isSignedIn || !userId) {
      return;
    }

    let currentRequest: AbortController | null = null;

    const loadThreads = async () => {
      currentRequest?.abort();
      const request = new AbortController();
      currentRequest = request;
      setHistoryState("loading");

      try {
        const response = await fetch("/api/threads", {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) {
          throw new Error("Thread history could not be loaded.");
        }
        const parsed = threadListSchema.safeParse(await response.json());
        if (!parsed.success) {
          throw new Error("Thread history returned an invalid response.");
        }
        setThreads(parsed.data);
        setThreadsOwnerId(userId);
        setHistoryState("loaded");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setHistoryState("error");
      }
    };

    void loadThreads();
    window.addEventListener(THREAD_HISTORY_CHANGED_EVENT, loadThreads);

    return () => {
      currentRequest?.abort();
      window.removeEventListener(THREAD_HISTORY_CHANGED_EVENT, loadThreads);
    };
  }, [activeThreadId, isLoaded, isSignedIn, userId]);

  useEffect(() => {
    const startNewComparison = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsMenuOpen(false);
        router.push("/");
      }
    };

    document.addEventListener("keydown", startNewComparison);
    return () => document.removeEventListener("keydown", startNewComparison);
  }, [router]);

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
            const isActive =
              pathname === item.href ||
              (item.href === "/" && routeThreadId !== null);
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
                  href={`/threads/${encodeURIComponent(thread.id)}`}
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
            {isSignedIn &&
              historyState === "loading" &&
              visibleThreads.length === 0 && (
                <p className={styles.historyMessage}>Loading your threads…</p>
              )}
            {isSignedIn && historyState === "error" && (
              <p className={styles.historyMessage} role="status">
                History is unavailable right now.
              </p>
            )}
          </div>
        </section>

        {isSignedIn &&
          historyState === "loaded" &&
          visibleThreads.length === 0 && (
            <div className={styles.sidebarFootnote}>
              <span aria-hidden="true" />
              <p>
                <strong>No saved threads</strong>
                Your first comparison will appear here.
              </p>
            </div>
          )}

        <div className={styles.mobileAccount}>
          <span>Account</span>
          {isLoaded && isSignedIn ? (
            <UserButton />
          ) : isLoaded ? (
            <SignInButton mode="modal">
              <button className={styles.mobileSignInButton} type="button">
                Sign in
              </button>
            </SignInButton>
          ) : (
            <small>Loading…</small>
          )}
        </div>
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
            <div
              className={`${styles.modelRecords} ${activeThread.modelRecords.length > 3 ? styles.modelRecordsCompact : ""}`}
              aria-label="Model win records"
            >
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
            ) : isLoaded ? (
              <SignInButton mode="modal">
                <button type="button">Sign in</button>
              </SignInButton>
            ) : (
              <span className={styles.accountPlaceholder} aria-hidden="true" />
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
