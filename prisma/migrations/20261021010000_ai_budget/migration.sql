-- CreateTable
CREATE TABLE "AiBudget" (
    "month" TEXT NOT NULL,
    "credits" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "AiBudget_pkey" PRIMARY KEY ("month")
);
