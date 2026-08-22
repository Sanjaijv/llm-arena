import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getThread } from "@/features/arena/server/threads";
import { Arena } from "@/features/arena/ui/arena";
import { getFreeModelCatalog } from "@/features/model-catalog/server/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared comparison | LLM Arena",
  description: "See how free AI models answered the same prompt.",
};

export default async function ThreadPage({
  params,
}: PageProps<"/threads/[threadId]">) {
  const [{ threadId }, { userId }] = await Promise.all([params, auth()]);
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
