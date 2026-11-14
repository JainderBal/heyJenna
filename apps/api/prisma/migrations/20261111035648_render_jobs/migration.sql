-- CreateTable
CREATE TABLE "render_jobs" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "layout_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "worker_id" TEXT,
    "image_key" TEXT,
    "model_key" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "render_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "render_jobs_status_created_at_idx" ON "render_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "render_jobs_layout_id_idx" ON "render_jobs"("layout_id");
