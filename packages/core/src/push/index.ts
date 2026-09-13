import type { PushProvider, PushProviderName, PushRecipient, PushPayload, PushResult } from './provider.js';
import { SelfPushProvider } from './providers/self.js';
import { OneSignalPushProvider } from './providers/onesignal.js';
import { FirebasePushProvider } from './providers/firebase.js';

const providers = new Map<PushProviderName, PushProvider>();

export function getPushProvider(name: PushProviderName): PushProvider {
  let provider = providers.get(name);
  if (!provider) {
    switch (name) {
      case 'self':
        provider = new SelfPushProvider();
        break;
      case 'onesignal':
        provider = new OneSignalPushProvider();
        break;
      case 'firebase':
        provider = new FirebasePushProvider();
        break;
    }
    providers.set(name, provider!);
  }
  return provider!;
}

export function initializePushProvider(name: PushProviderName, config: Record<string, unknown>): string | null {
  const provider = getPushProvider(name);
  provider.initialize(config);
  return provider.validateConfig();
}

export async function sendPushNotification(
  providerName: PushProviderName,
  recipients: PushRecipient[],
  payload: PushPayload,
  config: Record<string, unknown>
): Promise<PushResult> {
  const provider = getPushProvider(providerName);
  provider.initialize(config);
  return provider.send(recipients, payload);
}

export { type PushProvider, type PushProviderName, type PushRecipient, type PushPayload, type PushResult } from './provider.js';