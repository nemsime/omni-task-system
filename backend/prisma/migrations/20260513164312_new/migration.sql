/*
  Warnings:

  - A unique constraint covering the columns `[userId,taskNumber]` on the table `Task` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `taskNumber` to the `Task` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "taskNumber" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "Task_userId_idx" ON "Task"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_userId_taskNumber_key" ON "Task"("userId", "taskNumber");
