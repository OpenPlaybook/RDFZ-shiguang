import type { FoundModel } from "../hooks/useFound";
import { OFFICES, CONTACT_TYPES } from "../../shared/constants";
export function FoundPanel({
  active,
  m,
  notify,
}: {
  active: boolean;
  m: FoundModel;
  notify: (text: string) => void;
}) {
  return (
    <section className={"panel" + (active ? " active" : "")} id="panel-found">
      <div className="panel-head">
        <h1>拍照上传捡到的物品</h1>
        <p>
          物品描述可由拍照后 AI
          识别；场所、招领处与联系信息也可从一段文字一键提取。
        </p>
      </div>
      <div className="found-grid">
        <div className="camera-box">
          <div className="preview-wrap">
            <video
              id="video"
              playsInline
              muted
              ref={m.videoRef}
              className={m.live ? "live" : ""}
            ></video>
            <img
              id="previewImg"
              alt="物品预览"
              src={m.image || undefined}
              className={m.image && !m.live ? "show" : ""}
            />
            <div
              className="preview-placeholder"
              id="previewHint"
              hidden={!!m.image || m.live}
            >
              <strong>准备拍摄</strong>
              点击下方按钮打开摄像头，或从相册选择照片
            </div>
          </div>
          <div className="cam-actions">
            <button
              type="button"
              className="btn btn-primary"
              id="btnCamera"
              onClick={() => void m.startCamera()}
            >
              打开摄像头
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              id="btnCapture"
              disabled={!m.live}
              onClick={m.capture}
            >
              拍照
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              id="btnPick"
              onClick={() => m.fileRef.current?.click()}
            >
              从相册选择
            </button>
            <input
              type="file"
              id="fileInput"
              accept="image/*"
              capture="environment"
              hidden
              ref={m.fileRef}
              onChange={(e) => {
                m.pick(e.currentTarget.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </div>
          <div className="ai-box">
            <div className="ai-box-head">
              <div className="label">AI 识别</div>
            </div>
            <div
              className={"ai-status" + (m.thinking ? " thinking" : "")}
              id="aiStatus"
            >
              {m.status}
            </div>
          </div>
        </div>

        <form
          className="form-fields"
          id="foundForm"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void m.submit();
          }}
        >
          <input type="hidden" id="editId" value={m.editId} />
          <div className="text-fill-panel">
            <textarea
              id="fillText"
              rows={2}
              placeholder="可粘贴一段说明，例如：图书馆二楼捡的，交图书馆总服务台，联系人小唐，电话13800138000"
              value={m.fillText}
              onChange={(e) => m.setFillText(e.currentTarget.value)}
            ></textarea>
            <button
              type="button"
              className="btn btn-ghost btn-text-extract"
              id="btnTextExtract"
              disabled={m.fillBusy}
              onClick={() => void m.extract()}
            >
              {m.fillBusy ? "提取中…" : "从文字提取"}
            </button>
          </div>
          <label>
            物品描述
            <span className="hint">拍照后 AI 自动识别，可修改补充</span>
            <textarea
              id="description"
              placeholder="例如：粉红色水杯 / 上面写有 1356 的饭卡"
              value={m.form.description}
              onChange={(e) => m.setField("description", e.currentTarget.value)}
            ></textarea>
          </label>
          <label>
            所在失物招领处
            <select
              id="office"
              value={m.form.office}
              onChange={(e) => m.setField("office", e.currentTarget.value)}
            >
              <option value="">请选择失物招领处</option>
              {OFFICES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            捡到场所
            <input
              id="place"
              placeholder="例如：图书馆二楼自习室 / 食堂三楼窗口旁"
              value={m.form.place}
              onChange={(e) => m.setField("place", e.currentTarget.value)}
            />
          </label>
          <label>
            联系人（选填）
            <input
              id="contact"
              placeholder="例如：小唐 / 某某老师"
              value={m.form.contact}
              onChange={(e) => m.setField("contact", e.currentTarget.value)}
            />
          </label>
          <label>
            联系方式（选填）
            <span className="hint">可选电话、邮箱、微信等</span>
            <div className="contact-row">
              <select
                id="contactType"
                aria-label="联系方式类型"
                value={m.form.contactType}
                onChange={(e) =>
                  m.setField("contactType", e.currentTarget.value)
                }
              >
                <option value="">类型</option>
                {CONTACT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <input
                id="contactValue"
                placeholder="填写对应号码或账号"
                value={m.form.contactValue}
                onChange={(e) =>
                  m.setField("contactValue", e.currentTarget.value)
                }
              />
            </div>
          </label>
          <button
            type="submit"
            className="btn btn-accent"
            id="btnSubmit"
            disabled={m.busy}
          >
            {m.busy
              ? m.editId
                ? "保存中…"
                : "提交中…"
              : m.editId
                ? "保存修改"
                : "提交到失物招领"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            id="btnCancelEdit"
            hidden={!m.editId}
            onClick={() => {
              m.reset();
              notify("已取消修改");
            }}
          >
            取消修改
          </button>
        </form>
      </div>
    </section>
  );
}
