/**
 * POST /api/track-a/care-sync/reminders
 *
 * Activate medication reminders for a parsed prescription.
 * Creates MedicationReminder records in the database for each medicine
 * with its cron schedule, enabling push/SMS/voice notification delivery.
 *
 * This endpoint is called by the "Set Medicine Reminders" button in the
 * Care-Sync test UI after a prescription has been parsed.
 */

import { NextResponse } from "next/server";
import { prisma, isDbAvailable } from "@/lib/db";
import {
  ActivateRemindersRequestSchema,
  type ActivateRemindersResponse,
} from "@/lib/validation/care-sync.schema";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const log = createLogger("care-sync-reminders");

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    // ── Validate request ──
    const validated = ActivateRemindersRequestSchema.parse(body);

    // ── Guard: return clean 503 when DB is down ──
    if (!(await isDbAvailable())) {
      log.warn("DB unavailable — cannot activate reminders", {
        prescriptionId: body.prescription_id,
      });
      const fallback: ActivateRemindersResponse = {
        success: false,
        activated_count: 0,
        reminder_ids: [],
        message:
          "Reminder scheduling is temporarily unavailable (database offline). " +
          "Please try again later.",
      };
      return NextResponse.json(fallback, { status: 503 });
    }

    // ── Create MedicationReminder records ──
    const reminderIds: string[] = [];
    let activatedCount = 0;

    for (const medicine of validated.medicines) {
      for (const cronExpr of medicine.cron_expressions) {
        try {
          const reminder = await prisma.medicationReminder.create({
            data: {
              prescriptionId: validated.prescription_id,
              medicineName: medicine.medicine_name,
              userId: validated.user_id,
              cronExpression: cronExpr,
              timezone: medicine.timezone,
              channel: medicine.channel,
              isActive: true,
              nextScheduledAt: calculateNextScheduled(cronExpr),
            },
          });
          reminderIds.push(reminder.id);
          activatedCount++;
        } catch (error) {
          log.warn(`Failed to create reminder for ${medicine.medicine_name}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const response: ActivateRemindersResponse = {
      success: activatedCount > 0,
      activated_count: activatedCount,
      reminder_ids: reminderIds,
      message:
        activatedCount > 0
          ? `${activatedCount} reminder${activatedCount > 1 ? "s" : ""} activated successfully.`
          : "No reminders could be activated. Database may be unavailable.",
    };

    log.info(`Reminders activated: ${activatedCount}`, {
      prescriptionId: validated.prescription_id,
    });

    return NextResponse.json(response, {
      status: activatedCount > 0 ? 200 : 503,
    });
  } catch (error) {
    log.error("Failed to activate reminders", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        success: false,
        activated_count: 0,
        reminder_ids: [],
        message:
          error instanceof Error
            ? error.message
            : "Failed to activate reminders.",
      },
      { status: 500 }
    );
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Calculate the next scheduled datetime from a cron expression.
 * Simple heuristic: parse the hour from the cron and set it for today or tomorrow.
 */
function calculateNextScheduled(cronExpr: string): Date | null {
  try {
    const parts = cronExpr.split(" ");
    if (parts.length < 5) return null;

    const minute = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);
    if (isNaN(hour) || isNaN(minute)) return null;

    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);

    // If the time has already passed today, schedule for tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  } catch {
    return null;
  }
}
