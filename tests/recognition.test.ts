import { describe, expect, it } from "vitest";
import { localExtractFillFields, matchOffice } from "../src/client/recognition";
describe("preserved text extraction", () => {
  it("recognizes the existing form example without AI", () => {
    const fields = localExtractFillFields(
      "图书馆二楼捡的，交图书馆总服务台，联系人小唐，电话13800138000",
    );
    expect(fields.place).toBe("图书馆2楼");
    expect(fields.office).toBe("图书馆总服务台");
    expect(fields.contact).toBe("小唐");
    expect(fields.contactValue).toBe("13800138000");
  });
  it("keeps office matching", () =>
    expect(matchOffice("保卫处")).toBe("保卫处失物招领处"));
});
