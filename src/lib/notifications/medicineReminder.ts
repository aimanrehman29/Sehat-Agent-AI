/**
 * medicineReminder.ts — Client-side medicine reminder & browser notification service.
 *
 * Stores medication schedules in localStorage, requests browser notification
 * permission, and runs a periodic check to fire notifications at the correct
 * scheduled times.
 *
 * Usage (React):
 *   import { requestNotificationPermission, scheduleMedicineReminders, getActiveReminders } from "@/lib/notifications/medicineReminder";
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MedicineReminder {
  id: string;
  medicine_name: string;
  dosage: string;
  scheduled_times: string[]; // "HH:MM" 24-hour format
  times_per_day: number;
  summary_en?: string;
  summary_ur?: string;
  created_at: string;
  active: boolean;
}

interface StoredReminders {
  reminders: MedicineReminder[];
  last_check: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "sehat_medicine_reminders";
const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds
let _intervalId: ReturnType<typeof setInterval> | null = null;

// ─── Permission ────────────────────────────────────────────────────────────

/**
 * Request browser notification permission.
 * Returns "granted" | "denied" | "default".
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined") return "denied";

  if (!("Notification" in window)) {
    console.warn("[MedicineReminder] Browser does not support notifications");
    return "denied";
  }

  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";

  const result = await Notification.requestPermission();
  return result;
}

// ─── Storage ───────────────────────────────────────────────────────────────

function getStored(): StoredReminders {
  if (typeof window === "undefined") return { reminders: [], last_check: "" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { reminders: [], last_check: "" };
    return JSON.parse(raw) as StoredReminders;
  } catch {
    return { reminders: [], last_check: "" };
  }
}

function saveStored(data: StoredReminders): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Get all active reminders. */
export function getActiveReminders(): MedicineReminder[] {
  return getStored().reminders.filter((r) => r.active);
}

/** Remove a reminder by ID. */
export function removeReminder(id: string): void {
  const stored = getStored();
  stored.reminders = stored.reminders.filter((r) => r.id !== id);
  saveStored(stored);
}

/** Clear all reminders. */
export function clearAllReminders(): void {
  saveStored({ reminders: [], last_check: new Date().toISOString() });
}

// ─── Scheduling ────────────────────────────────────────────────────────────

/**
 * Store medicine reminders in localStorage and start the notification checker.
 * Accepts an array of medicines with scheduled_times (HH:MM format).
 */
export function scheduleMedicineReminders(
  medicines: Array<{
    medicine_name: string;
    dosage: string;
    scheduled_times: string[];
    times_per_day?: number;
    summary_en?: string;
    summary_ur?: string;
  }>,
): MedicineReminder[] {
  const stored = getStored();
  const newReminders: MedicineReminder[] = [];

  for (const med of medicines) {
    if (!med.scheduled_times || med.scheduled_times.length === 0) continue;

    const reminder: MedicineReminder = {
      id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      medicine_name: med.medicine_name,
      dosage: med.dosage,
      scheduled_times: med.scheduled_times,
      times_per_day: med.times_per_day ?? med.scheduled_times.length,
      summary_en: med.summary_en,
      summary_ur: med.summary_ur,
      created_at: new Date().toISOString(),
      active: true,
    };

    // Avoid duplicates: skip if same medicine + same times already exist
    const isDuplicate = stored.reminders.some(
      (r) =>
        r.active &&
        r.medicine_name === reminder.medicine_name &&
        JSON.stringify(r.scheduled_times) === JSON.stringify(reminder.scheduled_times),
    );
    if (!isDuplicate) {
      stored.reminders.push(reminder);
      newReminders.push(reminder);
    }
  }

  saveStored(stored);
  startNotificationChecker();
  return newReminders;
}

// ─── Notification Checker ──────────────────────────────────────────────────

/**
 * Start the periodic checker that fires notifications at scheduled times.
 * Safe to call multiple times — only one interval will be active.
 */
export function startNotificationChecker(): void {
  if (typeof window === "undefined") return;
  if (_intervalId !== null) return; // Already running

  _intervalId = setInterval(() => {
    checkAndNotify();
  }, CHECK_INTERVAL_MS);

  // Also check immediately
  checkAndNotify();
}

/** Stop the periodic checker. */
export function stopNotificationChecker(): void {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

function checkAndNotify(): void {
  if (typeof window === "undefined") return;
  if (Notification.permission !== "granted") return;

  const stored = getStored();
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const notifiedKey = `sehat_notified_${todayKey}`;
  const alreadyNotified: string[] = JSON.parse(localStorage.getItem(notifiedKey) || "[]");

  for (const reminder of stored.reminders) {
    if (!reminder.active) continue;

    for (const time of reminder.scheduled_times) {
      const notifId = `${reminder.id}_${time}`;
      if (alreadyNotified.includes(notifId)) continue;

      // Fire if current time matches within the 30-second window
      if (currentTime === time) {
        fireNotification(reminder, time);
        alreadyNotified.push(notifId);
      }
    }
  }

  localStorage.setItem(notifiedKey, JSON.stringify(alreadyNotified));
  stored.last_check = now.toISOString();
  saveStored(stored);

  // Clean up old notification logs (keep only today)
  cleanupOldLogs();
}

function fireNotification(reminder: MedicineReminder, time: string): void {
  const titleEn = `Time to take ${reminder.medicine_name} (${reminder.dosage})`;
  const titleUr = `${reminder.medicine_name} (${reminder.dosage}) لینے کا وقت ہو گیا ہے`;

  const body = `${titleEn}\n${titleUr}\n\nScheduled: ${time}`;

  try {
    const notification = new Notification(`💊 ${reminder.medicine_name}`, {
      body,
      icon: "/logo.png",
      badge: "/logo.png",
      tag: `medicine-${reminder.id}-${time}`,
      requireInteraction: true,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    console.warn("[MedicineReminder] Failed to fire notification:", error);
  }
}

function cleanupOldLogs(): void {
  if (typeof window === "undefined") return;
  const now = new Date();
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("sehat_notified_") && key !== `sehat_notified_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}
