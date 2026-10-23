/**
 * AI entry placement — floating launcher is the sole chrome entry.
 * Header no longer mounts a duplicate MessageCircle control.
 */

export function usesHeaderAiEntry(_pathname: string): boolean {
  return false;
}

export function showsFloatingAiLauncher(_pathname: string): boolean {
  return true;
}
