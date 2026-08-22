import "server-only";

import type { ThreadSnapshot } from "@/features/arena/contract";
import { prisma } from "@/features/database/server/client";

import { isModelRunActive } from "./model-runs";

const reconcileStaleRuns = async (
  userId: string,
  threadId: string,
): Promise<void> => {
  const staleBefore = new Date(Date.now() - 3 * 60_000);
  const staleRuns = (
    await prisma.modelRun.findMany({
      where: {
        comparison: { threadId, userId, status: "IN_PROGRESS" },
        status: "STREAMING",
        startedAt: { lt: staleBefore },
      },
      select: { id: true, comparisonId: true },
    })
  ).filter(({ id }) => !isModelRunActive(id));

  if (staleRuns.length === 0) {
    return;
  }

  const completedAt = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.modelRun.updateMany({
      where: {
        id: { in: staleRuns.map(({ id }) => id) },
        status: "STREAMING",
        startedAt: { lt: staleBefore },
      },
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

export const getThread = async (
  threadId: string,
  viewerUserId: string | null = null,
): Promise<Readonly<{ snapshot: ThreadSnapshot; isOwner: boolean }> | null> => {
  if (viewerUserId !== null) {
    await reconcileStaleRuns(viewerUserId, threadId);
  }
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
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
    isOwner: viewerUserId !== null && thread.userId === viewerUserId,
    snapshot: {
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
    },
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
        orderBy: { sequence: "asc" },
        select: {
          runs: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              requestedModel: true,
              model: { select: { displayName: true } },
            },
          },
          vote: {
            select: {
              selectedRunId: true,
            },
          },
        },
      },
    },
  });

  return threads.map((thread) => {
    const wins = thread.comparisons
      .flatMap((comparison) =>
        comparison.runs.map((run) => ({
          run,
          isWinner: comparison.vote?.selectedRunId === run.id,
        })),
      )
      .reduce<
        Readonly<Record<string, Readonly<{ label: string; wins: number }>>>
      >((records, { run, isWinner }) => {
        const current = records[run.requestedModel];
        return {
          ...records,
          [run.requestedModel]: {
            label: run.model?.displayName ?? run.requestedModel,
            wins: (current?.wins ?? 0) + Number(isWinner),
          },
        };
      }, {});

    return {
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updatedAt,
      modelRecords: Object.entries(wins).map(([id, record]) => ({
        id,
        ...record,
      })),
    };
  });
};
