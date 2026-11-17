// Port between the admin API logic (handler.ts, actions.ts) and the database. The real implementation (service role) is in
// server.ts; tests use an in-memory mock. Every method is called only AFTER the admin guard passed.
import type {
  AccountAccessRow, AdminSchoolDetail, AdminSchoolRow, AdminUserDetail, AdminUserRow, AuditEntry, Paged, SchoolLicence,
} from "./types.ts";

export interface VerifiedUser { id: string; email: string | null }

export interface AuditInput {
  admin_id: string;
  action: string;
  target_user?: string | null;
  target_school?: string | null;
  details: Record<string, unknown>;
  ip: string | null;
}

export interface UserListFilter {
  q: string;
  page: number;
  pageSize: number;
  state: "all" | "blocked" | "grant" | "trial" | "trial_over";
  role: "all" | "student" | "teacher" | "school_admin" | "parent";
}

export interface AuditFilter {
  page: number;
  pageSize: number;
  action: string | null;
  admin_id: string | null;
  target_user: string | null;
  target_school: string | null;
  since: string | null;
}

export interface LicenceInput {
  package: string;
  status: "pilot" | "active" | null;
  student_limit: number | null;
  start: string | null; // date
  end: string | null; // date
  billing_interval: "yearly" | "monthly";
  notes: string | null;
}

export interface LicencePatch { valid_until?: string; pilot_end?: string; student_limit?: number; notes?: string | null }

export interface AdminStore {
  /** Bearer token → verified user (Supabase Auth), plus the token's claims. null = invalid / expired. */
  verifyToken(token: string): Promise<VerifiedUser | null>;
  isPlatformAdmin(userId: string): Promise<boolean>;

  listUsers(filter: UserListFilter): Promise<Paged<AdminUserRow>>;
  getUser(userId: string): Promise<AdminUserDetail | null>;
  /** Minimal facts for a mutation (exists, e-mail). */
  userBasics(userId: string): Promise<{ id: string; email: string | null; created_at: string | null } | null>;
  getAccess(userId: string): Promise<AccountAccessRow | null>;
  /** Upsert of account_access (creates the row for users from before the migration). Returns the row after the write. */
  updateAccess(userId: string, patch: Partial<AccountAccessRow>, adminId: string): Promise<AccountAccessRow>;
  /** Existing account deletion path (lib/account-delete-server.ts). Throws BillingActiveError when a subscription still renews. */
  deleteAccount(userId: string): Promise<void>;
  recentSignups(days: number): Promise<AdminUserRow[]>;

  listSchools(q: string): Promise<AdminSchoolRow[]>;
  getSchool(schoolId: string): Promise<AdminSchoolDetail | null>;
  createSchool(input: { name: string; canton_or_state: string; country: string }): Promise<string>;
  getLicence(licenceId: string): Promise<(SchoolLicence & { school_id: string }) | null>;
  assignLicence(schoolId: string, input: LicenceInput): Promise<string>;
  updateLicence(licenceId: string, patch: LicencePatch & { status?: string }): Promise<SchoolLicence>;
  findUserIdByEmail(email: string): Promise<string | null>;
  schoolAdmins(schoolId: string): Promise<string[]>;
  schoolTeachers(schoolId: string): Promise<string[]>;
  addSchoolAdmin(schoolId: string, email: string): Promise<string>;
  removeSchoolAdmin(schoolId: string, userId: string): Promise<void>;
  addSchoolTeacher(schoolId: string, userId: string, adminId: string): Promise<void>;
  removeSchoolTeacher(schoolId: string, userId: string): Promise<void>;

  writeAudit(entry: AuditInput): Promise<void>;
  listAudit(filter: AuditFilter): Promise<Paged<AuditEntry>>;
}
