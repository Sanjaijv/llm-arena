import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/features/database/server/client";

type LeaderboardDatabaseRow = Readonly<{
  id: string;
  provider: string;
  providerModelId: string;
  displayName: string;
  wins: number;
  appearances: number;
  averageSpeed: number | null;
  averageTimeToFirstTokenMs: number | null;
}>;

export type LeaderboardEntry = Readonly<{
  id: string;
  provider: string;
  providerModelId: string;
  displayName: string;
  wins: number;
  appearances: number;
  winRate: number;
  averageSpeed: number | null;
  averageTimeToFirstTokenMs: number | null;
}>;

export type LeaderboardScope = "global" | "personal";

const leaderboardFilter = (userId: string | null) =>
  userId === null
    ? Prisma.empty
    : Prisma.sql`AND comparison."userId" = ${userId}`;

export const getLeaderboard = async (
  scope: LeaderboardScope,
  userId: string | null,
): Promise<readonly LeaderboardEntry[]> => {
  if (scope === "personal" && userId === null) {
    return [];
  }

  const rows = await prisma.$queryRaw<LeaderboardDatabaseRow[]>(Prisma.sql`
    SELECT
      model."id",
      model."provider",
      model."providerModelId",
      model."displayName",
      COUNT(*) FILTER (WHERE vote."selectedRunId" = run."id")::integer AS "wins",
      COUNT(*)::integer AS "appearances",
      AVG(
        CASE
          WHEN run."completionTokens" IS NOT NULL
            AND run."durationMs" IS NOT NULL
            AND run."timeToFirstTokenMs" IS NOT NULL
            AND run."durationMs" > run."timeToFirstTokenMs"
          THEN run."completionTokens" * 1000.0
            / (run."durationMs" - run."timeToFirstTokenMs")
          ELSE NULL
        END
      )::double precision AS "averageSpeed",
      AVG(run."timeToFirstTokenMs")::double precision AS "averageTimeToFirstTokenMs"
    FROM "votes" AS vote
    INNER JOIN "comparisons" AS comparison
      ON comparison."id" = vote."comparisonId"
    INNER JOIN "model_runs" AS run
      ON run."comparisonId" = comparison."id"
      AND run."status" = 'COMPLETED'
    INNER JOIN "models" AS model
      ON model."id" = run."modelId"
    WHERE TRUE
      ${leaderboardFilter(scope === "personal" ? userId : null)}
    GROUP BY
      model."id",
      model."provider",
      model."providerModelId",
      model."displayName"
    ORDER BY
      COUNT(*) FILTER (WHERE vote."selectedRunId" = run."id")::double precision
        / COUNT(*) DESC,
      COUNT(*) FILTER (WHERE vote."selectedRunId" = run."id") DESC,
      COUNT(*) DESC,
      model."displayName" ASC,
      model."id" ASC
  `);

  return rows.map((row) => ({
    ...row,
    winRate: row.appearances === 0 ? 0 : row.wins / row.appearances,
  }));
};
