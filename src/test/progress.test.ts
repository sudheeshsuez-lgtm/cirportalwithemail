import { describe, expect, it } from "vitest";
import { columnLetter, parseRows, spreadsheetIdFromUrl, stageFor } from "@/lib/progress";

describe("student progress rules", () => {
  it("tells approved students to prepare their passport and photo next", () => {
    const info = stageFor({ status: "approved" });
    expect(info.stage).toBe("approved");
    expect(info.nextDocuments.map((d) => d.name)).toEqual(["Passport", "Passport-size photo"]);
  });

  it("keeps a submitted form without a decision pending teacher approval", () => {
    const { rows } = parseRows([
      ["Timestamp", "Email Address", "Full Name", "Roll Number"],
      ["12/11/2026 10:00:00", "Asha@Gmail.com", "Asha", "21CS001"],
    ]);
    expect(rows[0]!.email).toBe("asha@gmail.com");
    expect(stageFor(rows[0]!).stage).toBe("pending");
  });

  it("reads a teacher's decision from the Approval Status column", () => {
    const { rows } = parseRows([
      ["Timestamp", "Full Name", "College Name", "Approval Status"],
      ["x", "Ravi", "PSG", "Rejected"],
    ]);
    expect(rows[0]!.name).toBe("Ravi");
    expect(rows[0]!.college).toBe("PSG");
    expect(stageFor(rows[0]!).stage).toBe("rejected");
  });

  it("asks students with no form row to fill the interest form", () => {
    expect(stageFor(null).stage).toBe("not_submitted");
  });

  it("converts column numbers and sheet links", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(26)).toBe("AA");
    expect(spreadsheetIdFromUrl("https://docs.google.com/spreadsheets/d/1AbC_def-1234567890123456789/edit#gid=0")).toBe(
      "1AbC_def-1234567890123456789",
    );
  });
});
