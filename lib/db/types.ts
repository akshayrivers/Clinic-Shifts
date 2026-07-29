import { UserRole, Profession } from "@/types/next-auth";

export type ImportRowStatus = "accepted" | "rejected" | "merged";
export type { UserRole, Profession };

export interface UserEntity {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  profession: Profession;
  staff_code: number;
  created_at: Date;
}

export interface ShiftSeriesEntity {
  id: string;
  external_id: number; // shift id 
  days_of_week: number[];
  start_time: string;
  end_time: string;
  doctors_required: number;
  nurses_required: number;
  receptionists_required: number;
  until_date: Date;
  created_by: string;
  created_at: Date;
}

export interface ShiftEntity {
  id: string;
  starts_at: Date;
  ends_at: Date;
  doctors_required: number;
  nurses_required: number;
  receptionists_required: number;
  series_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ShiftClaimEntity {
  id: string;
  shift_id: string;
  user_id: string;
  claimed_by: string;
  created_at: Date;
}

export interface ShiftClaimWithUser extends ShiftClaimEntity {
  user: {
    full_name: string;
    profession: Profession;
    email: string;
  };
}

export interface ImportBatchEntity {
  id: string;
  source_filename: string;
  imported_by: string | null;
  imported_at: Date;
}

export interface ImportRowEntity {
  id: string;
  batch_id: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  status: ImportRowStatus;
  reason: string | null;
  resulting_id: string | null;
  created_at: Date;
}

// Input DTOs
export interface CreateUserInput {
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  profession?: Profession;
  staff_code: number; // required — this is the login identifier, not just traceability
}

export interface CreateShiftInput {
  external_id: number;
  starts_at: Date | string;
  ends_at: Date | string;
  doctors_required?: number;
  nurses_required?: number;
  receptionists_required?: number;
  series_id?: string | null;
  created_by?: string | null;
}

export interface CreateShiftClaimInput {
  shift_id: string;
  user_id: string;
  claimed_by: string;
}

export interface CreateImportBatchInput {
  source_filename: string;
  imported_by?: string | null;
}

export interface CreateImportRowInput {
  batch_id: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  status: ImportRowStatus;
  reason?: string | null;
  resulting_id?: string | null;
}

export interface CreateShiftSeriesInput {
  days_of_week: number[];
  start_time: string;
  end_time: string;
  doctors_required?: number;
  nurses_required?: number;
  receptionists_required?: number;
  until_date: Date | string;
  created_by: string;
}
