interface Props {
  open: boolean;
  onClose: () => void;
}
export function LoginRequired({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="login-modal"
      id="loginModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loginTitle"
    >
      <div className="login-card">
        <div className="brand" id="loginTitle">
          需要学校平台登录
        </div>
        <p className="lead">
          游客可以浏览已经公开的招领。发布、领取和个人消息使用学校平台里的姓名和班级，不在这里注册，也不用填写手机号。
        </p>
        <p className="lead">学校平台登录尚未接入，所以这些操作现在不可用。</p>
        <button
          type="button"
          className="btn btn-primary"
          id="btnCloseLogin"
          style={{ width: "100%" }}
          onClick={onClose}
        >
          返回浏览
        </button>
      </div>
    </div>
  );
}
