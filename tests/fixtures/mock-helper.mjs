// Tiny mock helper: reads newline-delimited JSON on stdin, responds on stdout.
// Supports commands: check_permissions, list_windows, get_frontmost_window,
// screenshot, click, type_text, key_press, scroll, wait, shutdown.
// Configurable via env: MOCK_HELPER_PERM, MOCK_HELPER_ERRORS (JSON).

import readline from "node:readline";

const perm = JSON.parse(
  process.env.MOCK_HELPER_PERM ?? '{"accessibility":true,"screenRecording":true}'
);
const errors = JSON.parse(process.env.MOCK_HELPER_ERRORS ?? "{}");

const rl = readline.createInterface({ input: process.stdin });

function reply(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

rl.on("line", (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const id = req.id;
  const cmd = req.cmd;

  if (errors[cmd]) {
    reply({ id, ok: false, error: errors[cmd] });
    return;
  }

  switch (cmd) {
    case "check_permissions":
      reply({ id, ok: true, result: perm });
      return;
    case "list_windows":
      reply({
        id, ok: true,
        result: [
          {
            appName: "Obsidian",
            bundleId: "md.obsidian",
            pid: 123,
            windowId: 1,
            title: "vault",
            isFrontmost: true,
            isMinimized: false,
            isOnscreen: true,
            frame: { x: 0, y: 0, width: 800, height: 600 },
          },
        ],
      });
      return;
    case "get_frontmost_window":
      reply({
        id, ok: true,
        result: {
          appName: "Obsidian",
          bundleId: "md.obsidian",
          pid: 123,
          windowId: 1,
          title: "vault",
          isFrontmost: true,
          isMinimized: false,
          isOnscreen: true,
          frame: { x: 0, y: 0, width: 800, height: 600 },
        },
      });
      return;
    case "screenshot":
      reply({
        id, ok: true,
        result: {
          target: {
            appName: "Obsidian",
            bundleId: "md.obsidian",
            pid: 123,
            windowTitle: "vault",
            windowId: 1,
          },
          capture: {
            captureId: "cap_mock_1",
            width: 800,
            height: 600,
            scaleFactor: 2,
            timestamp: Date.now(),
          },
          pngBase64: "iVBORw0KGgo=",
        },
      });
      return;
    case "click":
    case "type_text":
    case "key_press":
    case "scroll":
    case "wait":
      reply({ id, ok: true, result: null });
      return;
    case "shutdown":
      reply({ id, ok: true, result: null });
      setTimeout(() => process.exit(0), 10);
      return;
    default:
      reply({ id, ok: false, error: { code: "unknown_cmd", message: `Unknown cmd ${cmd}` } });
  }
});
