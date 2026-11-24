import type { AiStatus } from "../../shared/types";
import type { Panel } from "../state";
interface Props {
  ai: AiStatus;
  admin: boolean;
  panel: Panel;
  onBack: () => void;
  onRole: () => void;
  onPanel: (panel: Panel) => void;
}
export function Header({ admin, ai, panel, onBack, onRole, onPanel }: Props) {
  return (
    <header>
      <button
        type="button"
        className="brand-btn"
        id="backGate"
        title="返回入口"
        onClick={onBack}
      >
        拾光
      </button>
      <div className="header-right">
        <span className={"role-badge" + (admin ? " admin" : "")} id="roleBadge">
          {admin ? "管理人员" : "使用者"}
        </span>
        <button
          type="button"
          className="ai-config-btn"
          id="switchRoleBtn"
          title="切换身份"
          onClick={onRole}
        >
          切换身份
        </button>

        <span
          className="ai-config-btn admin-only"
          hidden={!admin}
          role="status"
          title={ai.configured ? "DeepSeek 已配置" : "DeepSeek 未配置"}
          style={{ cursor: "default" }}
        >
          <span className={"ai-dot" + (ai.configured ? " on" : "")}></span>
          <span>{ai.configured ? "服务器 AI 已就绪" : "服务器 AI 未配置"}</span>
        </span>
        <nav className="nav-tabs" aria-label="功能切换">
          <button
            type="button"
            className={panel === "found" ? "active" : ""}
            data-panel="found"
            onClick={() => onPanel("found")}
          >
            我捡到了
          </button>
          <button
            type="button"
            data-panel="browse"
            onClick={() => onPanel("browse")}
            className={panel === "browse" ? "active" : ""}
          >
            浏览招领
          </button>
          <button
            type="button"
            data-panel="lost"
            onClick={() => onPanel("lost")}
            className={panel === "lost" ? "active" : ""}
          >
            发寻物
          </button>
          <button
            type="button"
            data-panel="messages"
            onClick={() => onPanel("messages")}
            className={panel === "messages" ? "active" : ""}
          >
            消息
          </button>
          <button
            type="button"
            data-panel="history"
            onClick={() => onPanel("history")}
            className={panel === "history" ? "active" : ""}
          >
            我发布的历史
          </button>
          <button
            type="button"
            className={panel === "admin" ? "active admin-only" : "admin-only"}
            data-panel="admin"
            id="navAdmin"
            hidden={!admin}
            onClick={() => onPanel("admin")}
          >
            管理核对
          </button>
        </nav>
      </div>
    </header>
  );
}
