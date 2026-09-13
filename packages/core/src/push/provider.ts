export interface PushRecipient {
  endpoint: string;
  keys?: Record<string, string>;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  image?: string;
}

export interface PushResult {
  success: boolean;
  sent: number;
  failed: number;
  errors?: string[];
}

export interface PushProvider {
  readonly name: 'self' | 'onesignal' | 'firebase';
  send(recipients: PushRecipient[], payload: PushPayload): Promise<PushResult>;
  validateConfig(): string | null;
  initialize(config: Record<string, unknown>): void;
}

export type PushProviderName = 'self' | 'onesignal' | 'firebase';