import "server-only";

import { captureProductEvent } from "@/features/analytics/server/events";
import { prisma } from "@/features/database/server/client";

export class VoteConflictError extends Error {}
export class VoteEligibilityError extends Error {}

export const castVote = async (
  userId: string,
  comparisonId: string,
  selectedRunId: string,
) => {
  const vote = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id" FROM "comparisons"
      WHERE "id" = ${comparisonId}
      FOR UPDATE
    `;

    const comparison = await transaction.comparison.findFirst({
      where: { id: comparisonId, userId },
      include: { vote: true },
    });

    if (!comparison) {
      throw new VoteEligibilityError("That comparison is not available.");
    }

    if (comparison.vote) {
      if (comparison.vote.selectedRunId === selectedRunId) {
        return { vote: comparison.vote, created: false, analytics: null };
      }

      throw new VoteConflictError("A winner has already been selected.");
    }

    if (comparison.status !== "COMPLETED") {
      throw new VoteEligibilityError(
        "Wait for every selected model to finish before voting.",
      );
    }

    const [selectedRun, completedCount] = await Promise.all([
      transaction.modelRun.findFirst({
        where: {
          id: selectedRunId,
          comparisonId,
          status: "COMPLETED",
        },
      }),
      transaction.modelRun.count({
        where: { comparisonId, status: "COMPLETED" },
      }),
    ]);

    if (!selectedRun || completedCount < 2) {
      throw new VoteEligibilityError(
        "At least two completed answers are required before voting.",
      );
    }

    const createdVote = await transaction.vote.create({
      data: {
        comparisonId,
        selectedRunId,
      },
    });

    return {
      vote: createdVote,
      created: true,
      analytics: {
        threadId: comparison.threadId,
        selectedModel: selectedRun.requestedModel,
        selectedPosition: selectedRun.position,
        candidateCount: completedCount,
      },
    };
  });

  if (vote.created && vote.analytics) {
    await captureProductEvent(userId, "vote_cast", {
      thread_id: vote.analytics.threadId,
      comparison_id: comparisonId,
      selected_model_run_id: selectedRunId,
      selected_model: vote.analytics.selectedModel,
      selected_position: vote.analytics.selectedPosition,
      candidate_count: vote.analytics.candidateCount,
    });
  }

  return vote.vote;
};
