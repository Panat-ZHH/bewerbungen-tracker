// Single import point for the teacher RPC wrappers (see lib/teacher.ts and docs/teacher-contract.md).
export * from "@/lib/teacher";
export { createClass, listMyClasses, renameClass, deleteClass, removeClassStudent, regenerateClassCode } from "@/lib/classes";
