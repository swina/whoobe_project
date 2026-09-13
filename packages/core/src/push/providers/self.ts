import type { PushProvider, PushRecipient, PushPayload, PushResult } from '../provider.js';

let vapidPublicKey: string | null = null;
let vapidPrivateKey: string | null = null;

export class SelfPushProvider implements PushProvider {
  readonly name = 'self' as const;

  initialize(config: Record<string, unknown>): void {
    vapidPublicKey = (config.vapidPublicKey as string) ?? null;
    vapidPrivateKey = (config.vapidPrivateKey as string) ?? null;
  }

  validateConfig(): string | null {
    if (!vapidPublicKey || !vapidPrivateKey) {
      return 'VAPID public and private keys are required for self-hosted push';
    }
    return null;
  }

  async send(recipients: PushRecipient[], payload: PushPayload): Promise<PushResult> {
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      try {
        // @ts-expect-error - web-push is an optional runtime dependency, loaded via dynamic import
        const { webpush } = await import('web-push');
        webpush.setVapidDetails(
          'mailto:push@whoobe-cms.app',
          vapidPublicKey!,
          vapidPrivateKey!
        );
        await webpush.sendNotification(
          {
            endpoint: recipient.endpoint,
            keys: {
              p256dh: recipient.keys?.p256dh ?? '',
              auth: recipient.keys?.auth ?? '',
            },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon,
            badge: payload.badge,
            data: payload.data,
            image: payload.image,
          })
        );
        sent++;
      } catch (err) {
        failed++;
        errors.push(`Failed to send to ${recipient.endpoint}: ${(err as Error).message}`);
      }
    }

    return { success: failed === 0, sent, failed, errors: errors.length > 0 ? errors : undefined };
  }
}