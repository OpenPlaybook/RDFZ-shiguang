import { useState } from "react";
import { LOCAL_TRIAL_HINTS } from "../test-actors";

interface Props {
  open: boolean;
  busy?: boolean;
  error?: string;
  onLogin: (input: {
    name: string;
    className: string;
    password: string;
  }) => void;
}
export function LoginRequired({ open, busy, error, onLogin }: Props) {
  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [password, setPassword] = useState("");
  if (!open) return null;
  return (
    <div
      className="login-modal login-modal-gate"
      id="loginModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loginTitle"
    >
      <div className="login-card">
        <div className="brand" id="loginTitle">
          登录拾光
        </div>
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            onLogin({
              name: name.trim(),
              className: className.trim(),
              password,
            });
          }}
        >
          <p className="lead">
            请填写姓名、班级和密码后进入。未登录不能使用本站。
          </p>
          <label>
            姓名
            <input
              id="loginName"
              value={name}
              autoComplete="username"
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="例如：小李"
              required
              autoFocus
            />
          </label>
          <label>
            班级
            <input
              id="loginClass"
              value={className}
              onChange={(e) => setClassName(e.currentTarget.value)}
              placeholder="例如：高一一班"
              required
            />
          </label>
          <label>
            密码
            <input
              id="loginPassword"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.currentTarget.value)}
              placeholder="请输入密码"
              required
            />
          </label>
          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="hint muted">
            试用账号：
            {LOCAL_TRIAL_HINTS.map((row, index) => (
              <span key={row.name}>
                {index ? "；" : ""}
                {row.name} / {row.className}
              </span>
            ))}
          </p>
          <button
            type="submit"
            className="btn btn-primary"
            id="btnLoginSubmit"
            style={{ width: "100%" }}
            disabled={!!busy}
          >
            {busy ? "登录中…" : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
