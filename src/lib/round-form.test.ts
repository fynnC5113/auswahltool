import { describe, expect, it } from "vitest";
import { emptyForm, newCriterion, toRoundForm, validateRound, type RoundForm } from "./round-form";

function validForm(): RoundForm {
  return {
    ...emptyForm(2026),
    title: " Auswahlrunde 2026 ",
    seats: "8",
    interviewMinutes: "30",
    bufferMinutes: "10",
    applicationOpensAt: "2026-10-01T00:00",
    applicationClosesAt: "2026-10-15T23:59",
    interviewsFrom: "2026-10-19",
    interviewsUntil: "2026-10-30",
    deletionDate: "2027-01-31",
    questions: [{ key: "q", id: null, text: " Warum? " }],
    departments: [{ key: "d", id: null, name: "Finanzen", shortName: "", description: "" }],
    criteria: [{ ...newCriterion("c"), name: "Motivation", weight: "1,5" }],
  };
}

function errorsOf(form: RoundForm) {
  const result = validateRound(form);
  return "errors" in result ? result.errors : {};
}

describe("validateRound", () => {
  it("accepts a valid round and converts Berlin time to UTC", () => {
    const result = validateRound(validForm());
    expect(result).toHaveProperty("value");
    if (!("value" in result)) return;
    expect(result.value.p_round).toMatchObject({
      title: "Auswahlrunde 2026",
      seats: 8,
      application_opens_at: "2026-09-30T22:00:00.000Z",
      application_closes_at: "2026-10-15T21:59:00.000Z",
      reply_to: "termin.lawclinic@law-school.de",
      mail_transport: "gmail",
    });
    expect(result.value.p_questions).toEqual([{ id: null, text: "Warum?" }]);
    expect(result.value.p_criteria[0]).toMatchObject({ weight: 1.5, scale_min: 1, scale_max: 5 });
  });

  it("rejects an application end before its start", () => {
    expect(errorsOf({ ...validForm(), applicationClosesAt: "2026-09-30T12:00" })).toEqual({
      applicationClosesAt: "Das Ende muss nach dem Beginn liegen.",
    });
  });

  it("rejects an application end equal to its start", () => {
    const form = validForm();
    expect(errorsOf({ ...form, applicationClosesAt: form.applicationOpensAt })).toHaveProperty("applicationClosesAt");
  });

  it("rejects an interview period ending before it begins, but allows a single day", () => {
    expect(errorsOf({ ...validForm(), interviewsUntil: "2026-10-18" })).toHaveProperty("interviewsUntil");
    expect(errorsOf({ ...validForm(), interviewsUntil: "2026-10-19" })).toEqual({});
  });

  it("rejects a deletion date on or before the last interview day", () => {
    const message = { deletionDate: "Das Löschdatum muss nach dem Ende der Gespräche liegen." };
    expect(errorsOf({ ...validForm(), deletionDate: "2026-10-30" })).toEqual(message);
    expect(errorsOf({ ...validForm(), deletionDate: "2026-10-01" })).toEqual(message);
    expect(errorsOf({ ...validForm(), deletionDate: "2026-10-31" })).toEqual({});
  });

  it("accepts all three mail transports", () => {
    for (const mailTransport of ["gmail", "graph", "smtp"]) {
      expect(errorsOf({ ...validForm(), mailTransport })).toEqual({});
    }
  });

  it.each(["0", "-1", "", "abc", "0,0"])("rejects weight %j", (weight) => {
    const form = validForm();
    form.criteria[0].weight = weight;
    expect(errorsOf(form)).toEqual({ "criteria.0.weight": "Das Gewicht muss größer als 0 sein." });
  });

  it("rejects a reversed or empty scale", () => {
    const form = validForm();
    form.criteria[0].scaleMin = "5";
    form.criteria[0].scaleMax = "1";
    expect(errorsOf(form)).toEqual({ "criteria.0.scaleMax": "Das Maximum muss größer als das Minimum sein." });
    form.criteria[0].scaleMax = "5";
    expect(errorsOf(form)).toHaveProperty(["criteria.0.scaleMax"]);
  });

  it("rejects empty names and texts, with the error at the right item", () => {
    const form = validForm();
    form.questions.push({ key: "q2", id: null, text: "   " });
    form.departments.unshift({ key: "d0", id: null, name: "", shortName: "", description: "x" });
    form.criteria[0].name = "";
    expect(errorsOf(form)).toEqual({
      "questions.1.text": "Bitte einen Fragetext eingeben.",
      "departments.0.name": "Bitte einen Namen eingeben.",
      "criteria.0.name": "Bitte einen Namen eingeben.",
    });
  });

  it("rejects missing or invalid basic data", () => {
    const errors = errorsOf({
      ...emptyForm(2026),
      year: "26",
      seats: "0",
      bufferMinutes: "-5",
      deletionDate: "2027-02-30",
      mailTransport: "post",
      replyTo: "keine-adresse",
    });
    expect(Object.keys(errors).sort()).toEqual(
      [
        "title",
        "year",
        "seats",
        "interviewMinutes",
        "bufferMinutes",
        "applicationOpensAt",
        "applicationClosesAt",
        "interviewsFrom",
        "interviewsUntil",
        "deletionDate",
        "mailTransport",
        "replyTo",
      ].sort(),
    );
  });
});

describe("toRoundForm", () => {
  it("turns arbitrary input into the form shape", () => {
    const form = toRoundForm({ title: 5, questions: [{ text: "a", id: "" }, null, "x"], criteria: "none" });
    expect(form.title).toBe("");
    expect(form.questions).toEqual([{ key: "", id: null, text: "a" }]);
    expect(form.criteria).toEqual([]);
    expect(validateRound(form)).toHaveProperty("errors");
  });
});
