import 'server-only';
import { randomBytes } from 'crypto';

export const APP_URL = 'https://app.klasiko.rs';

export function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export function parentUrl(token: string): string {
  return `${APP_URL}/r/${token}`;
}

export function intlPhone(p: string | null | undefined): string {
  return (p ?? '').replace(/\D/g, '').replace(/^00/, '').replace(/^0/, '381');
}
