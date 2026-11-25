import { useCallback, useEffect, useState } from "react";
import { api, message } from "../api";
import type { LostPost } from "../../shared/lost";
import { appUrl } from "../paths";

interface Props {
  active: boolean;
  notify: (msg: string) => void;
}

export function LostPanel({ active, notify }: Props) {
  const [posts, setPosts] = useState<LostPost[]>([]);
  const [description, setDescription] = useState("");
  const [place, setPlace] = useState("");
  const [lostFrom, setLostFrom] = useState("");
  const [lostTo, setLostTo] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const data = await api<{ posts: LostPost[] }>("/api/lost-posts?mine=1");
    setPosts(data.posts);
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh().catch((err) => notify("加载寻物失败：" + message(err)));
  }, [active, refresh, notify]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const data = await api<{ post: LostPost; notice?: string }>(
        "/api/lost-posts",
        {
          method: "POST",
          json: {
            description: description.trim(),
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
      await refresh();
      notify(
        status === "found"
          ? "已确认找回"
          : status === "closed"
            ? "已关闭寻物"
            : "已更新",
      );
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
            onChange={(e) => setDescription(e.currentTarget.value)}
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
      <div className="panel-head">
        <h3>我的寻物</h3>
      </div>
      <div className="card-list">
        {posts.length === 0 && (
          <p className="muted">还没有寻物帖。发布后将在每日配对后提醒。</p>
        )}
        {posts.map((post) => (
          <article key={post.id} className="item-card">
            <div className="item-main">
              <h3>{post.description}</h3>
              <p className="muted">
                {post.place || "地点未填"} ·{" "}
                {post.status === "open"
                  ? "寻找中"
                  : post.status === "found"
                    ? "已找回"
                    : "已关闭"}
                {post.batchHint === "pending_batch"
                  ? " · 已发布，将在每日配对后提醒"
                  : post.batchHint === "no_candidates"
                    ? " · 本次暂未找到候选"
                    : ""}
              </p>
              {post.image ? (
                <img src={appUrl(post.image)} alt="" className="thumb" />
              ) : null}
            </div>
            {post.status === "open" && (
              <div className="item-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => void setStatus(post, "found")}
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
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
