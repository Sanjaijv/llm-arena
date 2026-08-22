-- CreateEnum
CREATE TYPE "ComparisonStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ModelRunStatus" AS ENUM ('PENDING', 'STREAMING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "models" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "providerModelId" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "models_provider_nonempty" CHECK (btrim("provider") <> ''),
    CONSTRAINT "models_provider_model_id_nonempty" CHECK (btrim("providerModelId") <> ''),
    CONSTRAINT "models_display_name_nonempty" CHECK (btrim("displayName") <> '')
);

-- CreateTable
CREATE TABLE "comparisons" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(255) NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" "ComparisonStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "comparisons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comparisons_user_id_nonempty" CHECK (btrim("userId") <> ''),
    CONSTRAINT "comparisons_prompt_length" CHECK (char_length(btrim("prompt")) BETWEEN 1 AND 8000),
    CONSTRAINT "comparisons_lifecycle" CHECK (
        ("status" = 'IN_PROGRESS' AND "completedAt" IS NULL)
        OR ("status" IN ('COMPLETED', 'FAILED', 'CANCELLED') AND "completedAt" IS NOT NULL)
    ),
    CONSTRAINT "comparisons_completion_order" CHECK ("completedAt" IS NULL OR "completedAt" >= "createdAt")
);

-- CreateTable
CREATE TABLE "model_runs" (
    "id" TEXT NOT NULL,
    "comparisonId" TEXT NOT NULL,
    "modelId" TEXT,
    "position" INTEGER NOT NULL,
    "requestedModel" VARCHAR(255) NOT NULL,
    "status" "ModelRunStatus" NOT NULL DEFAULT 'PENDING',
    "content" TEXT,
    "providerRequestId" VARCHAR(255),
    "durationMs" INTEGER,
    "timeToFirstTokenMs" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "costUsd" DECIMAL(18,12),
    "errorCode" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "model_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "model_runs_requested_model_nonempty" CHECK (btrim("requestedModel") <> ''),
    CONSTRAINT "model_runs_position_nonnegative" CHECK ("position" >= 0),
    CONSTRAINT "model_runs_duration_nonnegative" CHECK ("durationMs" IS NULL OR "durationMs" >= 0),
    CONSTRAINT "model_runs_first_token_nonnegative" CHECK ("timeToFirstTokenMs" IS NULL OR "timeToFirstTokenMs" >= 0),
    CONSTRAINT "model_runs_first_token_within_duration" CHECK ("durationMs" IS NULL OR "timeToFirstTokenMs" IS NULL OR "timeToFirstTokenMs" <= "durationMs"),
    CONSTRAINT "model_runs_prompt_tokens_nonnegative" CHECK ("promptTokens" IS NULL OR "promptTokens" >= 0),
    CONSTRAINT "model_runs_completion_tokens_nonnegative" CHECK ("completionTokens" IS NULL OR "completionTokens" >= 0),
    CONSTRAINT "model_runs_total_tokens_nonnegative" CHECK ("totalTokens" IS NULL OR "totalTokens" >= 0),
    CONSTRAINT "model_runs_token_total" CHECK ("totalTokens" IS NULL OR "promptTokens" IS NULL OR "completionTokens" IS NULL OR "promptTokens" + "completionTokens" <= "totalTokens"),
    CONSTRAINT "model_runs_cost_nonnegative" CHECK ("costUsd" IS NULL OR "costUsd" >= 0),
    CONSTRAINT "model_runs_lifecycle" CHECK (
        ("status" IN ('PENDING', 'STREAMING') AND "completedAt" IS NULL)
        OR ("status" IN ('COMPLETED', 'FAILED', 'CANCELLED') AND "completedAt" IS NOT NULL)
    ),
    CONSTRAINT "model_runs_start_state" CHECK (
        ("status" = 'PENDING' AND "startedAt" IS NULL)
        OR ("status" IN ('STREAMING', 'COMPLETED', 'FAILED') AND "startedAt" IS NOT NULL)
        OR "status" = 'CANCELLED'
    ),
    CONSTRAINT "model_runs_completion_order" CHECK ("completedAt" IS NULL OR "startedAt" IS NULL OR "completedAt" >= "startedAt"),
    CONSTRAINT "model_runs_completed_result" CHECK (
        "status" <> 'COMPLETED'
        OR (
            "modelId" IS NOT NULL
            AND "content" IS NOT NULL
            AND "durationMs" IS NOT NULL
            AND "promptTokens" IS NOT NULL
            AND "completionTokens" IS NOT NULL
            AND "totalTokens" IS NOT NULL
            AND "costUsd" IS NOT NULL
        )
    ),
    CONSTRAINT "model_runs_error_state" CHECK (
        ("status" = 'FAILED' AND "errorCode" IS NOT NULL AND btrim("errorCode") <> '')
        OR ("status" <> 'FAILED' AND "errorCode" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "comparisonId" TEXT NOT NULL,
    "comparisonStatus" "ComparisonStatus" NOT NULL DEFAULT 'COMPLETED',
    "selectedRunId" TEXT NOT NULL,
    "selectedRunStatus" "ModelRunStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "votes_completed_comparison" CHECK ("comparisonStatus" = 'COMPLETED'),
    CONSTRAINT "votes_completed_run" CHECK ("selectedRunStatus" = 'COMPLETED')
);

-- CreateIndex
CREATE INDEX "models_isActive_idx" ON "models"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "models_provider_providerModelId_key" ON "models"("provider", "providerModelId");

-- CreateIndex
CREATE INDEX "comparisons_userId_createdAt_idx" ON "comparisons"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "comparisons_status_createdAt_idx" ON "comparisons"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "comparisons_id_status_key" ON "comparisons"("id", "status");

-- CreateIndex
CREATE INDEX "model_runs_modelId_status_completedAt_idx" ON "model_runs"("modelId", "status", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "model_runs_comparisonId_position_key" ON "model_runs"("comparisonId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "model_runs_id_comparisonId_status_key" ON "model_runs"("id", "comparisonId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "votes_comparisonId_key" ON "votes"("comparisonId");

-- CreateIndex
CREATE UNIQUE INDEX "votes_comparisonId_comparisonStatus_key" ON "votes"("comparisonId", "comparisonStatus");

-- CreateIndex
CREATE UNIQUE INDEX "votes_selectedRunId_comparisonId_selectedRunStatus_key" ON "votes"("selectedRunId", "comparisonId", "selectedRunStatus");

-- AddForeignKey
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "comparisons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_comparisonId_comparisonStatus_fkey" FOREIGN KEY ("comparisonId", "comparisonStatus") REFERENCES "comparisons"("id", "status") ON DELETE CASCADE ON UPDATE CASCADE;

-- A composite foreign key prevents a vote from selecting an incomplete run or a run from another comparison.
ALTER TABLE "votes" ADD CONSTRAINT "votes_selectedRunId_comparisonId_selectedRunStatus_fkey" FOREIGN KEY ("selectedRunId", "comparisonId", "selectedRunStatus") REFERENCES "model_runs"("id", "comparisonId", "status") ON DELETE CASCADE ON UPDATE CASCADE;
