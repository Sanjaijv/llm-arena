import { auth } from "@clerk/nextjs/server";

import {
  getLeaderboard,
  type LeaderboardScope,
} from "@/features/leaderboard/server/leaderboard";
import { Leaderboard } from "@/features/leaderboard/ui/leaderboard";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ scope?: string | string[] }>;
}>) {
  const [{ userId }, parameters] = await Promise.all([auth(), searchParams]);
  const scope: LeaderboardScope =
    parameters.scope === "personal" ? "personal" : "global";
  const entries = await getLeaderboard(scope, userId);

  return (
    <Leaderboard
      entries={entries}
      isAuthenticated={userId !== null}
      scope={scope}
    />
  );
}
