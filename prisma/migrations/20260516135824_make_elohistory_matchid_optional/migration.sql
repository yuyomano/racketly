-- DropForeignKey
ALTER TABLE "elo_history" DROP CONSTRAINT "elo_history_matchId_fkey";

-- AlterTable
ALTER TABLE "elo_history" ALTER COLUMN "matchId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "elo_history" ADD CONSTRAINT "elo_history_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
