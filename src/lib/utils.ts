import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function canSeeProcessButtons(email: string | undefined | null): boolean {
  if (!email) return false;
  return email === 'usman@electionexperts.com' || email === 'sultan.shah@onecallapp.com';
}

export function canManageUsers(role: string | undefined | null): boolean {
  return Boolean(role && role !== 'user');
} 