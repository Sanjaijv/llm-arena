"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import {
  comparisonResponseSchema,
  modelStreamEventSchema,
  threadSnapshotSchema,
  type ComparisonResponse,
  type ModelStreamEvent,
  type ThreadSnapshot,
} from "@/features/arena/contract";
import type { FreeModel } from "@/features/model-catalog/contract";

import styles from "./arena.module.css";

type UiRun = ThreadSnapshot["turns"][number]["runs"][number];
type UiTurn = ThreadSnapshot["turns"][number];
type PendingCreation = Readonly<{ signature: string; requestId: string }>;

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

const readErrorMessage = async (response: Response): Promise<string> => {
  const body: unknown = await response.json().catch(() => null);
  return typeof body === "object" && body !== null && "message" in body
    ? String(body.message)
    : "Something went wrong. Please try again.";
};

const formatContext = (tokens: number | null): string => {
  if (tokens === null) {
    return "Unknown context";
  }
  return tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M context`
    : `${Math.round(tokens / 1_000)}K context`;
};

const formatMetric = (value: number | null, suffix: string): string =>
  value === null ? "—" : `${Math.round(value).toLocaleString()}${suffix}`;

const getTokensPerSecond = (run: UiRun): number | null => {
  if (
    run.completionTokens === null ||
    run.durationMs === null ||
    run.timeToFirstTokenMs === null
  ) {
    return null;
  }

  const generationMs = run.durationMs - run.timeToFirstTokenMs;
  return generationMs > 0
    ? run.completionTokens / (generationMs / 1_000)
    : null;
};

const toUiTurn = (comparison: ComparisonResponse): UiTurn => ({
  comparisonId: comparison.comparisonId,
  sequence: comparison.sequence,
  prompt: comparison.prompt,
  voteRunId: null,
  runs: comparison.runs.map((run) => ({
    id: run.id,
    position: run.position,
    model: run.model,
    status: "PENDING",
    content: "",
    resolvedModel: null,
    durationMs: null,
    timeToFirstTokenMs: null,
    completionTokens: null,
    totalTokens: null,
    errorCode: null,
  })),
});

export function Arena({
  models,
  requestedThreadId,
}: Readonly<{
  models: readonly FreeModel[];
  requestedThreadId: string | null;
}>) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(() =>
    models.slice(0, 3).map(({ id }) => id),
  );
  const [prompt, setPrompt] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [turns, setTurns] = useState<readonly UiTurn[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const activeThreadId = useRef<string | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const pendingCreation = useRef<PendingCreation | null>(null);

  const selectedModels = selectedIds
    .map((id) => models.find((model) => model.id === id))
    .filter((model): model is FreeModel => model !== undefined);
  const visibleModels = useMemo(() => {
    const query = modelSearch.trim().toLocaleLowerCase();
    return query
      ? models.filter(
          (model) =>
            model.name.toLocaleLowerCase().includes(query) ||
            model.id.toLocaleLowerCase().includes(query),
        )
      : models;
  }, [modelSearch, models]);
  const hasActiveRun = turns.some((turn) =>
    turn.runs.some((run) => !TERMINAL_STATUSES.has(run.status)),
  );

  const updateRun = (runId: string, update: (run: UiRun) => UiRun) => {
    setTurns((current) =>
      current.map((turn) => ({
        ...turn,
        runs: turn.runs.map((run) => (run.id === runId ? update(run) : run)),
      })),
    );
  };

  const applyStreamEvent = (runId: string, event: ModelStreamEvent) => {
    switch (event.type) {
      case "started":
        updateRun(runId, (run) => ({ ...run, status: "STREAMING" }));
        break;
      case "delta":
        updateRun(runId, (run) => ({
          ...run,
          status: "STREAMING",
          content: run.content + event.text,
        }));
        break;
      case "complete":
        updateRun(runId, (run) => ({
          ...run,
          status: "COMPLETED",
          resolvedModel: event.model,
          durationMs: event.durationMs,
          timeToFirstTokenMs: event.timeToFirstTokenMs,
          completionTokens: event.usage.completionTokens,
          totalTokens: event.usage.totalTokens,
          errorCode: null,
        }));
        break;
      case "error":
        updateRun(runId, (run) => ({
          ...run,
          status: "FAILED",
          errorCode: event.code,
        }));
        break;
      default:
        event satisfies never;
    }
  };

  const streamRun = async (runId: string) => {
    const abortController = new AbortController();
    controllers.current.set(runId, abortController);
    let sawTerminalEvent = false;

    try {
      const response = await fetch(`/api/model-runs/${runId}/stream`, {
        method: "POST",
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(await readErrorMessage(response));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const parseLine = (line: string) => {
        if (!line.trim()) {
          return;
        }
        const event = modelStreamEventSchema.parse(JSON.parse(line));
        if (event.type === "complete" || event.type === "error") {
          sawTerminalEvent = true;
        }
        applyStreamEvent(runId, event);
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(parseLine);
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        parseLine(buffer);
      }

      if (!sawTerminalEvent) {
        throw new Error("The model stream ended before it finished.");
      }
    } catch (error: unknown) {
      if (!abortController.signal.aborted) {
        updateRun(runId, (run) => ({
          ...run,
          status: "FAILED",
          errorCode: run.errorCode ?? "stream_interrupted",
        }));
        setPageError(
          error instanceof Error ? error.message : "A model failed.",
        );
      }
    } finally {
      controllers.current.delete(runId);
    }
  };

  const streamPendingRun = useEffectEvent((runId: string) => {
    void streamRun(runId);
  });

  useEffect(() => {
    if (requestedThreadId === activeThreadId.current) {
      return;
    }

    activeThreadId.current = requestedThreadId;
    pendingCreation.current = null;
    setThreadId(null);
    setTurns([]);
    setPrompt("");
    setPageError(null);
    setIsCreating(false);
    setIsPickerOpen(false);
    setModelSearch("");
    setSelectedIds(models.slice(0, 3).map(({ id }) => id));

    if (!requestedThreadId) {
      return;
    }

    let ignoreResponse = false;

    const loadThread = async () => {
      const response = await fetch(`/api/threads/${requestedThreadId}`);
      if (ignoreResponse) {
        return;
      }
      if (!response.ok) {
        setPageError(await readErrorMessage(response));
        return;
      }

      const thread = threadSnapshotSchema.parse(await response.json());
      setThreadId(thread.id);
      setTurns(thread.turns);
      const pendingRuns = thread.turns.flatMap((turn) =>
        turn.runs.filter(({ status }) => status === "PENDING"),
      );
      pendingRuns.forEach((run) => streamPendingRun(run.id));
    };

    void loadThread();
    return () => {
      ignoreResponse = true;
    };
  }, [models, requestedThreadId]);

  useEffect(() => {
    if (!isPickerOpen) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !pickerRef.current?.contains(target) &&
        !pickerTriggerRef.current?.contains(target)
      ) {
        setIsPickerOpen(false);
        setModelSearch("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPickerOpen(false);
        setModelSearch("");
        pickerTriggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isPickerOpen]);

  const submitPrompt = async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || selectedIds.length === 0 || hasActiveRun) {
      return;
    }

    setIsCreating(true);
    setPageError(null);
    const creationSignature = JSON.stringify({
      threadId,
      prompt: cleanPrompt,
      modelIds: selectedIds,
    });
    const clientRequestId =
      pendingCreation.current?.signature === creationSignature
        ? pendingCreation.current.requestId
        : crypto.randomUUID();
    pendingCreation.current = {
      signature: creationSignature,
      requestId: clientRequestId,
    };

    try {
      const response = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId,
          threadId,
          prompt: cleanPrompt,
          modelIds: selectedIds,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const comparison = comparisonResponseSchema.parse(await response.json());
      activeThreadId.current = comparison.threadId;
      setThreadId(comparison.threadId);
      setTurns((current) => [...current, toUiTurn(comparison)]);
      pendingCreation.current = null;
      setPrompt("");
      router.replace(`/?thread=${encodeURIComponent(comparison.threadId)}`);
      comparison.runs.forEach((run) => void streamRun(run.id));
    } catch (error: unknown) {
      setPageError(
        error instanceof Error
          ? error.message
          : "The comparison could not be started.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const castVote = async (comparisonId: string, runId: string) => {
    setPageError(null);
    const response = await fetch(`/api/comparisons/${comparisonId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedRunId: runId }),
    });

    if (!response.ok) {
      setPageError(await readErrorMessage(response));
      return;
    }

    setTurns((current) =>
      current.map((turn) =>
        turn.comparisonId === comparisonId
          ? { ...turn, voteRunId: runId }
          : turn,
      ),
    );
  };

  const cancelRun = async (runId: string) => {
    setPageError(null);
    const response = await fetch(`/api/model-runs/${runId}/stream`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setPageError(await readErrorMessage(response));
      return;
    }

    controllers.current.get(runId)?.abort();
    updateRun(runId, (run) => ({
      ...run,
      status: "CANCELLED",
      errorCode: "client_cancelled",
    }));
  };

  const addModel = (modelId: string) => {
    if (selectedIds.includes(modelId) || selectedIds.length >= 3) {
      return;
    }

    setSelectedIds((current) =>
      current.includes(modelId) || current.length >= 3
        ? current
        : [...current, modelId],
    );
    if (selectedIds.length === 2) {
      setIsPickerOpen(false);
      setModelSearch("");
    }
  };

  const removeModel = (modelId: string) => {
    setSelectedIds((current) => current.filter((id) => id !== modelId));
  };

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Arena</p>
          <h2>Compare answers, not logos.</h2>
          <p>
            Send one prompt to up to three free models. Every answer streams and
            fails independently.
          </p>
        </div>
        <span className={styles.liveBadge}>Live free models</span>
      </header>

      <section className={styles.promptCard} aria-labelledby="prompt-heading">
        <div className={styles.cardHeading}>
          <div>
            <span>01</span>
            <div>
              <h3 id="prompt-heading">Choose your models</h3>
              <p>Up to three, validated against OpenRouter when you send.</p>
            </div>
          </div>
          <small>{selectedIds.length} of 3</small>
        </div>

        <div className={styles.chips}>
          {selectedModels.map((model) => (
            <span key={model.id}>
              <i aria-hidden="true" />
              {model.name}
              <button
                type="button"
                aria-label={`Remove ${model.name}`}
                disabled={hasActiveRun}
                onClick={() => removeModel(model.id)}
              >
                ×
              </button>
            </span>
          ))}
          <button
            ref={pickerTriggerRef}
            type="button"
            aria-expanded={isPickerOpen}
            aria-controls="model-picker"
            disabled={
              (selectedIds.length >= 3 && !isPickerOpen) || hasActiveRun
            }
            onClick={() => {
              setIsPickerOpen((open) => !open);
              if (isPickerOpen) {
                setModelSearch("");
              }
            }}
          >
            + Add model
          </button>
        </div>

        {isPickerOpen && (
          <div
            ref={pickerRef}
            id="model-picker"
            className={styles.picker}
            role="dialog"
            aria-label="Choose a free model"
          >
            <label>
              <span className="sr-only">Search free models</span>
              <input
                type="search"
                value={modelSearch}
                placeholder="Search free models…"
                onChange={(event) => setModelSearch(event.target.value)}
              />
            </label>
            <div className={styles.pickerList}>
              {visibleModels.map((model) => {
                const selected = selectedIds.includes(model.id);
                return (
                  <button
                    key={model.id}
                    type="button"
                    disabled={selected || selectedIds.length >= 3}
                    onClick={() => addModel(model.id)}
                  >
                    <span>
                      <strong>{model.name}</strong>
                      <small>{model.id}</small>
                    </span>
                    <span>
                      {selected
                        ? "Selected"
                        : formatContext(model.contextLength)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className={styles.promptLabel} htmlFor="arena-prompt">
          <span>Your prompt</span>
          <small>{prompt.length.toLocaleString()} / 8,000</small>
        </label>
        <textarea
          id="arena-prompt"
          rows={4}
          maxLength={8_000}
          value={prompt}
          disabled={hasActiveRun || isCreating || models.length === 0}
          placeholder="Ask something worth comparing…"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submitPrompt();
            }
          }}
        />
        <div className={styles.promptFooter}>
          <p>
            {hasActiveRun
              ? "Wait for this turn to settle before sending a follow-up."
              : "Ctrl/⌘ + Enter to send."}
          </p>
          <button
            type="button"
            disabled={
              isCreating ||
              hasActiveRun ||
              !prompt.trim() ||
              selectedIds.length === 0
            }
            onClick={() => void submitPrompt()}
          >
            {isCreating
              ? "Starting…"
              : `Send to ${selectedIds.length} model${selectedIds.length === 1 ? "" : "s"}`}
          </button>
        </div>
        {pageError && (
          <p className={styles.pageError} role="alert">
            {pageError}
          </p>
        )}
      </section>

      <section className={styles.turns} aria-label="Model comparisons">
        {turns.length === 0 ? (
          <div className={styles.emptyState}>
            <span>A/B/C</span>
            <h3>Ready for a prompt</h3>
            <p>Independent response cards will appear here.</p>
          </div>
        ) : (
          turns.map((turn) => (
            <Turn
              key={turn.comparisonId}
              turn={turn}
              onCancel={(runId) => void cancelRun(runId)}
              onVote={(runId) => void castVote(turn.comparisonId, runId)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function Turn({
  turn,
  onCancel,
  onVote,
}: Readonly<{
  turn: UiTurn;
  onCancel: (runId: string) => void;
  onVote: (runId: string) => void;
}>) {
  const allSettled = turn.runs.every((run) =>
    TERMINAL_STATUSES.has(run.status),
  );
  const completedCount = turn.runs.filter(
    ({ status }) => status === "COMPLETED",
  ).length;
  const canVote = allSettled && completedCount >= 2 && !turn.voteRunId;

  return (
    <article className={styles.turn}>
      <header className={styles.turnHeading}>
        <div>
          <p className={styles.eyebrow}>Turn {turn.sequence}</p>
          <h3>{turn.prompt}</h3>
        </div>
        <span>{turn.runs.length} models</span>
      </header>
      <div className={styles.answerGrid}>
        {turn.runs.map((run, index) => {
          const isWinner = turn.voteRunId === run.id;
          const speed = getTokensPerSecond(run);
          return (
            <section
              key={run.id}
              className={`${styles.answerCard} ${isWinner ? styles.winner : ""}`}
            >
              <header>
                <span className={styles.letter}>
                  {String.fromCharCode(65 + index)}
                </span>
                <div>
                  <h4>{run.model.name}</h4>
                  <p>{run.model.id}</p>
                </div>
                <small data-status={run.status.toLowerCase()}>
                  {isWinner ? "Winner" : run.status.toLocaleLowerCase()}
                </small>
              </header>

              <div className={styles.answerBody} aria-live="polite">
                {run.content ? (
                  <p>{run.content}</p>
                ) : run.status === "FAILED" ? (
                  <p className={styles.runError}>
                    This model did not return a usable answer.
                  </p>
                ) : run.status === "CANCELLED" ? (
                  <p className={styles.runError}>
                    This response was cancelled.
                  </p>
                ) : (
                  <div
                    className={styles.skeleton}
                    aria-label="Waiting for response"
                  >
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>

              {(run.status === "PENDING" || run.status === "STREAMING") && (
                <button
                  className={styles.cancelButton}
                  type="button"
                  onClick={() => onCancel(run.id)}
                >
                  Cancel this model
                </button>
              )}

              <dl className={styles.metrics}>
                <div>
                  <dt>TTFT</dt>
                  <dd>{formatMetric(run.timeToFirstTokenMs, " ms")}</dd>
                </div>
                <div>
                  <dt>Speed</dt>
                  <dd>{speed === null ? "—" : `${speed.toFixed(1)} tok/s`}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{formatMetric(run.totalTokens, " tokens")}</dd>
                </div>
              </dl>

              {(canVote || isWinner) && run.status === "COMPLETED" && (
                <button
                  className={styles.voteButton}
                  type="button"
                  disabled={isWinner}
                  onClick={() => onVote(run.id)}
                >
                  {isWinner ? "Selected winner" : "Vote for this answer"}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {allSettled && completedCount < 2 && (
        <p className={styles.voteNotice}>
          At least two models must answer successfully before a vote can be
          cast.
        </p>
      )}
    </article>
  );
}
