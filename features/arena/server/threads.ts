import "server-only";

import type { ThreadSnapshot } from "@/features/arena/contract";
import { prisma } from "@/features/database/server/client";

const reconcileStaleRuns = async (
  userId: string,
  threadId: string,
): Promise<void> => {
  const staleBefore = new Date(Date.now() - 3 * 60_000);
  const staleRuns = await prisma.modelRun.findMany({
    where: {
      comparison: { threadId, userId, status: "IN_PROGRESS" },
      status: "STREAMING",
      startedAt: { lt: staleBefore },
    },
    select: { id: true, comparisonId: true },
  });

  if (staleRuns.length === 0) {
    return;
  }

  const completedAt = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.modelRun.updateMany({
      where: { id: { in: staleRuns.map(({ id }) => id) } },
      data: {
        status: "CANCELLED",
        completedAt,
      },
    });

    for (const comparisonId of new Set(
      staleRuns.map(({ comparisonId }) => comparisonId),
    )) {
      const remaining = await transaction.modelRun.count({
        where: {
          comparisonId,
          status: { in: ["PENDING", "STREAMING"] },
        },
      });

      if (remaining === 0) {
        const [completed, failed] = await Promise.all([
          transaction.modelRun.count({
            where: { comparisonId, status: "COMPLETED" },
          }),
          transaction.modelRun.count({
            where: { comparisonId, status: "FAILED" },
          }),
        ]);
        const status =
          completed > 0 ? "COMPLETED" : failed > 0 ? "FAILED" : "CANCELLED";
        await transaction.comparison.update({
          where: { id: comparisonId },
          data: { status, completedAt },
        });
      }
    }
  });
};

export const getThreadSnapshot = async (
  userId: string,
  threadId: string,
): Promise<ThreadSnapshot | null> => {
  await reconcileStaleRuns(userId, threadId);
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, userId },
    include: {
      comparisons: {
        orderBy: { sequence: "asc" },
        include: {
          vote: true,
          runs: {
            orderBy: { position: "asc" },
            include: { model: true },
          },
        },
      },
    },
  });

  if (!thread) {
    return null;
  }

  return {
    id: thread.id,
    title: thread.title,
    turns: thread.comparisons.map((comparison) => ({
      comparisonId: comparison.id,
      sequence: comparison.sequence,
      prompt: comparison.prompt,
      voteRunId: comparison.vote?.selectedRunId ?? null,
      runs: comparison.runs.map((run) => ({
        id: run.id,
        position: run.position,
        model: {
          id: run.requestedModel,
          name: run.model?.displayName ?? run.requestedModel,
          provider: run.requestedModel.split("/")[0] || "OpenRouter",
          contextLength: run.model?.contextLength ?? null,
          promptPrice: 0,
          completionPrice: 0,
        },
        status: run.status,
        content: run.content ?? "",
        resolvedModel: run.resolvedModel,
        durationMs: run.durationMs,
        timeToFirstTokenMs: run.timeToFirstTokenMs,
        completionTokens: run.completionTokens,
        totalTokens: run.totalTokens,
        errorCode: run.errorCode,
      })),
    })),
  };
};

export const listThreads = async (userId: string) => {
  const threads = await prisma.thread.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      comparisons: {
        where: { vote: { isNot: null } },
        select: {
          vote: {
            select: {
              selectedRun: {
                select: {
                  requestedModel: true,
                  model: { select: { displayName: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  return threads.map((thread) => {
    const wins = new Map<string, { label: string; wins: number }>();
    for (const comparison of thread.comparisons) {
      const selectedRun = comparison.vote?.selectedRun;
      if (!selectedRun) {
        continue;
      }
      const label =
        selectedRun.model?.displayName ?? selectedRun.requestedModel;
      const current = wins.get(selectedRun.requestedModel);
      wins.set(selectedRun.requestedModel, {
        label,
        wins: (current?.wins ?? 0) + 1,
      });
    }

    return {
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updatedAt,
      modelRecords: [...wins.entries()].map(([id, record]) => ({
        id,
        ...record,
      })),
    };
  });
};
