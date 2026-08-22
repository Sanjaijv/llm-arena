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
  const models = await getFreeModelCatalog().catch((error: unknown) => {
    console.error("Arena model catalog failed to load", error);
    return [];
  });

  return <Arena models={models} requestedThreadId={requestedThreadId} />;
}
