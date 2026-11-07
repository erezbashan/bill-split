const USER_NAME_COOKIE = 'billsplit_user_name';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function getUserNameCookie(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${USER_NAME_COOKIE}=`));
  if (!match) return '';
  try {
    return decodeURIComponent(match.split('=')[1] || '').trim();
  } catch {
    return '';
  }
}

export function setUserNameCookie(name: string): void {
  if (typeof document === 'undefined') return;
  const trimmed = name.trim();
  document.cookie = `${USER_NAME_COOKIE}=${encodeURIComponent(trimmed)}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
