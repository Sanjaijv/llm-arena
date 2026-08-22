import { getFreeModelCatalog } from "@/features/model-catalog/server/catalog";
import { ModelsCatalog } from "@/features/model-catalog/ui/models-catalog";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const models = await getFreeModelCatalog().catch((error: unknown) => {
    console.error("Model catalog page failed to load", error);
    return [];
  });

  return <ModelsCatalog models={models} />;
}
