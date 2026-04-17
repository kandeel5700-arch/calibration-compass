export interface Equipment {
  id: string;
  name: string;
  model: string | null;
  serial_number: string;
  last_calibration_date: string;
  validity_months: number;
  next_calibration_date: string;
  notes: string | null;
  image_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EquipmentStatus = "valid" | "soon" | "expired";

export function getStatus(eq: Pick<Equipment, "next_calibration_date">): EquipmentStatus {
  const next = new Date(eq.next_calibration_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((next.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return "valid";
}

export function daysUntil(date: string): number {
  const next = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((next.getTime() - today.getTime()) / 86400000);
}

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  valid: "سليم",
  soon: "قارب على الانتهاء",
  expired: "منتهي الصلاحية",
};

export const STATUS_COLORS: Record<EquipmentStatus, string> = {
  valid: "bg-success/15 text-success border-success/30",
  soon: "bg-warning/15 text-warning border-warning/30",
  expired: "bg-destructive/15 text-destructive border-destructive/30",
};
