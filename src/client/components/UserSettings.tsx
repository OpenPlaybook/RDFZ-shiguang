import { useState } from "react";
import type { SessionView } from "../../shared/identity";

interface Props {
  open: boolean;
  session: SessionView;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onChangePassword: (input: {
    currentPassword: string;
    newPassword: string;
  }) => void;
  onLogout: () => void;
}

export function UserSettings({
  open,
  session,
  busy,
  error,
  onClose,
  onChangePassword,
  onLogout,
}: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  if (!open) return null;
  return (
    <div
      className="login-modal"
      id="userSettingsModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="userSettingsTitle"
    >
      <div className="login-card">
        <div className="brand" id="userSettingsTitle">
          用户设置
        </div>
        <p className="lead">
          当前试用身份：{session.name} · {session.className}
        </p>
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            setLocalError("");
            if (newPassword !== confirmPassword) {
              setLocalError("两次输入的新密码不一致");
              return;
            }
            onChangePassword({ currentPassword, newPassword });
          }}
        >
          <label>
            当前密码
            <input
              type="password"
              value={currentPassword}
              autoComplete="current-password"
              onChange={(e) => setCurrentPassword(e.currentTarget.value)}
              required
            />
          </label>
          <label>
            新密码
            <input
              type="password"
              value={newPassword}
              autoComplete="new-password"
              onChange={(e) => setNewPassword(e.currentTarget.value)}
              required
            />
          </label>
          <label>
            确认新密码
            <input
              type="password"
              value={confirmPassword}
              autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
              required
            />
          </label>
          {localError || error ? (
            <p className="login-error" role="alert">
              {localError || error}
            </p>
          ) : null}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={!!busy}
          >
            {busy ? "保存中…" : "修改密码"}
          </button>
        </form>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: "100%", marginTop: 8 }}
          onClick={onLogout}
        >
          退出登录
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: "100%", marginTop: 8 }}
          onClick={onClose}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
