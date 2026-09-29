import { describe, expect, it } from "vitest";
import { NO_FILTER, answerSnippet, matchesFilter, type Searchable } from "./applicant-filter";

const lena: Searchable = {
  name: "Lena Hoffmann",
  email: "lena.hoffmann@law-school.de",
  cohort: "2025",
  departmentIds: ["events"],
  departmentUnsure: false,
  status: "active",
  answers: ["Ich will die Abläufe mitgestalten, damit Mandanten schneller einen Termin bekommen.", "Ich habe ein Schulfest organisiert."],
};
const aylin: Searchable = {
  name: "Aylin Demir",
  email: "aylin.demir@law-school.de",
  cohort: "2024",
  departmentIds: [],
  departmentUnsure: true,
  status: "no_show",
  answers: ["Beratung von innen kennenlernen.", "Türkisch, Englisch, Social Media."],
};
const both = [lena, aylin];
const find = (filter: Partial<typeof NO_FILTER>) => both.filter((a) => matchesFilter(a, { ...NO_FILTER, ...filter })).map((a) => a.name);

describe("matchesFilter", () => {
  it("no filter shows everyone", () => {
    expect(find({})).toEqual(["Lena Hoffmann", "Aylin Demir"]);
  });

  it("search finds text from the answers, ignoring case", () => {
    expect(find({ query: "schulfest" })).toEqual(["Lena Hoffmann"]);
    expect(find({ query: "TÜRKISCH" })).toEqual(["Aylin Demir"]);
  });

  it("search finds name and mail", () => {
    expect(find({ query: "demir" })).toEqual(["Aylin Demir"]);
    expect(find({ query: "hoffmann@" })).toEqual(["Lena Hoffmann"]);
  });

  it("every search word must occur somewhere", () => {
    expect(find({ query: "lena termin" })).toEqual(["Lena Hoffmann"]);
    expect(find({ query: "lena türkisch" })).toEqual([]);
  });

  it("filters cohort, department, 'weiß noch nicht' and status", () => {
    expect(find({ cohort: "2024" })).toEqual(["Aylin Demir"]);
    expect(find({ department: "events" })).toEqual(["Lena Hoffmann"]);
    expect(find({ department: "unsure" })).toEqual(["Aylin Demir"]);
    expect(find({ status: "no_show" })).toEqual(["Aylin Demir"]);
    expect(find({ status: "active", query: "türkisch" })).toEqual([]);
  });

  it("treats composed and decomposed umlauts alike", () => {
    expect(find({ query: "Abläufe" })).toEqual(["Lena Hoffmann"]);
  });
});

describe("answerSnippet", () => {
  it("shows the passage around the hit with the original spelling", () => {
    expect(answerSnippet(lena, "MANDANTEN", 10)).toEqual({ before: "…en, damit ", match: "Mandanten", after: " schneller…" });
  });

  it("no snippet if the name matches or nothing is searched", () => {
    expect(answerSnippet(lena, "lena")).toBeNull();
    expect(answerSnippet(lena, "  ")).toBeNull();
    expect(answerSnippet(lena, "Excel")).toBeNull();
  });
});
