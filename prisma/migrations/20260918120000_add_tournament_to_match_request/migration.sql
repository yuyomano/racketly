-- AlterTable
ALTER TABLE "match_requests" ADD COLUMN     "tournamentId" TEXT;

-- AddForeignKey
ALTER TABLE "match_requests" ADD CONSTRAINT "match_requests_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
