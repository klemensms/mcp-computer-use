import type { NativeBridge } from "./bridge-interface.js";
import type { Config } from "../config.js";

export async function createNativeBridge(config: Config): Promise<NativeBridge> {
  if (process.platform === "darwin") {
    const { MacosBridge } = await import("./macos-bridge.js");
    return new MacosBridge(config);
  }
  throw new Error(
    `mcp-computer-use has no backend for platform '${process.platform}'. Only darwin is supported in v1; Windows planned for v2.`
  );
}
