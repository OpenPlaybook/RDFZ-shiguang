import { appUrl } from "../paths";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Item, Profile } from "../../shared/types";
import { formatTime, formatContactWay } from "../utils";
import { LockIcon, StatusBadge, ViewLogs } from "./ItemCards";
import { message } from "../api";
const blank: Profile = {
  identity: "学生",
  className: "",
  name: "",
  idNo: "",
  contact: "",
};
export type DetailAction = "unlock" | "claim" | "verify" | "unverify";
interface Props {
  lastCallLabel: string;
  onCallLabel: (label: string) => void;
  initialScroll: number;
  item: Item;
  admin: boolean;
  viewer: string;
  notify: (message: string) => void;
  onClose: () => void;
  onDelete: (item: Item) => void;
  onAdminClaim: (item: Item) => Promise<void>;
  onAction: (action: DetailAction, body: unknown) => Promise<void>;
}
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <div>{value}</div>
    </div>
  );
}
export function DetailModal({
  item,
  initialScroll,
  lastCallLabel,
  onCallLabel,
  admin,
  viewer,
  notify,
  onClose,
  onDelete,
  onAdminClaim,
  onAction,
}: Props) {
  const [mode, setMode] = useState<"" | "unlock" | "claim">(""),
    [unlock, setUnlock] = useState<Profile>(blank),
    [claim, setClaim] = useState<Profile>(
      () => item.viewLogs.find((l) => l.viewerId === viewer) || blank,
    ),
    [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollAtOpen = useRef(initialScroll);
  useLayoutEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = scrollAtOpen.current;
  }, []);
  const working = useRef(false);
  const locked = !!item.verified,
    unlocked = admin || item.unlocked || locked,
    sensitive = unlocked || item.ownerId === viewer;
  const callHref =
    sensitive && item.contactValue
      ? item.contactType === "电话"
        ? "tel:" + item.contactValue.replace(/\s/g, "")
        : item.contactType === "邮箱"
          ? "mailto:" + item.contactValue
          : ""
      : "";
  useEffect(() => {
    if (callHref)
      onCallLabel(item.contactType === "电话" ? "拨打电话" : "发送邮件");
  }, [callHref, item.contactType, onCallLabel]);
  function openForm(next: "unlock" | "claim") {
    setMode(next);
    setTimeout(() => document.getElementById(next + "Name")?.focus(), 0);
  }
  async function run(action: DetailAction, body: unknown = {}) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await onAction(action, body);
      setMode("");
    } catch (err) {
      notify(message(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function claimClick() {
    if (admin) {
      void onAdminClaim(item);
      return;
    }
    if (!unlocked) {
      notify("请先填写个人信息查看联系方式，再登记已找回");
      openForm("unlock");
    } else openForm("claim");
  }
  async function submitProfile(action: "unlock" | "claim") {
    const p = action === "unlock" ? unlock : claim;
    if (!p.name.trim() || !p.idNo.trim() || !p.contact.trim()) {
      notify(
        action === "claim"
          ? "请填写姓名、学号/工号和联系方式以证明身份"
          : "请填写姓名、学号/工号和联系方式",
      );
      return;
    }
    if (
      action === "claim" &&
      !confirm("确认登记为已找回？将提交你的身份信息并锁定该帖。")
    )
      return;
    await run(action, { ...p, viewerId: viewer });
  }
  return (
    <div
      className="modal"
      id="detailModal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detailTitle"
      >
        <img id="detailImg" alt="物品照片" src={appUrl(item.image)} />
        <div className="modal-body">
          <div id="detailBadge">
            {locked && (
              <div className="detail-lock-banner">
                <LockIcon />
                <span>管理员已核对 · 帖子已锁定</span>
              </div>
            )}
            <StatusBadge item={item} />
            {locked && (
              <>
                {" "}
                <div className="badge badge-locked">硬锁定</div>
              </>
            )}
          </div>
          <h2 id="detailTitle">{item.description}</h2>
          <div className="detail-row">
            <span>捡到场所</span>
            <div id="detailPlace">{item.place}</div>
          </div>
          <div className="detail-row">
            <span>发布时间</span>
            <div id="detailTime">{formatTime(item.createdAt)}</div>
          </div>

          <div id="sensitiveBlock" hidden={!sensitive}>
            <div className="detail-row">
              <span>失物招领处</span>
              <div id="detailOffice">{item.office}</div>
            </div>
            <div className="detail-row">
              <span>联系人</span>
              <div id="detailContact">{item.contact || "未填写"}</div>
            </div>
            <div className="detail-row">
              <span>联系方式</span>
              <div id="detailContactWay">{formatContactWay(item)}</div>
            </div>
          </div>

          <div className="locked-note" id="privacyNote" hidden={sensitive}>
            为保护拾主隐私，失物招领处、联系人与联系方式需填写你的个人信息后才能查看。
          </div>

          <div
            id="detailClaimInfo"
            hidden={!sensitive || (!item.claim && !item.verified)}
          >
            {item.status === "claimed" && item.claim && (
              <>
                <DetailRow
                  label="找回登记 · 身份"
                  value={item.claim.identity || "未填写"}
                />
                <DetailRow
                  label="找回登记 · 班级/部门"
                  value={item.claim.className || "未填写"}
                />
                <DetailRow label="找回登记 · 姓名" value={item.claim.name} />
                <DetailRow
                  label="找回登记 · 学号/工号"
                  value={item.claim.idNo || "未填写"}
                />
                <DetailRow
                  label="找回登记 · 联系方式"
                  value={item.claim.contact}
                />
                <DetailRow
                  label="登记时间"
                  value={formatTime(item.claim.claimedAt)}
                />
              </>
            )}
            {item.verified && (
              <DetailRow
                label="管理核对"
                value={`已于 ${formatTime(item.verified.verifiedAt)} 核对通过${item.verified.note ? "：" + item.verified.note : ""}`}
              />
            )}
          </div>
          <div id="detailViewLogs" className="claim-box" hidden={!admin}>
            <strong>查看联系信息历史</strong>
            <div id="detailViewLogsBody" style={{ marginTop: "10px" }}>
              <ViewLogs logs={item.viewLogs} />
            </div>
          </div>
          <div
            className="locked-note"
            id="lockedNote"
            hidden={item.status !== "claimed" && !locked}
          >
            {locked
              ? "管理员已核对通过：帖子硬锁定，沉底显示。仅管理员可「取消核对」解锁。"
              : "该失物已登记找回，信息已锁定，仅可阅读，不可再修改。"}
          </div>

          <div className="claim-box" id="unlockBox" hidden={mode !== "unlock"}>
            <strong>填写个人信息以查看联系信息</strong>
            <p className="hint">
              提交后即可查看失物招领处、联系人与联系方式。信息仅用于失物核对。
            </p>
            <label>
              身份
              <select
                id="unlockIdentity"
                value={unlock.identity}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setUnlock((p) => ({ ...p, identity: value }));
                }}
              >
                <option value="学生">学生</option>
                <option value="职工">职工</option>
                <option value="老师">老师</option>
                <option value="其他">其他</option>
              </select>
            </label>
            <label>
              班级 / 部门（选填）
              <input
                id="unlockClass"
                placeholder="学生填班级；职工/老师可填部门或不填"
                value={unlock.className}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setUnlock((p) => ({ ...p, className: value }));
                }}
              />
            </label>
            <label>
              姓名
              <input
                id="unlockName"
                placeholder="真实姓名"
                value={unlock.name}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setUnlock((p) => ({ ...p, name: value }));
                }}
              />
            </label>
            <label>
              学号 / 工号
              <input
                id="unlockIdNo"
                placeholder="学号或工号"
                value={unlock.idNo}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setUnlock((p) => ({ ...p, idNo: value }));
                }}
              />
            </label>
            <label>
              联系方式
              <input
                id="unlockContact"
                placeholder="电话 / 微信 / 邮箱等"
                value={unlock.contact}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setUnlock((p) => ({ ...p, contact: value }));
                }}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-accent"
                id="confirmUnlock"
                disabled={busy}
                onClick={() => void submitProfile("unlock")}
              >
                提交并查看
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                id="cancelUnlock"
                onClick={() => setMode("")}
              >
                取消
              </button>
            </div>
          </div>

          <div className="claim-box" id="claimBox" hidden={mode !== "claim"}>
            <strong>登记已找回 · 请确认本人信息</strong>
            <p className="hint">确认后帖子锁定，防止冒名领取。</p>
            <label>
              身份
              <select
                id="claimIdentity"
                value={claim.identity}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setClaim((p) => ({ ...p, identity: value }));
                }}
              >
                <option value="学生">学生</option>
                <option value="职工">职工</option>
                <option value="老师">老师</option>
                <option value="其他">其他</option>
              </select>
            </label>
            <label>
              班级 / 部门（选填）
              <input
                id="claimClass"
                placeholder="学生填班级；职工/老师可填部门或不填"
                value={claim.className}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setClaim((p) => ({ ...p, className: value }));
                }}
              />
            </label>
            <label>
              姓名
              <input
                id="claimName"
                required
                placeholder="真实姓名"
                value={claim.name}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setClaim((p) => ({ ...p, name: value }));
                }}
              />
            </label>
            <label>
              学号 / 工号
              <input
                id="claimIdNo"
                required
                placeholder="学号或工号"
                value={claim.idNo}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setClaim((p) => ({ ...p, idNo: value }));
                }}
              />
            </label>
            <label>
              联系方式
              <input
                id="claimContact"
                required
                placeholder="电话 / 微信 / 邮箱等"
                value={claim.contact}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setClaim((p) => ({ ...p, contact: value }));
                }}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-accent"
                id="confirmClaim"
                disabled={busy}
                onClick={() => void submitProfile("claim")}
              >
                确认已找回
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                id="cancelClaim"
                onClick={() => setMode("")}
              >
                取消
              </button>
            </div>
          </div>

          <div className="modal-actions" id="detailActions" hidden={!!mode}>
            <button
              type="button"
              className="btn btn-primary"
              id="btnUnlock"
              hidden={admin || unlocked || locked || item.status === "claimed"}
              onClick={() => {
                if (!admin) openForm("unlock");
              }}
            >
              填写信息查看联系方式
            </button>
            <button
              type="button"
              className={
                "btn " +
                (admin && item.status === "claimed"
                  ? "btn-accent"
                  : "btn-primary")
              }
              id="btnClaim"
              hidden={locked || (!admin && item.status === "claimed")}
              style={{ opacity: !admin && !unlocked ? "0.55" : undefined }}
              title={
                admin
                  ? ""
                  : unlocked
                    ? "登记已找回"
                    : "请先填写信息查看联系方式"
              }
              onClick={claimClick}
            >
              {admin
                ? item.status === "claimed"
                  ? "取消已找回"
                  : "标记已找回"
                : "已找回"}
            </button>
            <button
              type="button"
              className="btn btn-primary admin-only"
              id="btnVerify"
              hidden={!admin || locked}
              onClick={() =>
                void run("verify", {
                  note: (
                    prompt("核对备注（选填）", "信息属实，核对通过") || ""
                  ).trim(),
                })
              }
            >
              核对通过
            </button>
            <button
              type="button"
              className="btn btn-ghost admin-only"
              id="btnUnverify"
              hidden={!admin || !locked}
              onClick={() => {
                if (confirm("取消核对将解除硬锁定，帖子可重新参与排序。确定？"))
                  void run("unverify");
              }}
            >
              取消核对
            </button>
            <button
              type="button"
              className="btn btn-danger admin-only"
              id="btnAdminDelete"
              hidden={!admin}
              onClick={() => onDelete(item)}
            >
              删除帖子
            </button>
            <a
              className="btn btn-ghost"
              id="detailCall"
              href={callHref || "#"}
              hidden={!callHref}
            >
              {!callHref
                ? lastCallLabel
                : item.contactType === "电话"
                  ? "拨打电话"
                  : "发送邮件"}
            </a>
            <button
              type="button"
              className="btn btn-ghost"
              id="closeDetail"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
