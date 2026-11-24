import { appUrl } from "../paths";
import { useLayoutEffect, useRef, useState } from "react";
import type { Item } from "../../shared/types";
import type { SessionView } from "../../shared/identity";
import { formatTime, formatContactWay } from "../utils";
import { StatusBadge, ViewLogs } from "./ItemCards";
import { message } from "../api";
export type DetailAction =
  | "claim"
  | "intent"
  | "deliver"
  | "custody"
  | "correct"
  | "reopen"
  | "withdraw";
interface Props {
  initialScroll: number;
  item: Item;
  session: SessionView;
  notify: (message: string) => void;
  onClose: () => void;
  onDelete: (item: Item) => void;
  onNeedLogin: () => void;
  onAction: (action: DetailAction, body?: unknown) => Promise<void>;
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
  session,
  notify,
  onClose,
  onDelete,
  onNeedLogin,
  onAction,
}: Props) {
  const [claimantUserId, setClaimantUserId] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollAtOpen = useRef(initialScroll);
  const working = useRef(false);
  useLayoutEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = scrollAtOpen.current;
  }, []);
  const admin = session.kind === "admin";
  const student = session.kind === "student";
  const open = item.status === "open";
  async function run(action: DetailAction, body?: unknown) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await onAction(action, body);
    } catch (err) {
      notify(message(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function selfClaim() {
    if (
      !confirm(
        "确认实物已经交给你，并由本人登记领取？这不会显示为老师已核验。",
      )
    )
      return;
    void run("claim");
  }
  function deliver() {
    if (!claimantUserId.trim()) {
      notify("请填写领取学生的平台用户 ID");
      return;
    }
    if (!confirm("确认已经核对身份并完成交付？")) return;
    void run("deliver", { claimantUserId: claimantUserId.trim(), note });
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
            <StatusBadge item={item} />
            {item.highValue && <div className="badge badge-locked">高价值</div>}
          </div>
          <h2 id="detailTitle">{item.description}</h2>
          <DetailRow label="捡到场所" value={item.place} />
          <DetailRow label="发布时间" value={formatTime(item.createdAt)} />
          <DetailRow label="招领处" value={item.office || "未填写"} />
          <DetailRow label="当前保管" value={item.custody.label} />
          {item.contactVisible && (
            <div id="sensitiveBlock">
              <DetailRow label="联系人" value={item.contact || "未填写"} />
              <DetailRow label="联系方式" value={formatContactWay(item)} />
            </div>
          )}
          {item.highValue && open && (
            <div className="locked-note" id="highValueNote">
              高价值物品需要老师核对身份和归属后再交付。学生只能提出领取意向，不能自行确认领走。
              {item.custody.teacherReceived
                ? " 实物已交到老师处。"
                : " 目前尚未交到老师处，还不能完成交付。"}
            </div>
          )}
          {item.claimVisible && item.claim && (
            <div id="detailClaimInfo">
              <DetailRow label="领取人" value={item.claim.name} />
              <DetailRow
                label="班级"
                value={item.claim.className || "未填写"}
              />
              <DetailRow label="登记方式" value={item.claim.claimLabel} />
              <DetailRow
                label="登记时间"
                value={formatTime(item.claim.claimedAt)}
              />
              {item.claim.note && (
                <DetailRow label="备注" value={item.claim.note} />
              )}
            </div>
          )}
          {item.status === "claimed" && !item.claimVisible && (
            <div className="locked-note" id="claimHiddenNote">
              该物品已领取。领取人信息只对本人和管理员可见。
            </div>
          )}
          {admin && item.legacyVerification && (
            <DetailRow
              label="历史核对"
              value={`记录于 ${formatTime(item.legacyVerification.at)}，不代表本次已交付${item.legacyVerification.note ? "：" + item.legacyVerification.note : ""}`}
            />
          )}
          {admin && (
            <div id="detailViewLogs" className="claim-box">
              <strong>历史查看记录（不再新增）</strong>
              <div style={{ marginTop: "10px" }}>
                <ViewLogs logs={item.viewLogs ?? []} />
              </div>
              {item.claimLog.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <strong>交付留痕</strong>
                  {item.claimLog.map((entry, index) => (
                    <div className="view-log-item" key={entry.at + index}>
                      {entry.name} · {entry.className} ·{" "}
                      {entry.active ? "当前有效" : "已更正"}
                      {entry.closeReason ? `：${entry.closeReason}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="modal-actions" id="detailActions">
            {session.kind === "guest" && open && (
              <button
                type="button"
                className="btn btn-primary"
                id="btnNeedLogin"
                onClick={onNeedLogin}
              >
                登录后登记领取
              </button>
            )}
            {session.kind === "kiosk" && (
              <p className="hint" id="kioskNoClaim">
                公共终端只能发布，不能领取，也不能查看私人消息。
              </p>
            )}
            {student && open && !item.highValue && (
              <button
                type="button"
                className="btn btn-primary"
                id="btnSelfClaim"
                disabled={busy}
                onClick={selfClaim}
              >
                本人登记已领取
              </button>
            )}
            {student && open && item.highValue && (
              <button
                type="button"
                className="btn btn-primary"
                id="btnIntent"
                disabled={busy || item.myIntent}
                onClick={() => void run("intent")}
              >
                {item.myIntent ? "已提交领取意向" : "提出领取意向"}
              </button>
            )}
            {admin && open && !item.custody.teacherReceived && (
              <button
                type="button"
                className="btn btn-ghost"
                id="btnCustody"
                disabled={busy}
                onClick={() => void run("custody", { heldBy: "teacher" })}
              >
                登记已交到老师处
              </button>
            )}
            {admin && open && (
              <div className="claim-box" id="deliverBox">
                <strong>确认交付</strong>
                <p className="hint">
                  按平台用户 ID 查找学生。找不到时转平台确认，不能把管理员写成失主。
                </p>
                <label>
                  领取学生的平台用户 ID
                  <input
                    id="claimUserId"
                    value={claimantUserId}
                    onChange={(e) => setClaimantUserId(e.currentTarget.value)}
                  />
                </label>
                <label>
                  备注（选填）
                  <input
                    id="deliverNote"
                    value={note}
                    onChange={(e) => setNote(e.currentTarget.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  id="confirmDeliver"
                  disabled={busy}
                  onClick={deliver}
                >
                  确认交付
                </button>
              </div>
            )}
            {admin && item.status === "claimed" && (
              <div className="claim-box" id="correctBox">
                <strong>更正交付</strong>
                <p className="hint">原经办记录会保留，不能直接删掉。</p>
                <label>
                  更正后的学生平台用户 ID（撤销则留空）
                  <input
                    id="correctUserId"
                    value={claimantUserId}
                    onChange={(e) => setClaimantUserId(e.currentTarget.value)}
                  />
                </label>
                <label>
                  原因
                  <input
                    id="correctReason"
                    value={reason}
                    onChange={(e) => setReason(e.currentTarget.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  id="confirmCorrect"
                  disabled={busy}
                  onClick={() =>
                    void run("correct", {
                      claimantUserId: claimantUserId.trim(),
                      reason: reason.trim(),
                    })
                  }
                >
                  更正领取人
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  id="confirmReopen"
                  disabled={busy}
                  onClick={() => void run("reopen", { reason: reason.trim() })}
                >
                  撤销交付
                </button>
              </div>
            )}
            {(admin || item.isOwner) && item.status !== "withdrawn" && (
              <button
                type="button"
                className="btn btn-ghost"
                id="btnWithdraw"
                disabled={busy}
                onClick={() => {
                  if (confirm("确定撤下这条招领？")) void run("withdraw");
                }}
              >
                撤下
              </button>
            )}
            {admin && (
              <button
                type="button"
                className="btn btn-danger"
                id="btnAdminDelete"
                onClick={() => onDelete(item)}
              >
                删除帖子
              </button>
            )}
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
