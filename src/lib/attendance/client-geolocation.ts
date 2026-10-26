/**
 * Client-Side Geolocation Utilities with Mobile Device Optimization & Diagnostics
 */

export interface GeolocationDiagnostic {
  isSupported: boolean;
  isSecureContext: boolean;
  permissionState: "granted" | "prompt" | "denied" | "unsupported" | "unknown";
  protocol: string;
  host: string;
  isLocalhost: boolean;
}

export interface DevicePosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  isHighAccuracy: boolean;
}

export type GeolocationErrorCode =
  | "INSECURE_CONTEXT"
  | "NOT_SUPPORTED"
  | "PERMISSION_DENIED"
  | "POSITION_UNAVAILABLE"
  | "TIMEOUT"
  | "UNKNOWN";

export class GeolocationClientError extends Error {
  code: GeolocationErrorCode;
  helpType: "insecure" | "permission" | "device_gps" | "timeout" | "unsupported";

  constructor(
    code: GeolocationErrorCode,
    message: string,
    helpType: "insecure" | "permission" | "device_gps" | "timeout" | "unsupported"
  ) {
    super(message);
    this.name = "GeolocationClientError";
    this.code = code;
    this.helpType = helpType;
  }
}

/**
 * Inspects browser security context & geolocation capabilities.
 */
export async function getGeolocationDiagnostics(): Promise<GeolocationDiagnostic> {
  if (typeof window === "undefined") {
    return {
      isSupported: false,
      isSecureContext: false,
      permissionState: "unknown",
      protocol: "",
      host: "",
      isLocalhost: false,
    };
  }

  const isSupported = "geolocation" in navigator;
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1";

  // Modern browsers require HTTPS unless on localhost/127.0.0.1
  const isSecure =
    typeof window.isSecureContext === "boolean"
      ? window.isSecureContext
      : window.location.protocol === "https:" || isLocalhost;

  let permissionState: GeolocationDiagnostic["permissionState"] = "unknown";
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });
      if (
        status.state === "granted" ||
        status.state === "prompt" ||
        status.state === "denied"
      ) {
        permissionState = status.state;
      }
    } catch {
      permissionState = "unknown";
    }
  }

  return {
    isSupported,
    isSecureContext: isSecure,
    permissionState,
    protocol: window.location.protocol,
    host: window.location.host,
    isLocalhost,
  };
}

/**
 * Attempts to acquire device coordinates.
 * Features:
 * 1. Pre-validates secure context (detects HTTP on mobile before browser throws opaque permission denied)
 * 2. Attempts high-accuracy GPS (satellite fix)
 * 3. Falls back to standard accuracy (cell/Wi-Fi positioning) if high accuracy times out
 */
export async function acquireDevicePosition(): Promise<DevicePosition> {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    throw new GeolocationClientError(
      "NOT_SUPPORTED",
      "Geolocation is not supported by your device or browser.",
      "unsupported"
    );
  }

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1";

  const isSecure =
    typeof window.isSecureContext === "boolean"
      ? window.isSecureContext
      : window.location.protocol === "https:" || isLocalhost;

  // Modern mobile browsers explicitly block navigator.geolocation on HTTP non-localhost URLs
  if (!isSecure) {
    throw new GeolocationClientError(
      "INSECURE_CONTEXT",
      "Mobile browsers block GPS on unencrypted HTTP (http://...). Access via HTTPS to clock in.",
      "insecure"
    );
  }

  // Attempt 1: High Accuracy (GPS Satellite)
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      });
    });

    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      isHighAccuracy: true,
    };
  } catch (firstErr: unknown) {
    const firstCode =
      firstErr && typeof firstErr === "object" && "code" in firstErr
        ? (firstErr as { code: number }).code
        : null;

    // If permission was explicitly denied by the user, fail immediately without annoying retry
    if (firstCode === 1 /* PERMISSION_DENIED */) {
      throw new GeolocationClientError(
        "PERMISSION_DENIED",
        "Location permission denied. Please allow location access in your browser to clock in.",
        "permission"
      );
    }

    // For TIMEOUT (3) or POSITION_UNAVAILABLE (2), retry with enableHighAccuracy: false
    // Cellular and Wi-Fi positioning is often much faster and reliable indoors
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 15000,
        });
      });

      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        isHighAccuracy: false,
      };
    } catch (secondErr: unknown) {
      const secondCode =
        secondErr && typeof secondErr === "object" && "code" in secondErr
          ? (secondErr as { code: number }).code
          : null;

      const secondMessage =
        secondErr instanceof Error ? secondErr.message : "Failed to acquire GPS coordinates.";

      if (secondCode === 1) {
        throw new GeolocationClientError(
          "PERMISSION_DENIED",
          "Location permission denied. Please allow location access in your browser to clock in.",
          "permission"
        );
      } else if (secondCode === 2) {
        throw new GeolocationClientError(
          "POSITION_UNAVAILABLE",
          "Device location unavailable. Please turn on device GPS/Location Services and retry.",
          "device_gps"
        );
      } else if (secondCode === 3) {
        throw new GeolocationClientError(
          "TIMEOUT",
          "GPS location request timed out. Please check your signal and try again.",
          "timeout"
        );
      } else {
        throw new GeolocationClientError(
          "UNKNOWN",
          secondMessage,
          "device_gps"
        );
      }
    }
  }
}
