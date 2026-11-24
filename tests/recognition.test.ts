import { describe, expect, it } from "vitest";
import { localExtractFillFields, matchOffice } from "../src/client/recognition";
describe("preserved text extraction", () => {
  it("recognizes the existing form example without AI", () => {
    const fields = localExtractFillFields(
      "食堂门口捡的，交食堂一层失物招领处，联系人小唐，电话13800138000",
    );
    expect(fields.place).toBe("食堂门口");
    expect(fields.office).toBe("食堂一层失物招领处");
    expect(fields.contact).toBe("小唐");
    expect(fields.contactValue).toBe("13800138000");
  });
  it("keeps office matching", () =>
    expect(matchOffice("逸夫楼")).toBe("逸夫楼门口"));
});
