import { MAP_LAYOUTS } from './config.js';
import { seededRandom } from './math.js';

const STORAGE_KEY = 'number-extraction-daily-v1';
const DAILY_DIFFICULTY = 'standard';
const routes = MAP_LAYOUTS.filter(layout => layout.id !== 'random');
const byValue = (a,b) => b.value-a.value || a.milliseconds-b.milliseconds;
const byTime = (a,b) => a.milliseconds-b.milliseconds || b.value-a.value;

export function dailyChallenge(now = new Date()) {
  const date = now.toISOString().slice(0,10);
  const seed = Number(date.replaceAll('-',''));
  const layout = routes[Math.floor(seededRandom(seed)()*routes.length)];
  return { date, seed, layout, difficulty: DAILY_DIFFICULTY };
}

function validEntry(entry) {
  return typeof entry?.id === 'string' && entry.id.length <= 80 &&
    Number.isInteger(entry.value) && entry.value >= 0 && entry.value <= 1e9 &&
    Number.isInteger(entry.milliseconds) && entry.milliseconds > 0 && entry.milliseconds <= 1200000;
}

function top(entries, order) {
  const unique = new Map();
  for (const entry of entries) if (validEntry(entry)) unique.set(entry.id, entry);
  return [...unique.values()].sort(order).slice(0,5);
}

export function readDaily(storage) {
  try {
    const content = JSON.parse(storage.getItem(STORAGE_KEY));
    const days = Object.keys(content || {}).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort().slice(-30);
    const scores = {};
    for (const date of days) {
      const record = content[date];
      scores[date] = {
        value: top(Array.isArray(record?.value) ? record.value.slice(0,5) : [], byValue),
        time: top(Array.isArray(record?.time) ? record.time.slice(0,5) : [], byTime),
      };
    }
    return { scores, available: true };
  } catch {
    return { scores: {}, available: false };
  }
}

export function recordDaily(storage, previous, challenge, result) {
  if (!result.success) return previous;
  const entry = { id: result.id, value: result.value, milliseconds: Math.round(result.seconds*1000) };
  if (!validEntry(entry)) return previous;
  const current = readDaily(storage), date = challenge.date;
  const scores = { ...previous.scores, ...current.scores };
  const records = [...(previous.scores[date]?.value || []), ...(previous.scores[date]?.time || []),
    ...(current.scores[date]?.value || []), ...(current.scores[date]?.time || []), entry];
  scores[date] = { value: top(records, byValue), time: top(records, byTime) };
  const recent = Object.fromEntries(Object.keys(scores).sort().slice(-30).map(key => [key,scores[key]]));
  try {
    storage.setItem(STORAGE_KEY,JSON.stringify(recent));
    return { scores: recent, available: true };
  } catch {
    return { scores: recent, available: false };
  }
}
