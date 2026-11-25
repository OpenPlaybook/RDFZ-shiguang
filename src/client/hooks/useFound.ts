import {
  cameraAvailabilityMessage,
  cameraErrorMessage,
  openCamera,
} from "../camera";
import { appUrl } from "../paths";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiStatus, FillFields, Item } from "../../shared/types";
import { OFFICES, CONTACT_TYPES } from "../../shared/constants";
import { ApiError, api, message } from "../api";
import type { ReviewIssue } from "../../shared/publication";
import {
  compressImage,
  dataUrlToBlob,
  dataUrlToJpegFile,
  sniffImageKind,
  toJpegDataUrl,
  runLocalFallback,
} from "../images";
import {
  localExtractFillFields,
  matchOffice,
  matchContactType,
} from "../recognition";
const empty = {
  description: "",
  place: "",
  office: "",
  contact: "",
  contactType: "",
  contactValue: "",
};
export function useFound(
  ai: AiStatus,
  notify: (text: string) => void,
  onPublished: () => Promise<void>,
) {
  const [form, setForm] = useState(empty),
    [editId, setEditId] = useState(""),
    [baseRevision, setBaseRevision] = useState(0),
    [image, setImage] = useState(""),
    [live, setLive] = useState(false),
    [busy, setBusy] = useState(false),
    [fillBusy, setFillBusy] = useState(false),
    [fillText, setFillText] = useState(""),
    [status, setStatus] = useState(""),
    [thinking, setThinking] = useState(false),
    [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    stream = useRef<MediaStream | null>(null),
    blob = useRef<Blob | null>(null),
    generation = useRef(0),
    request = useRef<AbortController | null>(null),
    fillRequest = useRef<AbortController | null>(null),
    submitting = useRef(false),
    filling = useRef(false),
    mounted = useRef(true),
    cameraGeneration = useRef(0);
  const setField = (key: keyof typeof empty, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const stopCamera = useCallback(() => {
    cameraGeneration.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
  }, []);
  const cancel = useCallback(() => {
    generation.current++;
    request.current?.abort();
    fillRequest.current?.abort();
    filling.current = false;
    setFillBusy(false);
    setThinking(false);
    stopCamera();
  }, [stopCamera]);
  const dispose = useCallback(() => {
    mounted.current = false;
    cameraGeneration.current++;
    request.current?.abort();
    fillRequest.current?.abort();
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);
  useEffect(() => {
    mounted.current = true;
    return dispose;
  }, [dispose]);
  const reset = () => {
    cancel();
    setForm(empty);
    setEditId("");
    setBaseRevision(0);
    setImage("");
    blob.current = null;
    setFillText("");
    setStatus("");
    setReviewIssues([]);
  };
  async function startCamera() {
    stopCamera();
    const token = ++cameraGeneration.current;
    const unavailable = cameraAvailabilityMessage();
    if (unavailable) {
      notify(unavailable);
      return;
    }
    const video = videoRef.current;
    if (!video) {
      notify("拍摄区域尚未就绪，请重试");
      return;
    }
    try {
      const next = await openCamera(
        video,
        () => token === cameraGeneration.current && mounted.current,
        (acquired) => {
          stream.current = acquired;
        },
      );
      if (!next) return;
      setLive(true);
      notify("摄像头已打开");
    } catch (error) {
      if (token === cameraGeneration.current) {
        stream.current = null;
        setLive(false);
        notify(cameraErrorMessage(error));
      }
    }
  }

  async function recognize(ready: string, token: number, ctrl: AbortController) {
    setThinking(true);
    try {
      if (!ai.configured) {
        setStatus("服务器未配置 AI，改用本地简易识别");
        const result = await runLocalFallback(ready);
        if (token !== generation.current) return;
        setField("description", result);
        setStatus(`本地简易识别：${result}。建议配置大模型。`);
      } else {
        setStatus(`正在调用 ${ai.model} 识别物品…`);
        const visionImage = await compressImage(ready);
        const result = await api<{ text: string }>("/api/ai/vision", {
          method: "POST",
          json: { image: visionImage },
          signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(45000)]),
        });
        if (token !== generation.current) return;
        setField("description", result.text);
        setStatus(`服务器 AI 已提取：${result.text}`);
        document.getElementById("description")?.focus();
      }
    } catch (err) {
      if (token !== generation.current || ctrl.signal.aborted) return;
      setStatus(`识别失败（照片仍可提交）：${message(err)}`);
      notify("自动识别失败，请手动填写物品描述后提交");
    } finally {
      if (token === generation.current) setThinking(false);
    }
  }

  /** 摄像头拍照：得到 data URL 后再压成真正的 JPEG。 */
  async function preview(src: string) {
    const token = ++generation.current;
    request.current?.abort();
    fillRequest.current?.abort();
    setFillBusy(false);
    filling.current = false;
    const ctrl = new AbortController();
    request.current = ctrl;
    stopCamera();
    try {
      const ready = await compressImage(src, 960, 0.72);
      if (token !== generation.current) return;
      setImage(ready);
      blob.current = await dataUrlToJpegFile(ready);
      notify("照片已就绪，可继续填写并提交");
      await recognize(ready, token, ctrl);
    } catch (err) {
      if (token !== generation.current) return;
      setStatus(`图片无法处理：${message(err)}`);
      notify("照片处理失败，请重拍或换一张");
      setImage("");
      blob.current = null;
    }
  }

  /**
   * 相册选择：先按文件头识别真实格式。
   * iPhone HEIC 常被标成 .JPG/.PNG，直接当 PNG data URL 会裂图且服务器拒收。
   * 一律尽量转成真正的 JPEG 再预览/上传。
   */
  async function pick(file?: File) {
    if (!file) return;

    const token = ++generation.current;
    request.current?.abort();
    fillRequest.current?.abort();
    setFillBusy(false);
    filling.current = false;
    const ctrl = new AbortController();
    request.current = ctrl;
    stopCamera();
    setImage("");
    blob.current = null;

    notify("正在处理照片…");
    setStatus("正在处理照片…");

    const kind = await sniffImageKind(file);
    if (token !== generation.current) return;

    const ready = await toJpegDataUrl(file, 960, 0.72);
    if (token !== generation.current) return;

    if (!ready) {
      const tip =
        "无法解码该图片。请换一张，或截图后再上传（几乎所有格式截图后都能用）";
      setStatus(tip);
      notify(tip);
      return;
    }

    setImage(ready);
    blob.current = await dataUrlToJpegFile(ready);
    notify("照片已就绪，可继续填写并提交");
    setStatus(
      kind === "heic"
        ? "已自动转换为通用 JPEG，可继续填写并提交"
        : "照片已载入。正在尝试识别…",
    );
    await recognize(ready, token, ctrl);
  }
  function capture() {
    const video = videoRef.current;
    if (!stream.current || !video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas
      .getContext("2d")!
      .drawImage(video, 0, 0, canvas.width, canvas.height);
    void preview(canvas.toDataURL("image/jpeg", 0.85));
    notify("已拍照，正在识别…");
  }
  async function extract() {
    const spoken = fillText.trim();
    if (!spoken) {
      notify("请先输入说明文字");
      document.getElementById("fillText")?.focus();
      return;
    }
    if (filling.current) return;
    filling.current = true;
    setFillBusy(true);
    const ctrl = new AbortController();
    fillRequest.current = ctrl;
    const token = generation.current;
    try {
      const local = localExtractFillFields(spoken);
      let fields = local,
        usedAi = false;
      if (ai.configured) {
        try {
          const result = await api<FillFields>("/api/ai/extract", {
            method: "POST",
            json: { transcript: spoken },
            signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(45000)]),
          });
          fields = Object.fromEntries(
            Object.keys(local).map((k) => [
              k,
              result[k as keyof FillFields] || local[k as keyof FillFields],
            ]),
          ) as unknown as FillFields;
          usedAi = true;
        } catch (err) {
          if (ctrl.signal.aborted) return;
          notify("AI 提取失败：" + message(err).slice(0, 60));
        }
      }
      if (ctrl.signal.aborted || token !== generation.current) return;
      const office = matchOffice(fields.office),
        contactType = matchContactType(fields.contactType, fields.contactValue);
      const next = { ...fields, office, contactType };
      setForm((f) => ({
        ...f,
        ...Object.fromEntries(Object.entries(next).filter(([, v]) => v)),
      }));
      const bits = [
        fields.place ? "场所" : "",
        office ? "招领处" : "",
        fields.contact ? "联系人" : "",
        fields.contactValue ? "联系方式" : "",
      ].filter(Boolean);
      notify(
        bits.length
          ? (usedAi ? "已提取：" : "已填入：") + bits.join("、")
          : "未提取到可填字段，请改写后再试",
      );
    } finally {
      if (fillRequest.current === ctrl) {
        filling.current = false;
        setFillBusy(false);
      }
    }
  }
  async function stageImage(): Promise<string> {
    if (!blob.current && /^data:image\/jpeg/i.test(image))
      blob.current = dataUrlToBlob(image);
    if (!blob.current) throw new Error("请先拍照或从相册选择图片");
    const file =
      blob.current instanceof File && blob.current.type === "image/jpeg"
        ? blob.current
        : new File([blob.current], "item.jpg", { type: "image/jpeg" });
    const body = new FormData();
    body.append("image", file, "item.jpg");
    const staged = await api<{ imageRef: string }>("/api/found-posts/staging", {
      method: "POST",
      body,
    });
    return staged.imageRef;
  }

  async function submit() {
    if (submitting.current) return;
    if (!editId) {
      if (!blob.current && /^data:image\/jpeg/i.test(image))
        blob.current = dataUrlToBlob(image);
      if (!blob.current) {
        notify("请先拍照或从相册选择图片");
        return;
      }
    }
    for (const [field, tip] of [
      ["description", "请填写物品描述"],
      ["office", "请选择所在失物招领处"],
      ["place", "请填写捡到场所"],
    ] as const) {
      if (!form[field].trim()) {
        notify(tip);
        document.getElementById(field)?.focus();
        return;
      }
    }
    submitting.current = true;
    setBusy(true);
    setReviewIssues([]);
    try {
      let imageRef: string | undefined;
      if (blob.current || (!editId && /^data:image\/jpeg/i.test(image))) {
        setStatus("正在上传照片并提交审核…");
        imageRef = await stageImage();
      } else if (!editId) {
        notify("请先拍照或从相册选择图片");
        submitting.current = false;
        setBusy(false);
        return;
      } else {
        setStatus("正在提交审核…");
      }
      const payload = {
        description: form.description.trim(),
        place: form.place.trim(),
        office: form.office.trim(),
        contact: form.contact.trim(),
        contactType: form.contactType.trim(),
        contactValue: form.contactValue.trim(),
        ...(imageRef ? { imageRef } : {}),
        ...(editId ? { baseRevision } : {}),
      };
      const result = await api<{ notice?: string }>(
        editId
          ? `/api/found-posts/${encodeURIComponent(editId)}`
          : "/api/found-posts",
        { method: editId ? "PATCH" : "POST", json: payload },
      );
      notify(
        result.notice ||
          (editId ? "修改已通过审核并公开" : "已通过审核并公开"),
      );
      reset();
      await onPublished();
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) {
        setReviewIssues(err.issues);
        const first = err.issues[0];
        notify(first?.message || message(err));
        if (first?.field && first.field !== "general" && first.field !== "image")
          document.getElementById(first.field)?.focus();
        setStatus(
          err.reviewStatus === "unavailable"
            ? "审核服务暂不可用，请稍后重试（照片与填写已保留）"
            : "审核未通过，请按提示修改后重新提交（照片与填写已保留）",
        );
      } else {
        notify(message(err));
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function edit(item: Item) {
    cancel();
    setEditId(item.id);
    setBaseRevision(item.revision || 0);
    setReviewIssues([]);
    setForm({
      description: item.description,
      office: OFFICES.includes(item.office) ? item.office : OFFICES[0] || "",
      place: item.place,
      contact: item.contact,
      contactType: CONTACT_TYPES.includes(item.contactType)
        ? item.contactType
        : "",
      contactValue: item.contactValue,
    });
    setImage(appUrl(item.image));
    blob.current = null;
    setStatus("正在修改已发布内容。可更换照片或调整信息后保存。");
    notify("已载入，可修改后保存");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const defaultStatus = ai.configured
    ? `服务器 AI 已就绪（${ai.model}），拍照后自动识别。`
    : "服务器尚未配置 AI，请联系管理人员配置后再使用识图。";
  return {
    form,
    setField,
    editId,
    image,
    live,
    busy,
    fillBusy,
    fillText,
    setFillText,
    status: status || defaultStatus,
    thinking,
    reviewIssues,
    videoRef,
    fileRef,
    startCamera,
    stopCamera,
    cancel,
    pick: (file?: File) => void pick(file),
    capture,
    extract,
    submit,
    edit,
    reset,
  };
}
export type FoundModel = ReturnType<typeof useFound>;
