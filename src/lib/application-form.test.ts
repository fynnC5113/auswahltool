import { describe, expect, it } from "vitest";
import { createToken, hashToken } from "./applicant-token";
import {
  MAX_CV_BYTES,
  applicationWindow,
  coerceFields,
  cvFileError,
  emptyFields,
  looksLikePdf,
  normalizeFields,
  validateApplication,
  type ApplicationFields,
} from "./application-form";

const round = { questionIds: ["q1", "q2"], departmentIds: ["d1", "d2"] };
const publicForm = { requireDepartment: true, withEmail: true };

function filled(changes: Partial<ApplicationFields> = {}): ApplicationFields {
  return {
    name: "Anna Muster",
    email: "anna@example.org",
    cohort: "2024",
    answers: { q1: "Weil …", q2: "Darum." },
    departmentIds: ["d1"],
    departmentUnsure: false,
    privacyConfirmed: true,
    ...changes,
  };
}

describe("token", () => {
  it("is random, URL-safe and at least 32 bytes", () => {
    const a = createToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createToken()).not.toBe(a);
  });

  it("hashes to hex SHA-256, the same token to the same hash", () => {
    const token = createToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken(createToken()));
  });
});

describe("applicationWindow", () => {
  const opens = new Date("2026-10-01T08:00:00Z");
  const closes = new Date("2026-10-15T21:59:00Z");

  it("is closed before the start", () => {
    expect(applicationWindow(opens, closes, new Date("2026-10-01T07:59:59Z"))).toBe("before");
  });
  it("is open from the start until just before the end", () => {
    expect(applicationWindow(opens, closes, opens)).toBe("open");
    expect(applicationWindow(opens, closes, new Date("2026-10-15T21:58:59Z"))).toBe("open");
  });
  it("is closed from the end on", () => {
    expect(applicationWindow(opens, closes, closes)).toBe("closed");
    expect(applicationWindow(opens, closes, new Date("2026-11-01T00:00:00Z"))).toBe("closed");
  });
});

describe("validateApplication", () => {
  it("accepts a complete application", () => {
    expect(validateApplication(filled(), round, publicForm)).toEqual({});
  });

  it("marks every empty required field", () => {
    const errors = validateApplication(emptyFields(), round, publicForm);
    expect(Object.keys(errors).sort()).toEqual(["answers.q1", "answers.q2", "cohort", "departments", "email", "name"]);
  });

  it("treats blank answers as empty", () => {
    const errors = validateApplication(filled({ answers: { q1: "   ", q2: "ok" } }), round, publicForm);
    expect(Object.keys(errors)).toEqual(["answers.q1"]);
  });

  it("rejects an invalid mail address", () => {
    expect(validateApplication(filled({ email: "anna@" }), round, publicForm).email).toBeDefined();
  });

  it("accepts 'weiß ich noch nicht' instead of a department", () => {
    expect(validateApplication(filled({ departmentIds: [], departmentUnsure: true }), round, publicForm)).toEqual({});
  });

  it("rejects a department of another round", () => {
    expect(validateApplication(filled({ departmentIds: ["x"] }), round, publicForm).departments).toBeDefined();
  });

  it("lets an admin leave the department open, but not the answers", () => {
    const options = { requireDepartment: false, withEmail: true };
    expect(validateApplication(filled({ departmentIds: [] }), round, options)).toEqual({});
    expect(validateApplication(filled({ answers: {} }), round, options)).toHaveProperty("answers.q1");
  });

  it("ignores the address when editing", () => {
    expect(validateApplication(filled({ email: "" }), round, { requireDepartment: true, withEmail: false })).toEqual({});
  });

  it("requires the privacy checkbox only when asked to", () => {
    const unconfirmed = filled({ privacyConfirmed: false });
    expect(validateApplication(unconfirmed, round, { ...publicForm, requirePrivacy: true })).toEqual({ privacy: expect.any(String) });
    expect(validateApplication(filled(), round, { ...publicForm, requirePrivacy: true })).toEqual({});
    expect(validateApplication(unconfirmed, round, publicForm)).toEqual({});
  });

  it("rejects overlong input", () => {
    const errors = validateApplication(filled({ name: "x".repeat(201), answers: { q1: "x".repeat(10_001), q2: "ok" } }), round, publicForm);
    expect(Object.keys(errors).sort()).toEqual(["answers.q1", "name"]);
  });
});

describe("normalizeFields", () => {
  it("trims, lower-cases the address and clears departments when unsure", () => {
    const result = normalizeFields(
      filled({ name: " Anna ", email: " Anna@Example.ORG ", departmentIds: ["d1", "d1"], departmentUnsure: true }),
      round.questionIds,
    );
    expect(result).toMatchObject({ name: "Anna", email: "anna@example.org", departmentIds: [] });
  });

  it("keeps only answers to the round's questions", () => {
    const result = normalizeFields(filled({ answers: { q1: " a ", q2: "b", other: "c" } }), round.questionIds);
    expect(result.answers).toEqual({ q1: "a", q2: "b" });
  });
});

describe("cvFileError", () => {
  it("requires a file", () => {
    expect(cvFileError(null)).toMatch(/Lebenslauf/);
    expect(cvFileError({ name: "cv.pdf", type: "application/pdf", size: 0 })).toMatch(/Lebenslauf/);
  });
  it("rejects a non-PDF", () => {
    expect(cvFileError({ name: "cv.docx", type: "application/msword", size: 1000 })).toMatch(/PDF/);
  });
  it("rejects a PDF over 10 MB", () => {
    expect(cvFileError({ name: "cv.pdf", type: "application/pdf", size: MAX_CV_BYTES + 1 })).toMatch(/10 MB/);
  });
  it("accepts a PDF up to 10 MB, also without a type (some phones)", () => {
    expect(cvFileError({ name: "cv.pdf", type: "application/pdf", size: MAX_CV_BYTES })).toBeNull();
    expect(cvFileError({ name: "CV.PDF", type: "", size: 1000 })).toBeNull();
  });
});

describe("looksLikePdf", () => {
  it("checks the %PDF- header", () => {
    expect(looksLikePdf(new TextEncoder().encode("%PDF-1.7\n…"))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("PK\u0003\u0004"))).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
});

describe("coerceFields", () => {
  it("turns anything into well-formed fields", () => {
    expect(coerceFields(null)).toEqual(emptyFields());
    expect(coerceFields({ name: 1, answers: { q1: 2, q2: "ok" }, departmentIds: ["d1", 3], departmentUnsure: "yes", privacyConfirmed: "yes" })).toEqual({
      ...emptyFields(),
      answers: { q1: "", q2: "ok" },
      departmentIds: ["d1"],
    });
  });
});
