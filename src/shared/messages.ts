/** B 站内候选消息：同一对寻物+招领一条可持续更新的记录。 */

export interface MatchMessage {
  id: string;
  lostPostId: string;
  itemId: string;
  recipientUserId: string;
  lostRevision: number;
  /** 招领内容版本；C 落地前用内容指纹派生的稳定整数。 */
  itemRevision: number;
  batchId: string;
  reason: string;
  read: boolean;
  /** 用户标记「不是我的」后，相同版本不再提醒。 */
  dismissed: boolean;
  /** 读取详情时根据最新状态计算，不持久化权威。 */
  stale?: boolean;
  staleReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchMessageView extends MatchMessage {
  lostDescription?: string;
  itemDescription?: string;
  itemImage?: string;
  itemPlace?: string;
  itemOffice?: string;
}
