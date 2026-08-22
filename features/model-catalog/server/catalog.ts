import "server-only";

import type { Model as OpenRouterModel } from "@openrouter/sdk/models/model.js";

import type { FreeModel } from "@/features/model-catalog/contract";
import { openRouter } from "@/features/model-connection/server/openrouter";

const isZero = (value: string | undefined): boolean =>
  value === undefined || Number(value) === 0;

const isSpecificFreeTextModel = (model: OpenRouterModel): boolean =>
  model.id.endsWith(":free") &&
  model.id !== "openrouter/free" &&
  Number(model.pricing.prompt) === 0 &&
  Number(model.pricing.completion) === 0 &&
  isZero(model.pricing.request) &&
  model.architecture.outputModalities.includes("text");

const toFreeModel = (model: OpenRouterModel): FreeModel => ({
  id: model.id,
  name: model.name,
  provider: model.id.split("/")[0] || "OpenRouter",
  contextLength: model.contextLength,
  promptPrice: 0,
  completionPrice: 0,
});

export const getFreeModelCatalog = async (): Promise<readonly FreeModel[]> => {
  const page = await openRouter.models.list(
    {
      limit: 1_000,
      outputModalities: "text",
      sort: "context-high-to-low",
    },
    { timeoutMs: 8_000 },
  );

  return page.result.data
    .filter(isSpecificFreeTextModel)
    .map(toFreeModel)
    .sort(
      (left, right) =>
        (right.contextLength ?? 0) - (left.contextLength ?? 0) ||
        left.name.localeCompare(right.name),
    );
};

export const validateFreeModelSelection = async (
  selectedIds: readonly string[],
): Promise<readonly FreeModel[] | null> => {
  const catalog = await getFreeModelCatalog();
  const byId = new Map(catalog.map((model) => [model.id, model]));
  const selected = selectedIds.map((id) => byId.get(id));

  return selected.every((model): model is FreeModel => model !== undefined)
    ? selected
    : null;
};
