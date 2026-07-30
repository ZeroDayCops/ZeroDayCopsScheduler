const MONTH_MAP = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Deterministic Filename Schedule Parser.
 *
 * Algorithm:
 *  1. Extract filename & remove extension
 *  2. Convert to lowercase
 *  3. Remove spaces
 *  4. Remove extra suffixes like (final), (copy), (v2), (1), _copy, -final
 *  5. Regex parse: ^([0-9]{1,2})(jan|...)([0-9]{2}|[0-9]{4})?$
 *  6. Validate Day (1-31), Hour (0-23), Minute (0-59)
 *  7. Never round, never invent, never replace parsed time values.
 *
 * @param {string} filename - The original file name (e.g. "27july2243.png")
 * @param {string} defaultSlotTime - Workspace default publish time in HH:mm (e.g. "20:00")
 * @param {string} timezone - Workspace timezone string (e.g. "Asia/Kolkata")
 * @returns {object} Parsed schedule or explicit validation error object
 */
function parseFilenameSchedule(filename, defaultSlotTime = '20:00', timezone = 'Asia/Kolkata') {
  if (!filename || typeof filename !== 'string') {
    return { isMatch: false, error: 'Invalid filename input' };
  }

  // 1. Extract filename without extension
  let cleanName = filename.replace(/\.[^/.]+$/, '');

  // 2. Convert lowercase & 3. Remove spaces
  cleanName = cleanName.toLowerCase().replace(/\s+/g, '');

  // 4. Remove common extra suffixes e.g. (final), (copy), (v2), (1), _copy, -final, -v2
  cleanName = cleanName.replace(/[\(\-_]?(final|copy|v\d+|\d+)[\)]?$/gi, (match) => {
    // Only strip suffix if it's explicitly a suffix like (final), (copy), (v2), (1)
    // Avoid stripping 2243 or 0815 if they are part of the main pattern
    if (/final|copy|v\d+/i.test(match) || /\(\d+\)/.test(match)) {
      return '';
    }
    return match;
  });

  // 5. Strict Regex:
  // Day: [0-9]{1,2}
  // Month: jan|january|...
  // Optional Time: [0-9]{2} or [0-9]{4}
  const regex = /^([0-9]{1,2})(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)([0-9]{2}|[0-9]{4})?$/;
  const match = cleanName.match(regex);

  if (!match) {
    return {
      isMatch: false,
      error: 'Unable to detect schedule. Supported examples: 27july, 27july20, 27july2243, 27july0815',
    };
  }

  const day = parseInt(match[1], 10);
  const monthStr = match[2];
  const timeDigits = match[3]; // undefined, 2 digits ("20"), or 4 digits ("2243")

  // Validate Day
  if (day < 1 || day > 31 || MONTH_MAP[monthStr] === undefined) {
    return { isMatch: false, error: 'Invalid filename date.' };
  }

  const monthIndex = MONTH_MAP[monthStr];

  // Parse Hour and Minute deterministically
  let hour;
  let minute;

  if (!timeDigits) {
    // No Time -> Use Workspace Default
    const [defH, defM] = (defaultSlotTime || '20:00').split(':').map(Number);
    hour = defH !== undefined ? defH : 20;
    minute = defM !== undefined ? defM : 0;
  } else if (timeDigits.length === 2) {
    // 2 Digits e.g. "20" -> 20:00, "09" -> 09:00, "14" -> 14:00
    hour = parseInt(timeDigits, 10);
    minute = 0;
  } else if (timeDigits.length === 4) {
    // 4 Digits e.g. "2243" -> 22:43, "0815" -> 08:15, "1730" -> 17:30
    hour = parseInt(timeDigits.slice(0, 2), 10);
    minute = parseInt(timeDigits.slice(2, 4), 10);
  }

  // Strict Validation: Hour (0-23), Minute (0-59)
  if (isNaN(hour) || hour < 0 || hour > 23 || isNaN(minute) || minute < 0 || minute > 59) {
    return { isMatch: false, error: 'Invalid filename time.' };
  }

  // Calculate year deterministically
  const now = new Date();
  let year = now.getFullYear();
  let scheduledDate = new Date(year, monthIndex, day, hour, minute, 0, 0);

  // If date in current year has already passed, schedule for next year
  if (scheduledDate < now) {
    scheduledDate = new Date(year + 1, monthIndex, day, hour, minute, 0, 0);
    year += 1;
  }

  // Formatted display strings (24-hour HH:mm format)
  const monthName = MONTH_NAMES[monthIndex];
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  const timeFormatted = `${pad(hour)}:${pad(minute)}`;
  const formattedText = `${day} ${monthName} @ ${timeFormatted}`;

  return {
    isMatch: true,
    day,
    month: monthStr,
    monthIndex,
    year,
    hour,
    minute,
    timeFormatted,
    scheduledDate,
    formattedText,
    timezone,
  };
}

module.exports = { parseFilenameSchedule };
