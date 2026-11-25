import {
  foundFormContext,
  type SessionView,
} from "../../shared/identity";
export function FoundIdentityBanner({ session }: { session: SessionView }) {
  const form = foundFormContext(session);
  if (form.mode === "guest") return null;
  if (form.mode === "kiosk")
    return (
      <p className="identity-banner" id="foundIdentity" data-found-mode="kiosk">
        公共终端：{form.stationName || "未命名站点"}
        。不用填写捡到者姓名。站点联系人
        {form.stationContactName ? `「${form.stationContactName}」` : "可以不填"}
        。发布成功、结束使用或闲置两分钟后，会清空这次的照片和表单，终端账号仍保持可用。
      </p>
    );
  return (
    <p
      className="identity-banner"
      id="foundIdentity"
      data-found-mode={form.mode}
    >
      发布身份：{form.displayName || "未命名"} · {form.className || "未分班"}
      。这是学校平台上的本人信息，不能改成其他人，也不需要填写手机号。
    </p>
  );
}
