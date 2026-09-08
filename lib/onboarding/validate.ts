import type { FocusArea, Tone } from '@/lib/types';

export interface ProfileStepInput {
  name: string;
  currentAge: number;
  futureSelfAge: number;
  focusArea: FocusArea;
  tone: Tone;
  values: string;
}

export function validateProfileStep(input: ProfileStepInput): string | null {
  if (!input.name.trim()) return 'El nombre es obligatorio';
  if (!Number.isInteger(input.currentAge) || input.currentAge < 13 || input.currentAge > 120) {
    return 'La edad actual debe ser un número entre 13 y 120';
  }
  if (!Number.isInteger(input.futureSelfAge) || input.futureSelfAge <= input.currentAge) {
    return 'La edad futura debe ser mayor que tu edad actual';
  }
  return null;
}

export function validateGoals(goals: string[]): string | null {
  const nonEmpty = goals.map((g) => g.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return 'Agrega al menos una meta';
  return null;
}

export function validateDeliveryHour(hour: number): string | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return 'La hora debe estar entre 0 y 23';
  }
  return null;
}
