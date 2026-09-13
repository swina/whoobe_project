import type { PushProvider, PushRecipient, PushPayload, PushResult } from '../provider.js';

let serviceAccount: Record<string, unknown> | null = null;

export class FirebasePushProvider implements PushProvider {
  readonly name = 'firebase' as const;

  initialize(config: Record<string, unknown>): void {
    const raw = config.firebaseServiceAccount as string | undefined;
    if (raw) {
      try {
        serviceAccount = JSON.parse(raw);
      } catch {
        serviceAccount = null;
      }
    }
  }

  validateConfig(): string | null {
    if (!serviceAccount) return 'Firebase service account JSON is required';
    return null;
  }

  async send(recipients: PushRecipient[], payload: PushPayload): Promise<PushResult> {
    if (!serviceAccount) {
      return { success: false, sent: 0, failed: recipients.length, errors: ['Firebase not configured'] };
    }

    const fcmTokens = recipients
      .map((r) => r.keys?.fcmToken)
      .filter(Boolean) as string[];

    if (fcmTokens.length === 0) {
      return { success: true, sent: 0, failed: 0 };
    }

    try {
      // @ts-expect-error - firebase-admin is an optional runtime dependency
      const admin: any = await import('firebase-admin');

      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }

      const messaging = admin.messaging();
      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const token of fcmTokens) {
        try {
          await messaging.send({
            token,
            notification: {
              title: payload.title,
              body: payload.body,
              imageUrl: payload.image,
            },
            data: payload.data as Record<string, string> | undefined,
          });
          sent++;
        } catch (err) {
          failed++;
          errors.push(`FCM send failed for token: ${(err as Error).message}`);
        }
      }

      return { success: failed === 0, sent, failed, errors: errors.length > 0 ? errors : undefined };
    } catch (err) {
      return { success: false, sent: 0, failed: fcmTokens.length, errors: [(err as Error).message] };
    }
  }
}