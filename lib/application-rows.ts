// Mapping between an Application and its `applications` table row. Pure (no Supabase import) so it can be unit-tested.
import { normalizeCategory } from "./categories.ts";
import { parseSchnupperResult, parseTestResult } from "./status.ts";
import type { Application } from "../types/index.ts";

export type ApplicationRow = Omit<Application, "jobUrl" | "salaryMin" | "salaryMax" | "matchScore" | "appliedAt" | "createdAt" | "updatedAt" | "jobDescription" | "cvType" | "location" | "source" | "currency" | "deadline" | "notes"> & {
  user_id: string;
  location?: string | null; source?: string | null; currency?: string | null; deadline?: string | null; notes?: string | null;
  contact_name?: string | null; contact_info?: string | null; job_url?: string | null; salary_min?: number | null; salary_max?: number | null;
  match_score?: number | null; applied_at?: string | null; created_at: string; updated_at: string; job_description?: string | null; cv_type?: Application["cvType"] | null;
  schnupper_date?: string | null; schnupper_result?: string | null; schnupper_notes?: string | null; test_date?: string | null; test_result?: string | null;
};

export function fromRow(row: ApplicationRow): Application {
  return {
    id: row.id, company: row.company, position: row.position, location: row.location ?? undefined, jobUrl: row.job_url ?? undefined, source: row.source ?? undefined,
    category: normalizeCategory(row.category), salaryMin: row.salary_min ?? undefined, salaryMax: row.salary_max ?? undefined, currency: row.currency ?? undefined,
    deadline: row.deadline ?? undefined, status: row.status, matchScore: row.match_score ?? undefined, appliedAt: row.applied_at ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at, cvType: row.cv_type ?? undefined, jobDescription: row.job_description ?? undefined, notes: row.notes ?? undefined,
    contactName: row.contact_name ?? undefined, contactInfo: row.contact_info ?? undefined, schnupperDate: row.schnupper_date ?? undefined,
    schnupperResult: parseSchnupperResult(row.schnupper_result), schnupperNotes: row.schnupper_notes ?? undefined, testDate: row.test_date ?? undefined,
    testResult: parseTestResult(row.test_result),
  };
}

/**
 * Every nullable column is sent explicitly as `null` when it is empty. supabase-js drops `undefined` keys from the request body,
 * so an `undefined` here would make an UPDATE silently keep the old value: a field the user cleared would come back after a reload.
 */
export function toRow(application: Application, userId: string): ApplicationRow {
  const empty = <T,>(value: T | "" | undefined | null): T | null => (value === "" || value === undefined ? null : value);
  return {
    user_id: userId, id: application.id, company: application.company, position: application.position, location: empty(application.location),
    job_url: empty(application.jobUrl), source: empty(application.source), category: application.category, salary_min: empty(application.salaryMin),
    salary_max: empty(application.salaryMax), currency: empty(application.currency), deadline: empty(application.deadline), status: application.status,
    match_score: empty(application.matchScore), applied_at: empty(application.appliedAt), created_at: application.createdAt, updated_at: application.updatedAt,
    cv_type: empty(application.cvType), job_description: empty(application.jobDescription), notes: empty(application.notes), contact_name: empty(application.contactName),
    contact_info: empty(application.contactInfo), schnupper_date: empty(application.schnupperDate), schnupper_result: empty(application.schnupperResult),
    schnupper_notes: empty(application.schnupperNotes), test_date: empty(application.testDate), test_result: empty(application.testResult),
  };
}
