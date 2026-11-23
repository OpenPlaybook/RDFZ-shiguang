import { appUrl } from "../paths";
import type { Item, ViewLog } from "../../shared/types";
import { formatTime } from "../utils";
export function LockIcon() {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="12"
        y="28"
        width="40"
        height="28"
        rx="6"
        fill="#f4f7f6"
        stroke="#1a2a2e"
        strokeWidth="3"
      />
      <path
        d="M20 28V20a12 12 0 0 1 24 0v8"
        stroke="#f4f7f6"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="40" r="4" fill="#1a2a2e" />
      <rect x="30" y="40" width="4" height="8" rx="2" fill="#1a2a2e" />
    </svg>
  );
}
export function StatusBadge({ item }: { item: Item }) {
  return (
    <div
      className={
        "badge " + (item.status === "claimed" ? "badge-claimed" : "badge-open")
      }
    >
      {item.status === "claimed" ? "已找回" : "待认领"}
    </div>
  );
}
export function ViewLogs({ logs }: { logs: ViewLog[] }) {
  if (!logs.length)
    return <div className="view-log-empty">暂无人填写信息查看联系方式</div>;
  return (
    <>
      {logs.map((log, index) => (
        <div className="view-log-item" key={log.viewerId + index}>
          <div>
            <strong>
              {[
                log.identity || "",
                log.name || "",
                log.idNo ? `（${log.idNo}）` : "",
              ]
                .join(" ")
                .trim() || "未知"}
            </strong>
            {log.className ? ` · ${log.className}` : ""}
          </div>
          <div className="when">
            {formatTime(log.unlockedAt)} 查看了
            {(log.viewedFields || ["失物招领处", "联系人", "联系方式"]).join(
              "、",
            )}
          </div>
          {log.contact && (
            <>
              <br />
              联系：{log.contact}
            </>
          )}
        </div>
      ))}
    </>
  );
}
export function ItemCard({
  item,
  onOpen,
}: {
  item: Item;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={
        "item-card" +
        (item.status === "claimed" ? " claimed" : "") +
        (item.verified ? " verified-lock" : "")
      }
      onClick={() => onOpen(item.id)}
    >
      {item.verified && (
        <div className="lock-overlay">
          <div className="lock-mark">
            <LockIcon />
            <div className="lock-text">已锁定</div>
          </div>
        </div>
      )}
      <img src={appUrl(item.image)} alt={item.description} />
      <div className="item-body">
        <StatusBadge item={item} />
        {item.verified && (
          <>
            {" "}
            <div className="badge badge-locked">已核对锁定</div>
          </>
        )}
        <h3>{item.description}</h3>
        <div className="meta">
          {item.place}
          <br />
          {formatTime(item.createdAt)}
        </div>
      </div>
    </button>
  );
}
interface HistoryProps {
  active: boolean;
  items: Item[];
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
}
export function HistoryPanel({
  active,
  items,
  onEdit,
  onDelete,
}: HistoryProps) {
  return (
    <section className={"panel" + (active ? " active" : "")} id="panel-history">
      <div className="panel-head">
        <h1>我发布的历史</h1>
        <p>
          可修改或删除自己发布的帖子。已被失主登记「已找回」的帖子不可再修改。
        </p>
      </div>
      <div className="toolbar">
        <span className="count" id="historyCount">
          共 {items.length} 条
        </span>
      </div>
      <div className="history-list" id="historyList">
        {items.map((item) => (
          <article
            className={"history-card" + (item.verified ? " verified-lock" : "")}
            key={item.id}
          >
            <img src={appUrl(item.image)} alt={item.description} />
            <div>
              {item.verified && (
                <div className="lock-inline">
                  <LockIcon />
                  <span>已核对锁定</span>
                </div>
              )}
              <StatusBadge item={item} />
              <h3>{item.description}</h3>
              <div className="meta">
                {`${item.office} · ${item.place}`}
                <br />
                {formatTime(item.createdAt)}
              </div>
            </div>
            <div className="history-actions">
              <button
                type="button"
                className="btn btn-primary btn-edit"
                disabled={item.status === "claimed" || !!item.verified}
                onClick={() => onEdit(item)}
              >
                修改
              </button>
              <button
                type="button"
                className="btn btn-danger btn-del"
                disabled={!!item.verified}
                onClick={() => onDelete(item)}
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="empty" id="historyEmpty" hidden={items.length > 0}>
        你还没有发布过帖子。去「我捡到了」上传一件吧。
      </div>
    </section>
  );
}
interface AdminProps {
  active: boolean;
  items: Item[];
  onOpen: (id: string) => void;
  onDelete: (item: Item) => void;
  onClaim: (item: Item) => void;
}
export function AdminPanel({
  active,
  items,
  onOpen,
  onDelete,
  onClaim,
}: AdminProps) {
  return (
    <section className={"panel" + (active ? " active" : "")} id="panel-admin">
      <div className="panel-head">
        <h1>管理核对</h1>
        <p>
          右侧为「查看联系信息」历史：谁、何时填写个人信息后查看了失物招领处与联系方式。也可核对或删除帖子。
        </p>
      </div>
      <div className="toolbar">
        <span className="count" id="adminCount">
          共 {items.length} 条 · 锁定 {items.filter((i) => i.verified).length} ·
          查看记录 {items.reduce((n, i) => n + i.viewLogs.length, 0)}
        </span>
      </div>
      <div className="history-list" id="adminList">
        {items.map((item) => (
          <article
            className={"admin-card" + (item.verified ? " verified-lock" : "")}
            key={item.id}
          >
            <img src={appUrl(item.image)} alt={item.description} />
            <div>
              <StatusBadge item={item} />{" "}
              {item.verified ? (
                <div className="lock-inline">
                  <LockIcon />
                  <span>已核对锁定</span>
                </div>
              ) : (
                <div className="badge badge-open">待核对</div>
              )}
              <h3>{item.description}</h3>
              <div className="meta">
                {`${item.office} · ${item.place}`}
                <br />
                {item.claim
                  ? `失主：${item.claim.name || ""}（${item.claim.idNo || "无学号"}）`
                  : "尚未有人登记找回"}
                <br />
                {formatTime(item.createdAt)}
              </div>
            </div>
            <div className="view-log-col">
              <div className="col-title">
                查看历史（{item.viewLogs.length}）
              </div>
              <ViewLogs logs={item.viewLogs} />
            </div>
            <div className="history-actions">
              <button
                type="button"
                className={
                  "btn " +
                  (item.status === "claimed" ? "btn-accent" : "btn-primary") +
                  " btn-toggle-claim"
                }
                disabled={!!item.verified}
                onClick={() => onClaim(item)}
              >
                {item.status === "claimed" ? "取消已找回" : "标记已找回"}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-view"
                onClick={() => onOpen(item.id)}
              >
                查看核对
              </button>
              <button
                type="button"
                className="btn btn-danger btn-adel"
                onClick={() => onDelete(item)}
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="empty" id="adminEmpty" hidden={items.length > 0}>
        当前没有帖子。
      </div>
    </section>
  );
}
