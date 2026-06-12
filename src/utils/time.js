/**
 * 时间工具 — 时区感知 + 调度计算
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import isBetween from 'dayjs/plugin/isBetween.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

const TZ = 'Asia/Shanghai';

export function now() {
  return dayjs().tz(TZ);
}

export function today() {
  return now().format('YYYY-MM-DD');
}

export function yesterday() {
  return now().subtract(1, 'day').format('YYYY-MM-DD');
}

export function isWeekend(date = now()) {
  const d = date.day();
  return d === 0 || d === 6;
}

export function isSaturday(date = now()) {
  return date.day() === 6;
}

export function isSunday(date = now()) {
  return date.day() === 0;
}

export function isWeekday(date = now()) {
  return !isWeekend(date);
}

export function timeUntil(targetTime) {
  // targetTime: "HH:mm"
  const [h, m] = targetTime.split(':').map(Number);
  const target = now().hour(h).minute(m).second(0).millisecond(0);
  let diff = target.diff(now(), 'minute');
  if (diff < 0) diff += 24 * 60; // next day
  return diff;
}

export function formatTime(date = now()) {
  return date.format('HH:mm');
}

export function formatDate(date = now()) {
  return date.format('YYYY-MM-DD');
}

export function isWithinWindow(startTime, endTime) {
  return now().isBetween(
    now().hour(startTime.split(':')[0]).minute(startTime.split(':')[1]),
    now().hour(endTime.split(':')[0]).minute(endTime.split(':')[1]),
    'minute',
    '[)',
  );
}

export default { now, today, yesterday, isWeekend, isSaturday, isSunday, isWeekday, timeUntil, formatTime, formatDate, isWithinWindow };
