import type { PushProvider, PushRecipient, PushPayload, PushResult } from '../provider.js';

let appId: string | null = null;
let apiKey: string | null = null;

export class OneSignalPushProvider implements PushProvider {
  readonly name = 'onesignal' as const;

  initialize(config: Record<string, unknown>): void {
    appId = (config.onesignalAppId as string) ?? null;
    apiKey = (config.onesignalApiKey as string) ?? null;
  }

  validateConfig(): string | null {
    if (!appId) return 'OneSignal App ID is required';
    if (!apiKey) return 'OneSignal REST API Key is required';
    return null;
  }

  async send(recipients: PushRecipient[], payload: PushPayload): Promise<PushResult> {
    if (!appId || !apiKey) {
      return { success: false, sent: 0, failed: recipients.length, errors: ['OneSignal not configured'] };
    }

    const subscriptionIds = recipients
      .map((r) => r.keys?.onesignalUserId)
      .filter(Boolean) as string[];

    if (subscriptionIds.length === 0) {
      return { success: true, sent: 0, failed: 0 };
    }

    try {
      const response = await fetch(`https://onesignal.com/api/v1/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${apiKey}`,
        },
        body: JSON.stringify({
          app_id: appId,
          include_subscription_ids: subscriptionIds,
          headings: { en: payload.title },
          contents: { en: payload.body },
          icon: payload.icon,
          data: payload.data,
          big_picture: payload.image,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, sent: 0, failed: subscriptionIds.length, errors: [text] };
      }

      return { success: true, sent: subscriptionIds.length, failed: 0 };
    } catch (err) {
      return { success: false, sent: 0, failed: subscriptionIds.length, errors: [(err as Error).message] };
    }
  }
}