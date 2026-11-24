import { DEEPSEEK_MODEL, DEEPSEEK_URL } from "../config.js";
import type { ItemRow } from "../../shared/types.js";
import type { LostPost } from "../../shared/lost.js";
import type {
  MatchCandidateResult,
  MatchModelResponse,
} from "../../shared/matching.js";

export type MatchAiFn = (
  lost: LostPost,
  candidates: ItemRow[],
) => Promise<MatchCandidateResult[]>;

export function createDeepseekMatcher(
  apiKey: string,
  request: typeof fetch = fetch,
): MatchAiFn {
  return async (lost, candidates) => {
    if (!apiKey) throw new Error("AI 未配置");
    const payload = {
      lost: {
        description: lost.description,
        place: lost.place || null,
        lostFrom: lost.lostFrom,
        lostTo: lost.lostTo,
        hasImage: !!lost.image,
      },
      items: candidates.map((c) => ({
        id: c.id,
        description: c.description,
        place: c.place,
        office: c.office,
        createdAt: c.created_at,
        hasImage: !!c.image,
      })),
    };
    const prompt =
      "你是校园失物配对助手。根据寻物描述从候选招领中选出可能匹配的物品。" +
      "理解近义颜色（如灰/银）和缺失信息；型号或时间明显矛盾则排除。" +
      "不要使用或推断姓名学号手机号。只输出 JSON：" +
      '{"candidates":[{"itemId":"...","reason":"不超过40字中文理由"}]}。' +
      "没有合适候选时返回空数组。不要编造不在列表中的 id。\n" +
      JSON.stringify(payload);

    const response = await request(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(40000),
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        thinking: { type: "disabled" },
        temperature: 0.2,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`AI 请求失败（${response.status}）`);
    const data = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim())
      throw new Error("模型未返回有效结果");
    return parseMatchResponse(content, new Set(candidates.map((c) => c.id)));
  };
}

export function parseMatchResponse(
  content: string,
  allowedIds: Set<string>,
): MatchCandidateResult[] {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型返回非 JSON");
  let parsed: MatchModelResponse;
  try {
    parsed = JSON.parse(content.slice(start, end + 1)) as MatchModelResponse;
  } catch {
    throw new Error("模型 JSON 无法解析");
  }
  if (!parsed || !Array.isArray(parsed.candidates))
    throw new Error("模型结果缺少 candidates");
  const out: MatchCandidateResult[] = [];
  const vague = /都一样|全部匹配|全都是|随便/;
  for (const row of parsed.candidates) {
    if (!row || typeof row.itemId !== "string" || typeof row.reason !== "string")
      continue;
    if (!allowedIds.has(row.itemId)) continue;
    const reason = row.reason.trim().slice(0, 80);
    if (!reason || vague.test(reason)) continue;
    if (out.some((c) => c.itemId === row.itemId)) continue;
    out.push({ itemId: row.itemId, reason });
  }
  return out;
}
