import { auth } from "@clerk/nextjs/server";
import { request as arcjetRequest } from "@arcjet/next";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getThread } from "@/features/arena/server/threads";
import { Arena } from "@/features/arena/ui/arena";
import { getFreeModelCatalog } from "@/features/model-catalog/server/catalog";
import { protectPublicThreadRequest } from "@/features/model-connection/server/public-thread-protection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared comparison | LLM Arena",
  description: "See how free AI models answered the same prompt.",
};

export default async function ThreadPage({
  params,
}: PageProps<"/threads/[threadId]">) {
  const [{ threadId }, { userId }, request] = await Promise.all([
    params,
    auth(),
    arcjetRequest(),
  ]);
  const decision = await protectPublicThreadRequest(request, "page");

  if (decision?.isDenied()) {
    notFound();
  }

  const thread = await getThread(threadId, userId);

  if (!thread) {
    notFound();
  }

  const models = thread.isOwner
    ? await getFreeModelCatalog().catch((error: unknown) => {
        console.error("Arena model catalog failed to load", error);
        return [];
      })
    : [];

  return (
    <Arena
      canInteract={thread.isOwner}
      initialThread={thread.snapshot}
      models={models}
    />
  );
}
