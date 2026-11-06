export type ApplicationStatus =
  | "saved"
  | "preparing"
  | "applied"
  | "schnupper_planned"
  | "schnupper_done"
  | "aptitude_test"
  | "interview"
  | "final_interview"
  | "offer"
  | "contract_signed"
  | "rejected"
  | "withdrawn";

/** The 13 Berufsfelder of the job search (lib/job-filters/taxonomy FIELDS) plus "other". */
export type ApplicationCategory =
  | "informatik"
  | "kaufmaennisch"
  | "detailhandel"
  | "gesundheit"
  | "soziales"
  | "handwerk-bau"
  | "technik-industrie"
  | "gastro-hotel"
  | "logistik"
  | "finanz-recht"
  | "gestaltung-medien"
  | "natur"
  | "sicherheit-oeffentlich"
  | "other";

export type DocumentKind = "lebenslauf" | "motivationsschreiben" | "zeugnisse" | "foto" | "sonstiges";

export type CVType = "developer" | "sales" | "finance" | "other";

export interface Application {
  id: string;
  company: string;
  position: string;
  location?: string;
  jobUrl?: string;
  source?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  deadline?: string;
  category: ApplicationCategory;
  status: ApplicationStatus;
  matchScore?: number;
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
  cvType?: CVType;
  jobDescription?: string;
  notes?: string;
  /** Schnupperlehre (trial day): date, result and own notes. Only used for the Schnupperlehre steps. */
  schnupperDate?: string;
  schnupperResult?: "positive" | "neutral" | "negative";
  schnupperNotes?: string;
  /** Eignungstest / Multicheck. */
  testDate?: string;
  testResult?: "pending" | "passed" | "failed";
  contactName?: string;
  contactInfo?: string;
}

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  type: "created" | "applied" | "interview" | "final_interview" | "note";
  label: string;
  date: string;
}

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedIn?: string;
  school?: string;
  gradeLevel?: string;
  desiredProfession?: string;
}

export interface CV {
  id: string;
  name: string;
  type: CVType;
  kind: DocumentKind;
  description: string;
  updatedAt: string;
  status: "Ready" | "Draft";
  fileName?: string;
  storagePath?: string;
  fileType?: string;
  fileSize?: number;
}

export type UserRole = "student" | "teacher";

export interface SocialProfile {
  userId: string;
  role: UserRole;
  displayName: string;
  avatarSeed: string;
  inviteCode: string;
  shareWithFriends: boolean;
  email?: string;
}

export type FriendRelation = "none" | "self" | "friend" | "pending_out" | "pending_in";

export interface SocialLookup {
  displayName: string;
  avatarSeed: string;
  role: UserRole;
  inviteCode: string;
  relation: FriendRelation;
}

export type FriendState = "friend" | "incoming" | "outgoing";

export interface SocialConnection {
  id: string;
  otherUserId: string;
  displayName: string;
  avatarSeed: string;
  role: UserRole;
  state: FriendState;
  createdAt: string;
}

export type StatusCounts = Partial<Record<ApplicationStatus, number>>;

export interface FriendActivity {
  userId: string;
  displayName: string;
  avatarSeed: string;
  /** false when the friend disabled sharing; all numbers are then undefined. */
  shared: boolean;
  total?: number;
  statusCounts?: StatusCounts;
  mapPointsEarned?: number;
  mapItems?: number;
}

export interface SchoolClass {
  id: string;
  name: string;
  schoolYear: string;
  joinCode: string;
  createdAt: string;
  memberCount: number;
}

export interface ClassMembership {
  classId: string;
  name: string;
  schoolYear: string;
  teacherName: string;
  shareApplications: boolean;
  joinedAt: string;
}

export interface ClassMember {
  studentId: string;
  displayName: string;
  avatarSeed: string;
  joinedAt: string;
  hidden: boolean;
}

export interface ClassDeadline {
  applicationId: string;
  company: string;
  position: string;
  deadline: string;
}

export interface ClassStudentOverview {
  studentId: string;
  displayName: string;
  avatarSeed: string;
  /** true when the student does not share applications; numbers are then zero/empty. */
  hidden: boolean;
  total: number;
  statusCounts: StatusCounts;
  last7Days: number;
  last30Days: number;
  latest?: { company: string; position: string; status: ApplicationStatus; date: string };
  upcomingDeadlines: ClassDeadline[];
}

export interface ClassStudentApplication {
  id: string;
  company: string;
  position: string;
  status: ApplicationStatus;
  category: ApplicationCategory;
  location?: string;
  deadline?: string;
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassStudentApplications {
  hidden: boolean;
  applications: ClassStudentApplication[];
}