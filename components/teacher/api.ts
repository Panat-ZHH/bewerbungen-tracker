// Single import point for the teacher RPC wrappers. Switch the source to "@/lib/teacher" once teacher-db is merged.
export * from "@/lib/teacher-types-stub";
export { createClass, listMyClasses, renameClass, deleteClass, removeClassStudent, regenerateClassCode } from "@/lib/classes";
