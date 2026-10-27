"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  Smartphone,
  Apple,
  ShieldAlert,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import {
  getGeolocationDiagnostics,
  acquireDevicePosition,
  GeolocationDiagnostic,
} from "@/lib/attendance/client-geolocation";

interface LocationHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "android" | "ios" | "http" | "diagnostics";
  onPermissionGranted?: () => void;
}

export function LocationHelpModal({
  isOpen,
  onClose,
  defaultTab,
  onPermissionGranted,
}: LocationHelpModalProps) {
  const [activeTab, setActiveTab] = useState<"android" | "ios" | "http" | "diagnostics">("android");
  const [diagnostics, setDiagnostics] = useState<GeolocationDiagnostic | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    coords?: { latitude: number; longitude: number; accuracy: number };
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Auto-detect platform or default tab on open
  useEffect(() => {
    if (!isOpen) return;

    // Load diagnostics
    getGeolocationDiagnostics().then((diag) => {
      setDiagnostics(diag);
      setTestResult(null);
      if (defaultTab) {
        setActiveTab(defaultTab);
      } else if (!diag.isSecureContext) {
        setActiveTab("http");
      } else if (typeof navigator !== "undefined") {
        const ua = navigator.userAgent || "";
        if (/iPhone|iPad|iPod/i.test(ua)) {
          setActiveTab("ios");
        } else {
          setActiveTab("android");
        }
      }
    });
  }, [isOpen, defaultTab]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleTestGPS = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const pos = await acquireDevicePosition();
      setTestResult({
        success: true,
        message: `Success! GPS acquired with ±${Math.round(pos.accuracy)}m accuracy.`,
        coords: pos,
      });
      if (onPermissionGranted) {
        onPermissionGranted();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to acquire location. Please review the steps below.";
      setTestResult({
        success: false,
        message: msg,
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Location Permission & Troubleshooting Guide"
      subtitle="Follow these steps to enable GPS location on your mobile phone"
      maxWidth="2xl"
    >
      <div className="space-y-5 p-1">
        {/* Insecure HTTP Warning Banner if applicable */}
        {diagnostics && !diagnostics.isSecureContext && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold block">
                Insecure Context Detected ({`${diagnostics.protocol}//${diagnostics.host}`})
              </span>
              <span>
                Mobile browsers strictly disable GPS access over plain HTTP (e.g. <code>http://192.168.x.x</code>). Switch to the <strong>Local Dev / HTTP</strong> tab below to fix this.
              </span>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab("android")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap shrink-0 ${
              activeTab === "android"
                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Android (Chrome)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ios")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap shrink-0 ${
              activeTab === "ios"
                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <Apple className="w-3.5 h-3.5" />
            iPhone / iPad (Safari)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("http")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap shrink-0 ${
              activeTab === "http"
                ? "bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Local IP / HTTP Setup
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("diagnostics")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap shrink-0 ${
              activeTab === "diagnostics"
                ? "bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-xs font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Diagnostic Tool
          </button>
        </div>

        {/* Tab Content */}
        <div className="space-y-4">
          {/* ANDROID TAB */}
          {activeTab === "android" && (
            <div className="space-y-3.5 text-xs text-slate-600 dark:text-slate-300">
              <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl space-y-1">
                <p className="font-semibold text-blue-900 dark:text-blue-300">
                  Step 1: Check Chrome Site Permissions
                </p>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>In Google Chrome on your phone, look at the address bar at the top.</li>
                  <li>
                    Tap the <strong>Tune / Lock icon 🔒</strong> (or page settings icon) right next to the website URL.
                  </li>
                  <li>
                    Tap <strong>Permissions</strong> (or <strong>Site settings</strong>).
                  </li>
                  <li>
                    Look for <strong>Location</strong> and set it to <strong>Allow</strong> (or tap <strong>Reset permissions</strong>).
                  </li>
                </ol>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-200">
                  Step 2: Turn ON Phone Location (GPS)
                </p>
                <p>
                  Swipe down from the top of your phone screen to open Quick Settings. Ensure the <strong>Location / GPS</strong> toggle is turned <strong>ON</strong>.
                </p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-200">
                  Step 3: Check Android System App Permissions
                </p>
                <p>
                  If Chrome was previously denied system location:
                </p>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Open Android <strong>Settings</strong> &gt; <strong>Apps</strong> &gt; <strong>Chrome</strong>.</li>
                  <li>Tap <strong>Permissions</strong> &gt; <strong>Location</strong>.</li>
                  <li>Select <strong>Allow only while using the app</strong> and ensure <strong>Use precise location</strong> is enabled.</li>
                </ol>
              </div>
            </div>
          )}

          {/* IOS TAB */}
          {activeTab === "ios" && (
            <div className="space-y-3.5 text-xs text-slate-600 dark:text-slate-300">
              <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl space-y-1">
                <p className="font-semibold text-blue-900 dark:text-blue-300">
                  Step 1: Website Settings in Safari
                </p>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>In Safari on your iPhone, look at the address bar at the bottom or top.</li>
                  <li>
                    Tap the <strong>`aA`</strong> icon (or website settings button).
                  </li>
                  <li>
                    Tap <strong>Website Settings</strong>.
                  </li>
                  <li>
                    Tap <strong>Location</strong> and select <strong>Allow</strong> (or <strong>Ask</strong>).
                  </li>
                </ol>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-200">
                  Step 2: iOS System Location Services
                </p>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Open iPhone <strong>Settings</strong> &gt; <strong>Privacy & Security</strong> &gt; <strong>Location Services</strong>.</li>
                  <li>Ensure <strong>Location Services</strong> is switched <strong>ON</strong>.</li>
                  <li>Scroll down and tap <strong>Safari Websites</strong>.</li>
                  <li>Select <strong>While Using the App</strong> and make sure <strong>Precise Location</strong> is turned <strong>ON</strong>.</li>
                </ol>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-200">
                  Step 3: Refresh Safari
                </p>
                <p>
                  Return to Safari, tap the <strong>Reload (↻)</strong> button, and tap Clock In again.
                </p>
              </div>
            </div>
          )}

          {/* LOCAL DEV / HTTP TAB */}
          {activeTab === "http" && (
            <div className="space-y-3.5 text-xs text-slate-600 dark:text-slate-300">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                <p className="font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  Why Mobile Browsers Block Geolocation on HTTP
                </p>
                <p>
                  All modern mobile browsers (Chrome on Android and Safari on iOS) <strong>completely disable</strong> GPS geolocation when connected over unencrypted HTTP (such as <code>http://192.168.x.x:3000</code>). Browsers treat IP addresses as insecure contexts, so they reject location requests without even showing a popup prompt.
                </p>
              </div>

              {/* Solution 1 */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                <p className="font-semibold text-slate-900 dark:text-slate-200">
                  Solution 1: Run Next.js with HTTPS in Dev Mode (Recommended)
                </p>
                <p>
                  Next.js supports generating local SSL certificates automatically. Run this on your host machine:
                </p>
                <div className="flex items-center justify-between p-2 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px]">
                  <code>npm run dev:https</code>
                  <button
                    type="button"
                    onClick={() => handleCopy("npm run dev:https", "dev-https")}
                    className="p-1 hover:bg-slate-800 rounded transition-colors"
                  >
                    {copiedCode === "dev-https" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Then open <code>https://192.168.11.199:3000</code> on your mobile phone (accept the self-signed certificate once).
                </p>
              </div>

              {/* Solution 2 */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                <p className="font-semibold text-slate-900 dark:text-slate-200">
                  Solution 2: Chrome Android Flag (Testing over HTTP without SSL)
                </p>
                <p>
                  If you want to keep using <code>http://192.168.11.199:3000</code> directly in Chrome on Android:
                </p>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>
                    Open Chrome on your phone and go to URL:
                    <div className="inline-block mx-1 font-mono font-bold text-blue-600 dark:text-blue-400">
                      chrome://flags/#unsafely-treat-insecure-origin-as-secure
                    </div>
                  </li>
                  <li>
                    Set the flag to <strong>Enabled</strong>.
                  </li>
                  <li>
                    In the text box below it, enter your origin:
                    <div className="inline-block mx-1 font-mono font-bold text-slate-800 dark:text-slate-200">
                      http://192.168.11.199:3000
                    </div>
                  </li>
                  <li>
                    Tap <strong>Relaunch</strong> Chrome. GPS will now work over HTTP!
                  </li>
                </ol>
              </div>

              {/* Solution 3 */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                <p className="font-semibold text-slate-900 dark:text-slate-200">
                  Solution 3: Free HTTPS Tunnel (Instant mobile access)
                </p>
                <p>
                  Run a free secure tunnel in a new terminal window:
                </p>
                <div className="flex items-center justify-between p-2 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px]">
                  <code>npx cloudflared tunnel --url http://localhost:3000</code>
                  <button
                    type="button"
                    onClick={() => handleCopy("npx cloudflared tunnel --url http://localhost:3000", "tunnel")}
                    className="p-1 hover:bg-slate-800 rounded transition-colors"
                  >
                    {copiedCode === "tunnel" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Open the generated <code>https://....trycloudflare.com</code> link on your phone.
                </p>
              </div>
            </div>
          )}

          {/* DIAGNOSTICS TAB */}
          {activeTab === "diagnostics" && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <span className="text-slate-500 block text-[11px]">Connection Context:</span>
                  <span className="font-semibold flex items-center gap-1.5 mt-0.5">
                    {diagnostics?.isSecureContext ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Secure Context (HTTPS / Localhost)
                      </span>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Insecure Context (HTTP)
                      </span>
                    )}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <span className="text-slate-500 block text-[11px]">Browser API:</span>
                  <span className="font-semibold flex items-center gap-1.5 mt-0.5">
                    {diagnostics?.isSupported ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Geolocation Supported
                      </span>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Not Supported
                      </span>
                    )}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <span className="text-slate-500 block text-[11px]">Permission State:</span>
                  <span className="font-semibold capitalize mt-0.5 block">
                    {diagnostics?.permissionState === "granted" && (
                      <span className="text-emerald-600 dark:text-emerald-400">Granted</span>
                    )}
                    {diagnostics?.permissionState === "denied" && (
                      <span className="text-rose-600 dark:text-rose-400">Denied (Blocked)</span>
                    )}
                    {diagnostics?.permissionState === "prompt" && (
                      <span className="text-amber-600 dark:text-amber-400">Prompt (Will Ask)</span>
                    )}
                    {diagnostics?.permissionState === "unknown" && (
                      <span className="text-slate-500">Not Queryable</span>
                    )}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <span className="text-slate-500 block text-[11px]">Current Host:</span>
                  <span className="font-semibold font-mono text-[11px] truncate mt-0.5 block">
                    {`${diagnostics?.protocol || ""}//${diagnostics?.host || ""}`}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live GPS Test Panel */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700/80 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Test Device GPS Coordinates
              </p>
              <p className="text-[11px] text-slate-500">
                Verify if your browser can acquire your location right now.
              </p>
            </div>

            <button
              type="button"
              onClick={handleTestGPS}
              disabled={isTesting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shrink-0 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? "animate-spin" : ""}`} />
              {isTesting ? "Testing GPS..." : "Test GPS Now"}
            </button>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs ${
                testResult.success
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
              {testResult.coords && (
                <div className="mt-1.5 pl-6 font-mono text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                  <p>Latitude: {testResult.coords.latitude.toFixed(6)}</p>
                  <p>Longitude: {testResult.coords.longitude.toFixed(6)}</p>
                  <p>Accuracy: ±{Math.round(testResult.coords.accuracy)} meters</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </Modal>
  );
}
