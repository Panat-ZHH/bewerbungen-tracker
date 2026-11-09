import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLib } from "./helpers/load-lib.mjs";

const role = await loadLib("role");

test("homeFor sends teachers to /teacher and students to /dashboard", () => {
  assert.equal(role.homeFor("teacher"), "/teacher");
  assert.equal(role.homeFor("student"), "/dashboard");
});

test("guardRedirect blocks students from /teacher/** only", () => {
  assert.equal(role.guardRedirect("student", "/teacher"), "/dashboard");
  assert.equal(role.guardRedirect("student", "/teacher/classes/abc/students/x"), "/dashboard");
  assert.equal(role.guardRedirect("student", "/teacher/onboarding"), "/dashboard");
  assert.equal(role.guardRedirect("student", "/teachers-lounge"), null);
  assert.equal(role.guardRedirect("student", "/classes/join/ABC"), null);
});

test("teachers get the old class detail page redirected into /teacher", () => {
  assert.equal(role.guardRedirect("teacher", "/classes/c1"), "/teacher/classes/c1");
  assert.equal(role.guardRedirect("teacher", "/classes/join"), null);
  assert.equal(role.guardRedirect("student", "/classes"), null);
  assert.equal(role.guardRedirect("student", "/classes/c1"), null);
});

test("guardRedirect keeps teachers off student-only pages", () => {
  for (const path of ["/dashboard", "/applications", "/applications/new", "/applications/x1", "/map", "/cvs", "/search", "/analytics", "/friends", "/classes", "/classes/"]) assert.equal(role.guardRedirect("teacher", path), "/teacher", path);
  for (const path of ["/teacher", "/teacher/classes/1", "/classes/join/ABC", "/settings", "/profile"]) assert.equal(role.guardRedirect("teacher", path), null, path);
  assert.equal(role.guardRedirect("teacher", "/map?x=1#a"), "/teacher");
});

test("landingPath honours a safe next only if the role may open it", () => {
  assert.equal(role.landingPath("student", "/classes/join/ABC"), "/classes/join/ABC");
  assert.equal(role.landingPath("student", "/teacher"), "/dashboard");
  assert.equal(role.landingPath("teacher", "/applications"), "/teacher");
  assert.equal(role.landingPath("teacher", "/classes"), "/teacher");
  assert.equal(role.landingPath("teacher", null), "/teacher");
  assert.equal(role.landingPath("student", "//evil.example"), "/dashboard");
  assert.equal(role.landingPath("student", "https://evil.example"), "/dashboard");
  assert.equal(role.landingPath("student", "/login"), "/dashboard");
});

test("explicit role detection (Google users have none)", () => {
  assert.equal(role.hasExplicitRole({ role: "teacher" }), true);
  assert.equal(role.hasExplicitRole({ role: "student" }), true);
  assert.equal(role.hasExplicitRole({ role_confirmed: true }), true);
  assert.equal(role.hasExplicitRole({ full_name: "Lena", avatar_url: "x" }), false);
  assert.equal(role.hasExplicitRole({ role: "admin" }), false);
  assert.equal(role.hasExplicitRole(undefined), false);
  assert.equal(role.needsRoleChoice({ user_metadata: {} }), true);
  assert.equal(role.needsRoleChoice(null), false);
});

test("rolePickerHref carries a safe next", () => {
  assert.equal(role.rolePickerHref(null), "/auth/role");
  assert.equal(role.rolePickerHref("/classes/join/ABC"), "/auth/role?next=%2Fclasses%2Fjoin%2FABC");
  assert.equal(role.rolePickerHref("//evil"), "/auth/role");
});
