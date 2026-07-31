/**
 * Formats a Date or ISO string into a human-readable string in the specified workspace timezone.
 */
export function formatInWorkspaceTimezone(
  dateInput: string | Date | null | undefined,
  timeZone: string = 'Asia/Kolkata',
  opts?: { includeSeconds?: boolean; dateOnly?: boolean }
): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  const activeZone = timeZone || 'Asia/Kolkata';

  if (opts?.dateOnly) {
    return d.toLocaleDateString('en-US', {
      timeZone: activeZone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return d.toLocaleString('en-US', {
    timeZone: activeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(opts?.includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  });
}

/**
 * Frontend Schedule Detection Helper
 */
export function parseFilenameScheduleFrontend(filename: string, defaultSlotTime = '20:00') {
  if (!filename) return { isMatch: false, error: 'Invalid filename' };
  let cleanName = filename.replace(/\.[^/.]+$/, '').toLowerCase().replace(/\s+/g, '');
  cleanName = cleanName.replace(/[\(\-_]?(final|copy|v\d+|\d+)[\)]?$/gi, (match) => {
    if (/final|copy|v\d+/i.test(match) || /\(\d+\)/.test(match)) return '';
    return match;
  });
  const regex = /^([0-9]{1,2})(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)([0-9]{2}|[0-9]{4})?$/;
  const match = cleanName.match(regex);
  if (!match) return { isMatch: false, error: 'Unable to detect schedule' };
  const day = parseInt(match[1], 10);
  const monthStr = match[2];
  const timeDigits = match[3];
  if (day < 1 || day > 31) return { isMatch: false, error: 'Invalid filename date' };

  const monthNames: Record<string, string> = {
    jan: 'January', january: 'January', feb: 'February', february: 'February',
    mar: 'March', march: 'March', apr: 'April', april: 'April', may: 'May',
    jun: 'June', june: 'June', jul: 'July', july: 'July', aug: 'August', august: 'August',
    sep: 'September', sept: 'September', september: 'September', oct: 'October', october: 'October',
    nov: 'November', november: 'November', dec: 'December', december: 'December'
  };

  let hour: number;
  let minute: number;
  if (!timeDigits) {
    const [dH, dM] = (defaultSlotTime || '20:00').split(':').map(Number);
    hour = dH ?? 20; minute = dM ?? 0;
  } else if (timeDigits.length === 2) {
    hour = parseInt(timeDigits, 10); minute = 0;
  } else {
    hour = parseInt(timeDigits.slice(0, 2), 10); minute = parseInt(timeDigits.slice(2, 4), 10);
  }

  // Reject invalid hour > 23 or minute > 59 completely
  if (isNaN(hour) || hour < 0 || hour > 23 || isNaN(minute) || minute < 0 || minute > 59) {
    return { isMatch: false, error: 'Invalid filename time.' };
  }

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const monthName = monthNames[monthStr] || monthStr;
  return { isMatch: true, formattedText: `${day} ${monthName} @ ${pad(hour)}:${pad(minute)}` };
}
