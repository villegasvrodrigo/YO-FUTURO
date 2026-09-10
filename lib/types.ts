export type FocusArea = 'carrera' | 'salud' | 'relaciones' | 'finanzas' | 'personal' | 'paz' | 'cuerpo';
export type Tone = 'motivador' | 'exigente' | 'tierno' | 'directo';
export type GoalStatus = 'active' | 'achieved' | 'paused';
export type SendStatus = 'pending' | 'sent' | 'failed';

export interface Profile {
  id: string;
  name: string;
  current_age: number;
  future_self_age: number;
  values: string;
  focus_area: FocusArea;
  tone: Tone;
  delivery_hour_local: number;
  timezone: string;
  onboarding_completed: boolean;
  current_energy_summary: string | null;
  blocking_pattern: string | null;
  future_vision: string | null;
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  description: string;
  status: GoalStatus;
  created_at: string;
}

export interface MessageRecord {
  id: string;
  user_id: string;
  content: string;
  generated_at: string;
  sent_at: string | null;
  send_status: SendStatus;
  model_used: string;
}
