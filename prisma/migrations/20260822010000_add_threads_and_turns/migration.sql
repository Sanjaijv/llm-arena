-- CreateTable
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(255) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "threads_user_id_nonempty" CHECK (btrim("userId") <> ''),
    CONSTRAINT "threads_title_nonempty" CHECK (btrim("title") <> '')
);

-- AlterTable
ALTER TABLE "comparisons"
    ADD COLUMN "threadId" TEXT,
    ADD COLUMN "sequence" INTEGER,
    ADD COLUMN "clientRequestId" UUID,
    ADD COLUMN "requestFingerprint" CHAR(64);

-- Preserve any pre-feature rows as one-turn legacy threads.
INSERT INTO "threads" ("id", "userId", "title", "createdAt", "updatedAt")
SELECT
    'legacy_' || "id",
    "userId",
    left(btrim("prompt"), 160),
    "createdAt",
    "updatedAt"
FROM "comparisons";

UPDATE "comparisons"
SET
    "threadId" = 'legacy_' || "id",
    "sequence" = 1,
    "clientRequestId" = (
        substr(md5("id"), 1, 8) || '-' ||
        substr(md5("id"), 9, 4) || '-' ||
        substr(md5("id"), 13, 4) || '-' ||
        substr(md5("id"), 17, 4) || '-' ||
        substr(md5("id"), 21, 12)
    )::uuid,
    "requestFingerprint" = repeat('0', 64);

ALTER TABLE "comparisons"
    ALTER COLUMN "threadId" SET NOT NULL,
    ALTER COLUMN "sequence" SET NOT NULL,
    ALTER COLUMN "clientRequestId" SET NOT NULL,
    ALTER COLUMN "requestFingerprint" SET NOT NULL;

ALTER TABLE "comparisons"
    ADD CONSTRAINT "comparisons_sequence_positive" CHECK ("sequence" > 0),
    ADD CONSTRAINT "comparisons_request_fingerprint" CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$');

ALTER TABLE "model_runs"
    ADD COLUMN "resolvedModel" VARCHAR(255);

ALTER TABLE "models"
    ADD COLUMN "contextLength" INTEGER,
    ADD CONSTRAINT "models_context_length_positive" CHECK ("contextLength" IS NULL OR "contextLength" > 0);

ALTER TABLE "model_runs"
    DROP CONSTRAINT "model_runs_completed_result";

ALTER TABLE "model_runs"
    ADD CONSTRAINT "model_runs_completed_result" CHECK (
        "status" <> 'COMPLETED'
        OR (
            "modelId" IS NOT NULL
            AND "content" IS NOT NULL
            AND "durationMs" IS NOT NULL
        )
    );

-- CreateIndex
CREATE INDEX "threads_userId_updatedAt_idx" ON "threads"("userId", "updatedAt");
CREATE UNIQUE INDEX "comparisons_threadId_sequence_key" ON "comparisons"("threadId", "sequence");
CREATE UNIQUE INDEX "comparisons_userId_clientRequestId_key" ON "comparisons"("userId", "clientRequestId");
CREATE INDEX "comparisons_threadId_sequence_idx" ON "comparisons"("threadId", "sequence");

-- A thread has at most one turn whose model runs are still settling.
CREATE UNIQUE INDEX "comparisons_one_in_progress_per_thread"
ON "comparisons"("threadId")
WHERE "status" = 'IN_PROGRESS';

-- AddForeignKey
ALTER TABLE "comparisons"
ADD CONSTRAINT "comparisons_threadId_fkey"
FOREIGN KEY ("threadId") REFERENCES "threads"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
