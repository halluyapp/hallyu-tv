import { Platform } from "react-native";
import { detectTelevision, type DeviceIdentity } from "./tvDetection";

function platformConstants(): Record<string, unknown> {
  try {
    return (Platform.constants ?? {}) as unknown as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Everything the TV rules need, read from React Native's platform constants. */
export function readDeviceIdentity(): DeviceIdentity {
  const constants = platformConstants();
  const uiMode =
    typeof constants.uiMode === "string"
      ? constants.uiMode
      : typeof constants.interfaceIdiom === "string"
        ? constants.interfaceIdiom
        : null;

  return {
    platform: Platform.OS,
    uiMode,
    isTV: Platform.isTV,
    brand: typeof constants.Brand === "string" ? constants.Brand : null,
    manufacturer: typeof constants.Manufacturer === "string" ? constants.Manufacturer : null,
    model: typeof constants.Model === "string" ? constants.Model : null,
  };
}

export function deviceIsTelevision(): boolean {
  try {
    return detectTelevision(readDeviceIdentity());
  } catch {
    return Platform.isTV;
  }
}
