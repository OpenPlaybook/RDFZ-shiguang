import {
  cameraAvailabilityMessage,
  cameraErrorMessage,
  openCamera,
} from "../camera";
import { appUrl } from "../paths";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiStatus, FillFields, Item } from "../../shared/types";
import { DEFAULT_OFFICE, CONTACT_TYPES } from "../../shared/constants";
import { ApiError, api, getPublisherId, message } from "../api";
import type { ReviewIssue } from "../../shared/publication";
import { compressImage, dataUrlToBlob, runLocalFallback } from "../images";
import {
  localExtractFillFields,
  matchOffice,
  matchContactType,
} from "../recognition";
const empty = {
  description: "",
  place: "",
  office: DEFAULT_OFFICE,
  note: "",
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
    generation.current++;
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
      blob.current = dataUrlToBlob(ready);
      setThinking(true);
      if (!ai.configured) {
        setStatus("服务器未配置 AI，改用本地简易识别");
        const result = await runLocalFallback(ready);
        if (token !== generation.current) return;
        setField("description", result);
        setStatus(`本地简易识别：${result}。建议配置大模型。`);
      } else {
        setStatus(`正在调用 ${ai.model} 识别物品…`);
        const image = await compressImage(ready);
        const result = await api<{ text: string }>("/api/ai/vision", {
          method: "POST",
          json: { image },
          signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(45000)]),
        });
        if (token !== generation.current) return;
        setField("description", result.text);
        setStatus(`服务器 AI 已提取：${result.text}`);
        document.getElementById("description")?.focus();
      }
    } catch (err) {
      if (token !== generation.current || ctrl.signal.aborted) return;
      setStatus(`识别失败：${message(err)}`);
      notify("大模型识别失败");
    } finally {
      if (token === generation.current) setThinking(false);
    }
  }
  function pick(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    const token = ++generation.current;
    reader.onload = () => {
      if (token === generation.current && mounted.current)
        void preview(String(reader.result));
    };
    reader.onerror = () => notify("读取图片失败，请换一张再试");
    reader.readAsDataURL(file);
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
  async function submit() {
    if (submitting.current) return;
    if (!image && !editId) {
      notify("请先拍照或从相册选择图片");
      return;
    }
    for (const [field, tip] of [
      ["description", "请填写物品描述"],
      ["office", "请填写所在失物招领处"],
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
      const data = new FormData();
      data.append("ownerId", getPublisherId());
      for (const [key, value] of Object.entries(form))
        data.append(key, value.trim());
      if (blob.current) data.append("image", blob.current, "item.jpg");
      await api(
        editId ? `/api/items/${encodeURIComponent(editId)}` : "/api/items",
        { method: editId ? "PATCH" : "POST", body: data },
      );
      notify(
        editId ? "修改已通过审核并公开" : "已通过审核并公开",
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
          err.reviewStatus === "unavailable" || err.status === 503
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
    setReviewIssues([]);
    setForm({
      description: item.description,
      office: item.office || DEFAULT_OFFICE,
      place: item.place,
      note: item.note || "",
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
    pick,
    capture,
    extract,
    submit,
    edit,
    reset,
  };
}
export type FoundModel = ReturnType<typeof useFound>;
