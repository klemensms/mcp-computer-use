export { descWithExamples } from "@mcp-consultant-tools/core";

export const SCREENSHOT_APP_EXAMPLES = [
  { label: "Obsidian", value: "md.obsidian" },
  { label: "Finder", value: "com.apple.finder" },
  { label: "Figma Desktop", value: "com.figma.Desktop" },
];

export const WINDOW_TITLE_EXAMPLES = [
  { label: "Match by title substring", value: "Daily Notes" },
  { label: "Exact window title", value: "System Settings" },
];

export const KEY_EXAMPLES = [
  { label: "Enter", value: "return" },
  { label: "Escape", value: "escape" },
  { label: "Tab", value: "tab" },
  { label: "Arrow down", value: "down" },
];

export const MODIFIER_EXAMPLES = [
  { label: "Cmd+C", value: '["cmd"]' },
  { label: "Cmd+Shift+P", value: '["cmd","shift"]' },
  { label: "Opt+Arrow", value: '["opt"]' },
];

export const SCROLL_EXAMPLES = [
  { label: "Scroll down 3 ticks", value: '{"direction":"down","amount":3}' },
  { label: "Scroll up 1 tick", value: '{"direction":"up","amount":1}' },
];
