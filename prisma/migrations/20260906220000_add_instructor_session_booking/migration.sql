-- CreateTable
CREATE TABLE "instructor_session_bookings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructor_session_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instructor_session_bookings_sessionId_idx" ON "instructor_session_bookings"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "instructor_session_bookings_sessionId_userId_key" ON "instructor_session_bookings"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "instructor_session_bookings" ADD CONSTRAINT "instructor_session_bookings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "instructor_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_session_bookings" ADD CONSTRAINT "instructor_session_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
