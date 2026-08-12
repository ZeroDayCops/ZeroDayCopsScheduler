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
/**
 * Helper to construct a UTC Date object representing a specific local time in an IANA timezone.
 */
function createDateInTimezone(year, monthIndex, day, hour, minute, timeZone = 'Asia/Kolkata') {
  const localAsUtc = Date.UTC(year, monthIndex, day, hour, minute, 0);
  const dateTest = new Date(localAsUtc);
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(dateTest);
  const p = {};
  parts.forEach(part => { p[part.type] = part.value; });
  let hr = parseInt(p.hour, 10);
  if (hr === 24) hr = 0;
  
  const targetAsUtc = Date.UTC(
    parseInt(p.year, 10),
    parseInt(p.month, 10) - 1,
    parseInt(p.day, 10),
    hr,
    parseInt(p.minute, 10),
    parseInt(p.second, 10)
  );
  
  const offsetMs = targetAsUtc - localAsUtc;
  return new Date(localAsUtc - offsetMs);
}

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
 *  7. Construct UTC timestamp explicitly in target workspace timezone.
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
    if (/final|copy|v\d+/i.test(match) || /\(\d+\)/.test(match)) {
      return '';
    }
    return match;
  });

  // 5. Strict Regex
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
  const timeDigits = match[3];

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
    hour = parseInt(timeDigits, 10);
    minute = 0;
  } else if (timeDigits.length === 4) {
    hour = parseInt(timeDigits.slice(0, 2), 10);
    minute = parseInt(timeDigits.slice(2, 4), 10);
  }

  // Strict Validation: Hour (0-23), Minute (0-59)
  if (isNaN(hour) || hour < 0 || hour > 23 || isNaN(minute) || minute < 0 || minute > 59) {
    return { isMatch: false, error: 'Invalid filename time.' };
  }

  // Calculate year & date explicitly in target workspace timezone
  const now = new Date();
  let year = now.getFullYear();
  let scheduledDate = createDateInTimezone(year, monthIndex, day, hour, minute, timezone);

  // If date in current year has already passed, schedule for next year
  if (scheduledDate < now) {
    year += 1;
    scheduledDate = createDateInTimezone(year, monthIndex, day, hour, minute, timezone);
  }

  // Formatted display strings
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

/**
 * Classifies whether a filename is a non-semantic / junk filename.
 * Non-semantic filenames include download prefixes (ClipDown.com_*), camera defaults (IMG_*, DSC_*),
 * messaging app media (WhatsApp_Image_*), timestamps, UUIDs, and numeric hashes.
 */
function isJunkFilename(filename) {
  if (!filename || typeof filename !== 'string') return true;

  const baseName = filename.replace(/\.[^/.]+$/, '').trim();
  if (!baseName) return true;

  // Patterns for non-semantic downloaders, camera defaults, UUIDs, and hashes
  const junkPatterns = [
    /^clipdown/i,
    /^y2mate/i,
    /^savefrom/i,
    /^snaptik/i,
    /^ssstik/i,
    /^img[_\-\s\d]/i,
    /^dsc[_\-\s\d]/i,
    /^whatsapp[_\-\s]image/i,
    /^screenshot[_\-\s]/i,
    /^vid[_\-\s\d]/i,
    /^file[_\-\s]\d+[_\-\s]\d+/i,
    /^\d+$/,                                    // Pure numbers
    /^[a-f0-9]{20,}$/i,                         // Hex hash
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
    /^\d+_\d+_\d+/i,                            // Social media numeric dump e.g. 745393869_15478129...
  ];

  return junkPatterns.some((pattern) => pattern.test(baseName));
}

/**
 * Normalizes a filename into a clean contextual title string if semantic,
 * or returns null if the filename is determined to be non-semantic junk.
 */
function cleanFilenameContext(filename) {
  if (!filename || isJunkFilename(filename)) {
    return null;
  }

  // Remove extension
  let clean = filename.replace(/\.[^/.]+$/, '');
  // Replace underscores and hyphens with spaces
  clean = clean.replace(/[-_]+/g, ' ').trim();
  // Remove dates parsed by schedule parser
  clean = clean.replace(/\b(\d{1,2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\d*\b/gi, '').trim();

  if (!clean || clean.length < 3 || /^\d+$/.test(clean)) {
    return null;
  }

  // Title case conversion
  return clean
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

module.exports = {
  parseFilenameSchedule,
  createDateInTimezone,
  isJunkFilename,
  cleanFilenameContext,
};
