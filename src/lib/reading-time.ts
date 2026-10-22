import { countWords } from "./word-count";

export interface ReadingTime {
  words: number;
  minutes: number;
  label: string;
}

/**
 * Estimate reading time.
 *
 * Defaults to 220 words per minute.
 * Non-empty articles have a minimum estimate of one minute.
 */
export function getReadingTime(
  content: string,
  wordsPerMinute = 220,
): ReadingTime {
  if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) {
    throw new RangeError("wordsPerMinute must be a positive number.");
  }

  const words = countWords(content);

  if (words === 0) {
    return {
      words: 0,
      minutes: 0,
      label: "Less than 1 min read",
    };
  }

  const minutes = Math.max(1, Math.ceil(words / wordsPerMinute));

  return {
    words,
    minutes,
    label: `${minutes} min read`,
  };
}
