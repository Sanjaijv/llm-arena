import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Arena } from "@/features/arena/ui/arena";
import { getFreeModelCatalog } from "@/features/model-catalog/server/catalog";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ thread?: string | string[] }>;
}>) {
  const { thread } = await searchParams;
  const requestedThreadId = typeof thread === "string" ? thread : null;
  if (requestedThreadId) {
    redirect(`/threads/${encodeURIComponent(requestedThreadId)}`);
  }
  const { isAuthenticated } = await auth();
  const models = await getFreeModelCatalog().catch((error: unknown) => {
    console.error("Arena model catalog failed to load", error);
    return [];
  });

  return (
    <Arena canInteract={isAuthenticated} initialThread={null} models={models} />
  );
}
