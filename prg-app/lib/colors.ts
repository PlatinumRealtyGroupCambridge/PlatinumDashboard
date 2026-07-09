// The app's fixed categorical color slots (see app/globals.css's
// --series-* CSS variables). Cycled through whenever something needs a
// color assigned automatically rather than hand-picked — new teammates
// (app/api/admin/users/route.ts) and new one-off meetings created either
// from the "+ New meeting" button (app/api/meetings/route.ts) or via the
// Google Chat bot (lib/chat-bot.ts).
export const COLOR_CYCLE = [
  "series-blue",
  "series-aqua",
  "series-yellow",
  "series-green",
  "series-violet",
  "series-red",
  "series-magenta",
  "series-orange",
  "series-brown",
];

export function colorForIndex(index: number) {
  return COLOR_CYCLE[((index % COLOR_CYCLE.length) + COLOR_CYCLE.length) % COLOR_CYCLE.length];
}
