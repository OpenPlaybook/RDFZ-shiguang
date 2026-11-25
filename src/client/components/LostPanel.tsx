import { useCallback, useEffect, useRef, useState } from "react";
import { api, message } from "../api";
import type { LostPost } from "../../shared/lost";
import { appUrl } from "../paths";

interface Props {
  active: boolean;
  notify: (msg: string) => void;
}

function statusLabel(post: LostPost) {
  if (post.status === "found") return "已找回";
  if (post.status === "open") return "寻找中";
  return "已关闭";
}

function batchLabel(post: LostPost) {
  if (post.batchHint === "pending_batch") return " · 已发布，将在每日配对后提醒";
  if (post.batchHint === "no_candidates") return " · 本次暂未找到候选";
  return "";
}

/** 过简描述：短词组且缺少颜色/形态等特征词。 */
export function isTooSimpleDescription(raw: string): boolean {
  const t = raw.trim().replace(/\s+/g, "");
  if (!t) return true;
  if (
    /[的色式型号折叠指针金银黑白红蓝绿黄灰粉紫橙棕]|多|双|单|大|小|新|旧|破|划痕|写有|带有|印有/.test(
      t,
    )
  )
    return false;
  if (t.length <= 4) return true;
  if (t.length <= 6 && !/[，,、．.；;\d]/.test(t)) return true;
  return false;
}

export function LostPanel({ active, notify }: Props) {
  const [posts, setPosts] = useState<LostPost[]>([]);
  const [description, setDescription] = useState("");
  const [place, setPlace] = useState("");
  const [lostFrom, setLostFrom] = useState("");
  const [lostTo, setLostTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [listTab, setListTab] = useState<"active" | "history">("active");
  const [simpleWarned, setSimpleWarned] = useState(false);
  const [recoverTarget, setRecoverTarget] = useState<LostPost | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    const data = await api<{ posts: LostPost[] }>("/api/lost-posts?mine=1");
    setPosts(data.posts);
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh().catch((err) => notify("加载寻物失败：" + message(err)));
  }, [active, refresh, notify]);

  useEffect(() => {
    if (recoverTarget) confirmBtnRef.current?.focus();
  }, [recoverTarget]);

  const activePosts = posts.filter((post) => post.status === "open");
  const historyPosts = posts.filter((post) => post.status !== "open");
  const shown = listTab === "active" ? activePosts : historyPosts;

  async function submit(forceSimple = false) {
    if (busy) return;
    const text = description.trim();
    if (!text) {
      notify("请填写物品描述");
      return;
    }
    if (!forceSimple && isTooSimpleDescription(text) && !simpleWarned) {
      window.alert("输入的物品描述太过简单，请更具体一点");
      setSimpleWarned(true);
      return;
    }
    setBusy(true);
    try {
      const data = await api<{ post: LostPost; notice?: string }>(
        "/api/lost-posts",
        {
          method: "POST",
          json: {
            description: text,
            place: place.trim(),
            lostFrom: lostFrom || null,
            lostTo: lostTo || null,
          },
        },
      );
      setDescription("");
      setPlace("");
      setLostFrom("");
      setLostTo("");
      setSimpleWarned(false);
      setListTab("active");
      await refresh();
      notify(data.notice || "已发布寻物");
    } catch (err) {
      notify(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(post: LostPost, status: LostPost["status"]) {
    try {
      await api(`/api/lost-posts/${post.id}`, {
        method: "PATCH",
        json: { status },
      });
      if (status === "found" || status === "closed") setListTab("history");
      await refresh();
      notify(
        status === "found"
          ? "已确认找回，可在历史发布中删除"
          : status === "closed"
            ? "已关闭寻物"
            : "已更新",
      );
    } catch (err) {
      notify(message(err));
    }
  }

  async function remove(post: LostPost) {
    if (!window.confirm("确定删除这条寻物记录吗？删除后不可恢复。")) return;
    try {
      await api(`/api/lost-posts/${encodeURIComponent(post.id)}`, {
        method: "DELETE",
      });
      await refresh();
      notify("已删除寻物记录");
    } catch (err) {
      notify(message(err));
    }
  }

  return (
    <section
      className={"panel" + (active ? " active" : "")}
      id="panel-lost"
    >
      <div className="panel-head">
        <h1>发寻物</h1>
        <p>
          丢失物品的同学可在此发布寻物启事（不必上传照片）。暂无 AI
          时也可发布；每日配对后会在「消息」里提醒可能线索。
        </p>
      </div>
      <div className="form-grid" style={{ marginBottom: 24 }}>
        <label>
          物品描述（必填）
          <textarea
            rows={4}
            value={description}
            onChange={(e) => {
              setDescription(e.currentTarget.value);
              setSimpleWarned(false);
            }}
            placeholder="例如：灰色保温杯，杯盖有划痕"
          />
        </label>
        <label>
          可能丢失地点（可选）
          <input
            value={place}
            onChange={(e) => setPlace(e.currentTarget.value)}
            placeholder="不清楚可留空"
          />
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <label>
            丢失时间起（可选）
            <input
              type="date"
              value={lostFrom}
              onChange={(e) => setLostFrom(e.currentTarget.value)}
            />
          </label>
          <label>
            丢失时间止（可选）
            <input
              type="date"
              value={lostTo}
              onChange={(e) => setLostTo(e.currentTarget.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !description.trim()}
          onClick={() => void submit()}
        >
          发布寻物
        </button>
      </div>
      <div className="lost-list-tabs" role="tablist" aria-label="寻物列表">
        <button
          type="button"
          role="tab"
          aria-selected={listTab === "active"}
          className={
            "lost-list-tab" + (listTab === "active" ? " active" : "")
          }
          onClick={() => setListTab("active")}
        >
          我的寻物{activePosts.length ? `（${activePosts.length}）` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={listTab === "history"}
          className={
            "lost-list-tab" + (listTab === "history" ? " active" : "")
          }
          onClick={() => setListTab("history")}
        >
          历史发布{historyPosts.length ? `（${historyPosts.length}）` : ""}
        </button>
      </div>
      <div className="card-list">
        {shown.length === 0 && (
          <p className="muted">
            {listTab === "active"
              ? "还没有进行中的寻物。发布后将在每日配对后提醒。"
              : "还没有历史寻物。确认找回或关闭后会出现在这里。"}
          </p>
        )}
        {shown.map((post) => (
          <article key={post.id} className="item-card">
            <div className="item-main">
              <h3>{post.description}</h3>
              <p className="muted">
                {post.place || "地点未填"} · {statusLabel(post)}
                {batchLabel(post)}
              </p>
              {post.image ? (
                <img src={appUrl(post.image)} alt="" className="thumb" />
              ) : null}
            </div>
            {post.status === "open" ? (
              <div className="item-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setRecoverTarget(post)}
                >
                  确认找回
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void setStatus(post, "closed")}
                >
                  关闭
                </button>
              </div>
            ) : (
              <div className="item-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => void remove(post)}
                >
                  删除
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {recoverTarget ? (
        <div
          className="confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recoverConfirmTitle"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRecoverTarget(null);
          }}
        >
          <div className="confirm-card">
            <p id="recoverConfirmTitle">确认已找回？</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setRecoverTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                ref={confirmBtnRef}
                autoFocus
                onClick={() => {
                  const post = recoverTarget;
                  setRecoverTarget(null);
                  if (post) void setStatus(post, "found");
                }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
