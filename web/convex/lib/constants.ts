export const DEFAULT_BEHAVIOUR_INSTRUCTIONS =
  "Keep spoken answers under 20 seconds. Prices in USD.";

export const DEFAULT_POST_MEETING_INSTRUCTIONS =
  "Summary, decisions, action items by owner.";

export const BOARD_COLUMNS = [
  "topics",
  "decisions",
  "questions",
  "actions",
  "answers",
] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const MAX_NOTE_WORDS = 12;
