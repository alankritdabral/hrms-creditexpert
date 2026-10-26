/**
 * Indian Standard Time (IST - UTC+05:30) Date & Time Utilities
 * Standardizes attendance calculations, check-in timestamps, and displays to IST.
 */

export const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Returns current or provided date formatted as "YYYY-MM-DD" strictly in Indian Standard Time (IST).
 */
export function getISTDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Returns 24-hour time "HH:mm" strictly in Indian Standard Time (IST).
 * Used for server-side policy cutoff comparison.
 */
export function getIST24HourTime(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value.padStart(2, "0") || "00";
  const minute = parts.find((p) => p.type === "minute")?.value.padStart(2, "0") || "00";

  return `${hour}:${minute}`;
}

/**
 * Formats a time string (e.g. "10:15", "14:30"), an ISO date, or a Date object
 * into a clean 12-hour IST format (e.g. "10:15 AM", "02:30 PM").
 */
export function formatISTTime12(timeOrDate?: string | Date | null): string {
  if (!timeOrDate || timeOrDate === "--" || timeOrDate === "—") return "—";

  if (typeof timeOrDate === "string") {
    const trimmed = timeOrDate.trim();

    // Already formatted with AM/PM
    if (/am|pm/i.test(trimmed)) {
      return trimmed;
    }

    // Matches HH:mm or HH:mm:ss (24-hour)
    const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2];
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      return `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
    }

    // Try parsing as ISO date
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: IST_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(parsed);
    }

    return trimmed;
  }

  if (timeOrDate instanceof Date && !isNaN(timeOrDate.getTime())) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: IST_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(timeOrDate);
  }

  return "—";
}

/**
 * Formats full current time with seconds in IST (e.g. "01:27:15 PM IST").
 */
export function getISTLiveTimeWithSeconds(date: Date = new Date()): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: IST_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(date) + " IST"
  );
}

/**
 * Evaluates whether a punch time (in IST "HH:mm") is Late according to policy.
 */
export function evaluateLateArrivalIST(
  punchTimeIST: string,
  startTime = "10:00",
  graceMinutes = 15
): boolean {
  const [startH, startM] = startTime.split(":").map(Number);
  const [curH, curM] = punchTimeIST.split(":").map(Number);

  if (isNaN(curH) || isNaN(curM)) return false;

  const punchMinutes = curH * 60 + curM;
  const cutoffMinutes = (startH || 10) * 60 + (startM || 0) + (graceMinutes ?? 15);

  return punchMinutes > cutoffMinutes;
}
