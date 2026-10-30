// Database Configuration & Provider Manager
// Supports: Firebase Default (from Vercel ENV) and PostgreSQL (via Connection String / DATABASE_URL)

export type DatabaseProviderType = 'firebase' | 'postgres';

const STORAGE_KEY_PROVIDER = 'active_db_provider';
const STORAGE_KEY_CUSTOM_POSTGRES = 'custom_postgres_url';

// 1. Get default PostgreSQL Connection String from Environment Variables (if any)
export function getDefaultPostgresUrl(): string {
  return process.env.DATABASE_URL || '';
}

// 2. Get Active Database Provider (Default is always 'firebase' for safety)
export function getActiveDatabaseProvider(): DatabaseProviderType {
  if (typeof window === 'undefined') {
    const envProvider = process.env.NEXT_PUBLIC_DB_PROVIDER;
    if (envProvider === 'postgres' || envProvider === 'postgresql') {
      return 'postgres';
    }
    return 'firebase';
  }
  const stored = localStorage.getItem(STORAGE_KEY_PROVIDER);
  if (stored === 'postgres' || stored === 'supabase') {
    return 'postgres';
  }
  return 'firebase';
}

// 3. Set Active Database Provider
export function setActiveDatabaseProvider(provider: DatabaseProviderType): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_PROVIDER, provider);
}

// 4. Get Custom Postgres URL
export function getCustomPostgresUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY_CUSTOM_POSTGRES);
}

// 5. Save Custom Postgres URL
export function saveCustomPostgresUrl(url: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_CUSTOM_POSTGRES, url.trim());
}

// 6. Get Active Postgres URL
export function getActivePostgresUrl(): string {
  const custom = getCustomPostgresUrl();
  if (custom && custom.trim()) {
    return custom.trim();
  }
  return getDefaultPostgresUrl();
}

// 7. Reset to Default Firebase
export function resetToDefaultFirebase(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_PROVIDER);
  localStorage.removeItem(STORAGE_KEY_CUSTOM_POSTGRES);
}
