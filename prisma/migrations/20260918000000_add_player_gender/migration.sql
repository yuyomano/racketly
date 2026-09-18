-- CreateEnum
CREATE TYPE "PlayerGender" AS ENUM ('masculino', 'femenino', 'prefiero_no_decir');

-- AlterTable
ALTER TABLE "player_profiles" ADD COLUMN "gender" "PlayerGender";
