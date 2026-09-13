// OneSignal service worker shim
// OneSignal requires its own service-worker.js at the root.
// This file delegates to the OneSignal SDK.
// In production, replace with the actual OneSignal SDK service worker.

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js')