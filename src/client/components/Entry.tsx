import type { Panel, Screen, Role } from "../state";
interface Props {
  screen: Screen;
  selected: Role;
  pin: string;
  busy: boolean;
  onSelect: (role: Role) => void;
  onPin: (pin: string) => void;
  onEnter: () => void;
  onPanel: (panel: Panel) => void;
}
export function Entry({
  screen,
  selected,
  pin,
  busy,
  onSelect,
  onPin,
  onEnter,
  onPanel,
}: Props) {
  return (
    <>
      <div
        className="login-modal"
        id="loginModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="loginTitle"
        hidden={screen !== "login"}
      >
        <div className="login-card">
          <div className="brand" id="loginTitle">
            拾光
          </div>
          <p className="lead">
            请选择身份进入。下次打开将默认记住你的选择，仍可在此更换。
          </p>
          <div className="role-pick">
            <button
              type="button"
              className={"role-option" + (selected === "user" ? " active" : "")}
              data-role="user"
              id="roleUser"
              onClick={() => onSelect("user")}
            >
              <div className="role-tag">User</div>
              <h3>使用者</h3>
              <p>发布捡到物品、浏览寻找、登记已找回。无需注册。</p>
            </button>
            <button
              type="button"
              className={
                "role-option admin" + (selected === "admin" ? " active" : "")
              }
              data-role="admin"
              id="roleAdmin"
              onClick={() => onSelect("admin")}
            >
              <div className="role-tag">Admin</div>
              <h3>管理人员</h3>
              <p>具备全部功能，并可删除帖子、核对信息。</p>
            </button>
          </div>
          <label
            id="adminPinWrap"
            hidden={selected !== "admin"}
            style={{
              display: selected === "admin" ? "grid" : "none",
              textAlign: "left",
              marginBottom: "14px",
            }}
          >
            管理员口令
            <input
              id="adminPinInput"
              type="password"
              placeholder="请输入管理员口令"
              autoComplete="off"
              style={{ marginTop: "8px" }}
              value={pin}
              onChange={(e) => onPin(e.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            id="btnEnterSystem"
            style={{ width: "100%" }}
            onClick={onEnter}
            disabled={busy}
          >
            进入系统
          </button>
        </div>
      </div>
      <div
        className="gate"
        id="gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gateTitle"
        hidden={screen !== "gate"}
      >
        <div className="gate-inner">
          <div className="gate-brand" id="gateTitle">
            拾光
          </div>
          <p className="gate-sub">
            校园失物招领站。捡到物品可拍照上传并选择招领处；丢了东西也能按关键词或时间查找线索。
          </p>
          <div className="gate-modules">
            <button
              type="button"
              className="gate-card found"
              id="enterFound"
              onClick={() => onPanel("found")}
            >
              <div className="tag">Module 01</div>
              <h2>我捡到了</h2>
              <p>拍照识别物品，填写场所与联系信息，提交到失物招领。</p>
              <div className="arrow">开始上传 →</div>
            </button>
            <button
              type="button"
              className="gate-card lost"
              id="enterLost"
              onClick={() => onPanel("browse")}
            >
              <div className="tag">Module 02</div>
              <h2>我丢了东西</h2>
              <p>
                按关键词或时间区间浏览捡到物品；找回后可登记锁定，防止冒名领取。
              </p>
              <div className="arrow">去看看 →</div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
