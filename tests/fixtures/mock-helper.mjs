// Tiny mock helper: reads newline-delimited JSON on stdin, responds on stdout.
// Speaks the SAME protocol as the Swift wrapper in native/macos/Sources/McpComputerUseHelper/
// (camelCase commands; wire shape preserved verbatim across the v0.2.0 swap).
// Extensively configurable via MOCK_HELPER_ERRORS env var.
import readline from "node:readline";

const errors = JSON.parse(process.env.MOCK_HELPER_ERRORS ?? "{}");

const CALCULATOR_APP = { appName: "Calculator", pid: 123, bundleId: "md.obsidian" };
// ^ Note: bundleId set to md.obsidian so existing tests that expect md.obsidian pass.

const MOCK_WINDOW = {
  windowRef: "w1",
  title: "vault",
  framePoints: { x: 0, y: 0, w: 800, h: 600 },
  scaleFactor: 2,
  isMinimized: false,
  isOnscreen: true,
  isMain: true,
  isFocused: true,
  windowId: 1,
};

const rl = readline.createInterface({ input: process.stdin });
function reply(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }

rl.on("line", (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const { id, cmd } = req;

  if (errors[cmd]) { reply({ id, ok: false, error: errors[cmd] }); return; }

  switch (cmd) {
    case "checkPermissions":
      reply({ id, ok: true, result: { accessibility: true, screenRecording: true } });
      return;
    case "listApps":
      reply({ id, ok: true, result: [CALCULATOR_APP] });
      return;
    case "listWindows":
      reply({ id, ok: true, result: [MOCK_WINDOW] });
      return;
    case "getFrontmost":
      reply({ id, ok: true, result: {
        appName: CALCULATOR_APP.appName,
        pid: CALCULATOR_APP.pid,
        bundleId: CALCULATOR_APP.bundleId,
        windowTitle: MOCK_WINDOW.title,
        windowId: MOCK_WINDOW.windowId,
        windowRef: MOCK_WINDOW.windowRef,
      }});
      return;
    case "screenshot":
      reply({ id, ok: true, result: {
        pngBase64: "iVBORw0KGgo=",
        width: 800,
        height: 600,
        scaleFactor: 2,
      }});
      return;
    case "mouseClick":
      reply({ id, ok: true, result: { clicked: true } });
      return;
    case "typeText":
      reply({ id, ok: true, result: { typed: true } });
      return;
    case "keyPress":
      reply({ id, ok: true, result: { ok: true, key: req.key, keycode: 0, modifiers: req.modifiers ?? [] } });
      return;
    case "scroll":
      reply({ id, ok: true, result: { ok: true, direction: req.direction, amount: req.amount } });
      return;
    case "shutdown":
      reply({ id, ok: true, result: { ok: true } });
      setTimeout(() => process.exit(0), 10);
      return;
    default:
      reply({ id, ok: false, error: { code: "unknown_cmd", message: `Unknown cmd ${cmd}` } });
  }
});
