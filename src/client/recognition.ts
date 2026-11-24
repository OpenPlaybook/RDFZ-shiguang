import { OFFICES, CONTACT_TYPES } from "../shared/constants";
import type { FillFields } from "../shared/types";
function normalizeCnDigits(s: string) {
  const map: Record<string, string> = {
    零: "0",
    〇: "0",
    一: "1",
    二: "2",
    两: "2",
    三: "3",
    四: "4",
    五: "5",
    六: "6",
    七: "7",
    八: "8",
    九: "9",
  };
  return String(s || "").replace(
    /[零〇一二两三四五六七八九]/g,
    (ch) => map[ch] || ch,
  );
}

export function matchOffice(raw: string) {
  const text = String(raw || "")
    .trim()
    .replace(/\s+/g, "");
  if (!text) return "";
  const exact = OFFICES.find((o) => o.replace(/\s+/g, "") === text);
  if (exact) return exact;
  const hit = OFFICES.find((o) => {
    const o2 = o.replace(/\s+/g, "");
    return text.includes(o2) || o2.includes(text);
  });
  if (hit) return hit;
  const keys = [
    ["食堂一层", "食堂一层失物招领处"],
    ["食堂", "食堂一层失物招领处"],
    ["逸夫楼", "逸夫楼门口"],
    ["东门", "东门门口保安室"],
    ["保安室", "东门门口保安室"],
  ];
  for (const [k, office] of keys) {
    if (text.includes(k)) return office;
  }
  return "";
}

export function matchContactType(raw: string, value: string) {
  const t = String(raw || "").trim();
  const v = String(value || "");
  if (CONTACT_TYPES.includes(t)) return t;
  if (/邮箱|email|mail/i.test(t) || /@/.test(v)) return "邮箱";
  if (/微信|wechat|vx|威信/i.test(t)) return "微信";
  if (/qq/i.test(t)) return "QQ";
  if (
    /电话|手机|号码|tel|phone/i.test(t) ||
    /^1\d{10}$/.test(v.replace(/\s|-/g, ""))
  )
    return "电话";
  if (t) return "其他";
  return v ? "其他" : "";
}

export function localExtractFillFields(transcript: string): FillFields {
  const raw = normalizeCnDigits(String(transcript || ""));
  const t = raw.replace(/\s+/g, "");
  const fields = {
    place: "",
    office: "",
    contact: "",
    contactType: "",
    contactValue: "",
  };
  const officeHit = matchOffice(t);
  if (officeHit) fields.office = officeHit;
  else {
    const o2 = t.match(
      /(?:交到|放到|送到|放到了|所在)?(?:失物)?招领处(?:是|为|在|：|:)?([^，。；;]{2,24})/,
    );
    if (o2) fields.office = o2[1];
  }
  let place =
    (t.match(
      /(?:捡到场所|捡到地点|拾获地点|地点|场所)(?:是|为|在|：|:)?([^，。；;]{2,30})/,
    ) || [])[1] ||
    (t.match(/在([^，。；;]{2,24}?)(?:捡到|捡的|发现|拾到)/) || [])[1] ||
    (t.match(/([^，。；;]{2,24}?)(?:捡到的|捡的|捡到了一|捡到一个)/) ||
      [])[1] ||
    "";
  place = place.replace(/^(了|的|在)/, "").replace(/(交到|送到|放到).*$/, "");
  if (place && !/电话|微信|联系|招领/.test(place)) fields.place = place;
  const contact =
    (t.match(
      /(?:联系人|联系人是|我叫|我是)(?:是|为|：|:)?([\u4e00-\u9fa5A-Za-z·]{1,12})/,
    ) || [])[1] || "";
  if (contact && !/电话|微信|邮箱|招领|食堂|图书馆/.test(contact)) {
    fields.contact = contact.replace(/^(叫|名)/, "");
  }
  const phone =
    (t.match(
      /(?:电话|手机|号码|联系方式)(?:是|为|：|:)?(1\d{10}|\d{3,4}-?\d{7,8})/,
    ) || [])[1] ||
    (t.match(/(1\d{10})/) || [])[1] ||
    "";
  if (phone) {
    fields.contactType = "电话";
    fields.contactValue = phone;
  } else {
    const mail = (t.match(/([\w.+-]+@[\w.-]+\.\w+)/) || [])[1];
    if (mail) {
      fields.contactType = "邮箱";
      fields.contactValue = mail;
    } else {
      const wx = (t.match(
        /(?:微信|微信号|威信)(?:是|为|：|:)?([A-Za-z][\w-]{4,19}|[\w-]{5,20})/,
      ) || [])[1];
      if (wx) {
        fields.contactType = "微信";
        fields.contactValue = wx;
      } else {
        const qq = (t.match(/(?:QQ|qq号?)(?:是|为|：|:)?(\d{5,12})/) || [])[1];
        if (qq) {
          fields.contactType = "QQ";
          fields.contactValue = qq;
        }
      }
    }
  }
  return fields;
}
