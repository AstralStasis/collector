import fetch from "node-fetch";
import AbortController from "abort-controller";

// Keep HTTP compatibility local to build scripts and tests.
export default fetch;

export function timeoutSignal(ms) {
  if (!Number.isInteger(ms) || ms < 0 || ms > 2147483647) throw new RangeError("Timeout must be an integer from 0 to 2147483647 ms");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref();
  return controller.signal;
}
