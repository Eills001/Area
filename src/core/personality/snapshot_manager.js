/**
 * 快照与里程碑管理器
 *
 * 功能：
 * - 每30天自动创建人格快照
 * - 存储最近12个月的快照（便于对比演化轨迹）
 * - 支持手动创建快照
 */
import { getPersonalityState, updateMilestoneSnapshots, getGrowthDiaries } from '../../utils/db.js';
import logger from '../../utils/logger.js';

const TRAIT_NAMES = [
  'outgoing', 'empathy_level', 'complaint_level', 'positive_attitude',
  'sharing_tendency', 'positive_share_ratio', 'private_share_ratio', 'topic_preference',
  'night_owl', 'exercise_enthusiasm', 'spicy_tolerance', 'work_motivation',
];

export class SnapshotManager {
  /**
   * 创建里程碑快照
   */
  async createMilestoneSnapshot(userId = 'default') {
    const state = getPersonalityState(userId);
    const now = new Date();

    const snapshot = {
      date: now.toISOString().split('T')[0],
      traits: {},
      interactions: state.total_interactions,
    };

    for (const trait of TRAIT_NAMES) {
      snapshot.traits[trait] = state[trait];
    }

    // 读取现有快照，追加新快照
    let snapshots = [];
    try {
      const raw = state.milestone_snapshots;
      snapshots = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      snapshots = [];
    }

    snapshots.push(snapshot);

    // 只保留最近12个快照
    if (snapshots.length > 12) {
      snapshots = snapshots.slice(-12);
    }

    updateMilestoneSnapshots(userId, snapshots);
    logger.info(`[snapshot_manager] Milestone snapshot created for ${userId}: ${JSON.stringify(snapshot.traits)}`);

    return snapshot;
  }

  /**
   * 获取演化的变化趋势
   * 返回每个维度从最早的快照到最新的快照的变化
   */
  getEvolutionTrend(userId = 'default') {
    const state = getPersonalityState(userId);
    let snapshots = [];
    try {
      const raw = state.milestone_snapshots;
      snapshots = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      snapshots = [];
    }

    if (snapshots.length < 2) return { status: 'insufficient_data', snapshots: snapshots.length };

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    const trend = {};
    for (const trait of TRAIT_NAMES) {
      const delta = (last.traits[trait] || 0) - (first.traits[trait] || 0);
      trend[trait] = {
        from: first.traits[trait],
        to: last.traits[trait],
        delta,
        direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable',
      };
    }

    return {
      status: 'ok',
      firstSnapshot: first.date,
      lastSnapshot: last.date,
      totalSnapshots: snapshots.length,
      totalInteractions: state.total_interactions,
      trend,
    };
  }

  /**
   * 获取完整演化时间线（用于可视化）
   */
  getTimeline(userId = 'default') {
    const state = getPersonalityState(userId);
    let snapshots = [];
    try {
      const raw = state.milestone_snapshots;
      snapshots = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      snapshots = [];
    }
    return snapshots;
  }

  /**
   * 比较两个快照
   */
  compareSnapshots(snapshotA, snapshotB) {
    const diff = {};
    for (const trait of TRAIT_NAMES) {
      const a = snapshotA.traits[trait] || 0;
      const b = snapshotB.traits[trait] || 0;
      diff[trait] = { from: a, to: b, delta: b - a };
    }
    return diff;
  }
}

export const snapshotManager = new SnapshotManager();
export default SnapshotManager;
