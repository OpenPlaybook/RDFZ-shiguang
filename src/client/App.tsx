import { useCallback, useEffect, useRef, useState } from "react";
import type { AiStatus, Item } from "../shared/types";
import { ADMIN_TOKEN_KEY, ROLE_KEY } from "../shared/constants";
import { api, getPublisherId, message } from "./api";
import type { Panel, Role, Screen } from "./state";
import { sortItems } from "./utils";
import { useFound } from "./hooks/useFound";
import { Entry } from "./components/Entry";
import { Header } from "./components/Header";
import { FoundPanel } from "./components/FoundPanel";
import { BrowsePanel } from "./components/BrowsePanel";
import { HistoryPanel, AdminPanel } from "./components/ItemCards";
import { DetailModal } from "./components/DetailModal";
import type { DetailAction } from "./components/DetailModal";
import "./styles/app.css";
export default function App() {
  const viewer = getPublisherId();
  const [lastCallLabel, setLastCallLabel] = useState("联系拾主");
  const modalScroll = useRef(0);
  const rememberModalScroll = () => {
    modalScroll.current =
      document.querySelector<HTMLElement>("#detailModal .modal-panel")
        ?.scrollTop || 0;
  };
  const initial: Role =
    localStorage.getItem(ROLE_KEY) === "admin" &&
    sessionStorage.getItem(ADMIN_TOKEN_KEY)
      ? "admin"
      : "user";
  const [role, setRole] = useState<Role>(initial),
    [selected, setSelected] = useState<Role>(initial),
    [screen, setScreen] = useState<Screen>("login"),
    [panel, setPanel] = useState<Panel>("found"),
    [pin, setPin] = useState(""),
    [loginBusy, setLoginBusy] = useState(false),
    [items, setItems] = useState<Item[]>([]),
    [ai, setAi] = useState<AiStatus>({ configured: false, model: "" }),
    [detail, setDetail] = useState(""),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [toast, setToast] = useState({ message: "", id: 0 });
  const refreshGeneration = useRef(0),
    loggingIn = useRef(false),
    actions = useRef(new Set<string>());
  const admin = role === "admin" && !!sessionStorage.getItem(ADMIN_TOKEN_KEY);
  const notify = useCallback(
    (message: string) => setToast((t) => ({ message, id: t.id + 1 })),
    [],
  );
  useEffect(() => {
    if (!toast.message) return;
    const id = setTimeout(() => setToast((t) => ({ ...t, message: "" })), 2600);
    return () => clearTimeout(id);
  }, [toast.id, toast.message]);
  useEffect(() => {
    const ctrl = new AbortController();
    void api<AiStatus>("/api/ai/status", { signal: ctrl.signal })
      .then(setAi)
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  const refresh = useCallback(async () => {
    const token = ++refreshGeneration.current;
    const data = await api<{ items: Item[] }>("/api/items");
    if (token === refreshGeneration.current) setItems(sortItems(data.items));
  }, []);
  const published = useCallback(async () => {
    await refresh();
    setPanel("history");
  }, [refresh]);
  const found = useFound(ai, notify, published);
  async function enter() {
    if (loggingIn.current) return;
    if (selected === "admin" && !pin.trim()) {
      notify("请输入管理员口令");
      document.getElementById("adminPinInput")?.focus();
      return;
    }
    loggingIn.current = true;
    setLoginBusy(true);
    try {
      if (selected === "admin") {
        const data = await api<{ token: string }>("/api/admin/login", {
          method: "POST",
          json: { pin: pin.trim() },
        });
        sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      } else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      setRole(selected);
      localStorage.setItem(ROLE_KEY, selected);
      setScreen("gate");
      if (selected !== "admin" && panel === "admin") setPanel("browse");
      try {
        await refresh();
      } catch (err) {
        notify("无法连接服务器：" + message(err));
        return;
      }
      notify(
        selected === "admin"
          ? "已以管理人员身份进入（数据全站共享）"
          : "已以使用者身份进入（数据全站共享）",
      );
    } catch (err) {
      notify(message(err));
    } finally {
      loggingIn.current = false;
      setLoginBusy(false);
    }
  }
  function onPanel(next: Panel) {
    if (next === "admin" && !admin) {
      notify("仅管理人员可进入管理核对");
      next = "browse";
    }
    if (next !== "found") found.cancel();
    setPanel(next);
    setScreen("app");
    if (next !== "found")
      void refresh().catch((err) => notify("刷新列表失败：" + message(err)));
  }
  function onBack() {
    found.cancel();
    setScreen("gate");
  }
  function onRole() {
    found.cancel();
    setSelected(role);
    setPin("");
    setScreen("login");
  }
  async function remove(item: Item) {
    if (!admin && item.verified) {
      notify("管理员已核对锁定，发布者无法删除");
      return;
    }
    if (
      !confirm(
        `确定删除「${item.description}」吗？${admin ? "" : "删除后不可恢复。"}`,
      ) ||
      !confirm(
        admin
          ? "管理员删除不可恢复，再次确认？"
          : "再次确认：真的要删除这条失物招领吗？",
      )
    )
      return;
    if (actions.current.has(item.id)) return;
    actions.current.add(item.id);
    try {
      await api(`/api/items/${item.id}`, { method: "DELETE" });
      setDetail("");
      await refresh();
      notify(admin ? "帖子已删除" : "已删除");
    } catch (err) {
      notify(message(err));
    } finally {
      actions.current.delete(item.id);
    }
  }
  async function adminClaim(item: Item) {
    if (item.verified) {
      notify("已核对锁定，请先取消核对再改「已找回」状态");
      return;
    }
    if (actions.current.has(item.id)) return;
    actions.current.add(item.id);
    try {
      await api(
        `/api/items/${item.id}/claim${item.status === "claimed" ? "/cancel" : ""}`,
        {
          method: "POST",
          json:
            item.status === "claimed"
              ? {}
              : {
                  identity: "管理员标记",
                  name: "管理人员",
                  idNo: "admin",
                  contact: "—",
                },
        },
      );
      await refresh();
      notify(
        item.status === "claimed"
          ? "已取消「已找回」，帖子恢复为待认领"
          : "已标记为「已找回」",
      );
    } catch (err) {
      notify(message(err));
    } finally {
      actions.current.delete(item.id);
    }
  }
  async function detailAction(action: DetailAction, body: unknown) {
    rememberModalScroll();
    await api(`/api/items/${detail}/${action}`, { method: "POST", json: body });
    await refresh();
    notify(
      {
        unlock: "已验证，可查看联系信息",
        claim: "已登记找回，帖子已锁定",
        verify: "核对通过：帖子已锁定并沉至列表底部",
        unverify: "已取消核对，锁定已解除",
      }[action],
    );
  }
  const filtered = items.filter((item) => {
    const q = search.trim().toLowerCase();
    const fields =
      admin || item.unlocked || item.verified
        ? [
            item.description,
            item.office,
            item.place,
            item.contact,
            item.contactType,
            item.contactValue,
          ]
        : [item.description, item.place];
    return (
      (!q || fields.join(" ").toLowerCase().includes(q)) &&
      (!from || Date.parse(item.createdAt) >= Date.parse(from + "T00:00:00")) &&
      (!to || Date.parse(item.createdAt) <= Date.parse(to + "T23:59:59.999"))
    );
  });
  const selectedItem = items.find((i) => i.id === detail);
  return (
    <>
      <Entry
        screen={screen}
        selected={selected}
        pin={pin}
        busy={loginBusy}
        onSelect={setSelected}
        onPin={setPin}
        onEnter={() => void enter()}
        onPanel={onPanel}
      />
      <div className="app" id="app" hidden={screen !== "app"}>
        <Header
          admin={admin}
          ai={ai}
          panel={panel}
          onBack={onBack}
          onRole={onRole}
          onPanel={onPanel}
        />
        <main>
          <FoundPanel active={panel === "found"} m={found} notify={notify} />
          <BrowsePanel
            active={panel === "browse"}
            items={filtered}
            search={search}
            from={from}
            to={to}
            onSearch={setSearch}
            onFrom={setFrom}
            onTo={setTo}
            onOpen={setDetail}
          />
          <HistoryPanel
            active={panel === "history"}
            items={items.filter((i) => i.ownerId === viewer)}
            onEdit={(item) => {
              onPanel("found");
              found.edit(item);
            }}
            onDelete={(item) => void remove(item)}
          />
          {admin && (
            <AdminPanel
              active={panel === "admin"}
              items={items}
              onOpen={setDetail}
              onDelete={(item) => void remove(item)}
              onClaim={(item) => void adminClaim(item)}
            />
          )}
        </main>
      </div>
      {selectedItem && (
        <DetailModal
          key={
            selectedItem.id +
            selectedItem.status +
            !!selectedItem.verified +
            selectedItem.unlocked
          }
          item={selectedItem}
          initialScroll={modalScroll.current}
          lastCallLabel={lastCallLabel}
          onCallLabel={setLastCallLabel}
          admin={admin}
          viewer={viewer}
          notify={notify}
          onClose={() => {
            rememberModalScroll();
            setDetail("");
          }}
          onDelete={(item) => void remove(item)}
          onAdminClaim={adminClaim}
          onAction={detailAction}
        />
      )}
      <div
        className={"toast" + (toast.message ? " show" : "")}
        id="toast"
        role="status"
      >
        {toast.message}
      </div>
    </>
  );
}
