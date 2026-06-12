/**
 * SQLite 封装 — 用户记忆 + 事件存储
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/user_memory.db');

let db = null;

export function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('fact', 'event', 'preference', 'milestone', 'emotion')),
      content TEXT NOT NULL,
      importance REAL DEFAULT 0.5,
      created_at TEXT DEFAULT (datetime('now')),
      last_recalled_at TEXT,
      recall_count INTEGER DEFAULT 0,
      decayed_importance REAL DEFAULT 0.5,
      tags TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      happened_at TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interaction_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL CHECK(direction IN ('outbound', 'inbound')),
      content TEXT NOT NULL,
      triggered_by TEXT,
      user_responded INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS personality_state (
      user_id TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      outgoing INTEGER DEFAULT 30,
      empathy_level INTEGER DEFAULT 70,
      complaint_level INTEGER DEFAULT 60,
      positive_attitude INTEGER DEFAULT 40,
      sharing_tendency INTEGER DEFAULT 50,
      positive_share_ratio INTEGER DEFAULT 60,
      private_share_ratio INTEGER DEFAULT 30,
      topic_preference INTEGER DEFAULT 50,
      night_owl INTEGER DEFAULT 90,
      exercise_enthusiasm INTEGER DEFAULT 10,
      spicy_tolerance INTEGER DEFAULT 80,
      work_motivation INTEGER DEFAULT 20,
      user_proactivity INTEGER DEFAULT 60,
      last_adjustment_date TEXT,
      total_interactions INTEGER DEFAULT 0,
      milestone_snapshots TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS personality_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      trait_name TEXT NOT NULL,
      old_value INTEGER NOT NULL,
      new_value INTEGER NOT NULL,
      adjustment_amount INTEGER NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('proactive_feedback','user_initiated','shared_event','time')),
      source_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES personality_state(user_id)
    );

    CREATE TABLE IF NOT EXISTS growth_diaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      content TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES personality_state(user_id)
    );

    -- v2.0 记忆涟漪系统
    CREATE TABLE IF NOT EXISTS fact_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence INTEGER DEFAULT 50,
      confirmed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT,
      use_count INTEGER DEFAULT 0,
      UNIQUE(user_id, category, key)
    );

    CREATE TABLE IF NOT EXISTS shared_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',
      event_type TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      emotion_score INTEGER DEFAULT 0,
      importance INTEGER DEFAULT 50,
      confirmed INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT,
      use_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS preference_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',
      topic TEXT NOT NULL,
      preference_score INTEGER DEFAULT 0,
      total_interactions INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, topic)
    );

    CREATE TABLE IF NOT EXISTS negative_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',
      topic TEXT NOT NULL,
      reason TEXT,
      severity INTEGER DEFAULT 50,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      UNIQUE(user_id, topic)
    );

    CREATE TABLE IF NOT EXISTS memory_validation_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',
      memory_type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT DEFAULT (datetime('now', '+7 days'))
    );

    CREATE TABLE IF NOT EXISTS collection_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',
      target_category TEXT NOT NULL,
      target_key TEXT NOT NULL,
      priority INTEGER DEFAULT 50,
      status TEXT DEFAULT 'pending',
      attempt_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      UNIQUE(user_id, target_category, target_key)
    );

    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(decayed_importance DESC);
    CREATE INDEX IF NOT EXISTS idx_events_happened ON events(happened_at);
    CREATE INDEX IF NOT EXISTS idx_interaction_created ON interaction_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_adjustments_user ON personality_adjustments(user_id);
    CREATE INDEX IF NOT EXISTS idx_adjustments_created ON personality_adjustments(created_at);
    CREATE INDEX IF NOT EXISTS idx_diaries_user ON growth_diaries(user_id);
    CREATE INDEX IF NOT EXISTS idx_fact_memories_cat ON fact_memories(user_id, category);
    CREATE INDEX IF NOT EXISTS idx_shared_events_user ON shared_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_pref_memories_user ON preference_memories(user_id);
    CREATE INDEX IF NOT EXISTS idx_negative_user ON negative_memories(user_id);
    CREATE INDEX IF NOT EXISTS idx_collection_tasks_user ON collection_tasks(user_id, status);

    -- v2.x 情绪熔断表
    CREATE TABLE IF NOT EXISTS session_fuse_state (
      session_id TEXT PRIMARY KEY,
      fuse_level INTEGER DEFAULT 0,
      negative_streak INTEGER DEFAULT 0,
      consecutive_normal_rounds INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 0,
      last_trigger_reason TEXT,
      last_trigger_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fuse_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id TEXT DEFAULT 'default',
      fuse_level INTEGER NOT NULL,
      emotion_score INTEGER,
      emotion_label TEXT,
      trigger_reason TEXT,
      rule_id TEXT,
      user_message TEXT,
      ai_response TEXT,
      context TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_fuse_logs_session ON fuse_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_fuse_logs_level ON fuse_logs(fuse_level);
    CREATE INDEX IF NOT EXISTS idx_fuse_logs_created ON fuse_logs(created_at);

    -- v3.2 表情系统表
    CREATE TABLE IF NOT EXISTS emoji_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',
      emoji TEXT NOT NULL,
      category TEXT DEFAULT '',
      count INTEGER DEFAULT 0,
      last_used_at TEXT,
      last_context TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, emoji)
    );
    CREATE TABLE IF NOT EXISTS sticker_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',
      file_path TEXT NOT NULL,
      category TEXT DEFAULT 'fun',
      tags TEXT DEFAULT '[]',
      use_count INTEGER DEFAULT 0,
      last_used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, file_path)
    );
    CREATE TABLE IF NOT EXISTS emoji_personality_preference (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',
      category TEXT NOT NULL,
      preference_offset INTEGER DEFAULT 0,
      reason TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, category)
    );
    CREATE TABLE IF NOT EXISTS emoji_evolution_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',
      predicted_weights TEXT DEFAULT '{}',
      actual_counts TEXT DEFAULT '{}',
      deviations TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_emoji_usage_user ON emoji_usage(user_id, count DESC);
    CREATE INDEX IF NOT EXISTS idx_emoji_usage_recent ON emoji_usage(user_id, last_used_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sticker_user ON sticker_library(user_id, category);
    CREATE INDEX IF NOT EXISTS idx_emoji_pref_user ON emoji_personality_preference(user_id);
  `);

  // v3.1 migration: user_proactivity column
  try { db.exec('ALTER TABLE personality_state ADD COLUMN user_proactivity INTEGER DEFAULT 60'); } catch {}
}

// --- Memory CRUD ---

export function addMemory(type, content, { importance = 0.5, tags = [] } = {}) {
  const stmt = getDB().prepare(
    'INSERT INTO memories (type, content, importance, tags) VALUES (?, ?, ?, ?)',
  );
  return stmt.run(type, content, importance, JSON.stringify(tags));
}

export function recallMemories(limit = 5) {
  // Decay-based recall: higher importance, more recent = higher score
  const stmt = getDB().prepare(`
    SELECT * FROM memories
    ORDER BY decayed_importance DESC, last_recalled_at DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

export function touchMemory(id) {
  const stmt = getDB().prepare(`
    UPDATE memories
    SET recall_count = recall_count + 1,
        last_recalled_at = datetime('now'),
        decayed_importance = importance * (1.0 - 0.05 * recall_count)
    WHERE id = ?
  `);
  return stmt.run(id);
}

export function decayAllMemories(rate = 0.85) {
  getDB().prepare('UPDATE memories SET decayed_importance = decayed_importance * ?').run(rate);
}

// --- Events ---

export function addEvent(name, happenedAt, metadata = {}) {
  const stmt = getDB().prepare(
    'INSERT INTO events (name, happened_at, metadata) VALUES (?, ?, ?)',
  );
  return stmt.run(name, happenedAt, JSON.stringify(metadata));
}

export function getRecentEvents(days = 7) {
  return getDB()
    .prepare("SELECT * FROM events WHERE happened_at >= datetime('now', ?) ORDER BY happened_at DESC")
    .all(`-${days} days`);
}

// --- Interaction Log ---

export function logInteraction(direction, content, triggeredBy = null) {
  const stmt = getDB().prepare(
    'INSERT INTO interaction_log (direction, content, triggered_by) VALUES (?, ?, ?)',
  );
  return stmt.run(direction, content, triggeredBy);
}

// --- Personality State ---

export function getPersonalityState(userId = 'default') {
  let row = getDB().prepare('SELECT * FROM personality_state WHERE user_id = ?').get(userId);
  if (!row) {
    getDB().prepare(`INSERT INTO personality_state (user_id) VALUES (?)`).run(userId);
    row = getDB().prepare('SELECT * FROM personality_state WHERE user_id = ?').get(userId);
  }
  return row;
}

export function updatePersonalityTrait(userId, traitName, oldValue, newValue) {
  const amount = newValue - oldValue;
  getDB().prepare(`UPDATE personality_state SET ${traitName} = ?, updated_at = datetime('now'), total_interactions = total_interactions + 1 WHERE user_id = ?`).run(newValue, userId);
  getDB().prepare('INSERT INTO personality_adjustments (user_id, trait_name, old_value, new_value, adjustment_amount, source_type) VALUES (?, ?, ?, ?, ?, ?)').run(userId, traitName, oldValue, newValue, amount, 'proactive_feedback');
}

export function recordAdjustment(userId, traitName, oldValue, newValue, sourceType, sourceId = null) {
  const amount = newValue - oldValue;
  getDB().prepare(`UPDATE personality_state SET ${traitName} = ?, updated_at = datetime('now'), last_adjustment_date = date('now'), total_interactions = total_interactions + 1 WHERE user_id = ?`).run(newValue, userId);
  return getDB().prepare('INSERT INTO personality_adjustments (user_id, trait_name, old_value, new_value, adjustment_amount, source_type, source_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, traitName, oldValue, newValue, amount, sourceType, sourceId);
}

export function getPendingAdjustments(userId = 'default') {
  return getDB().prepare("SELECT * FROM personality_adjustments WHERE user_id = ? AND date(created_at) = date('now') ORDER BY created_at DESC").all(userId);
}

export function getAdjustmentHistory(userId = 'default', limit = 20) {
  return getDB().prepare('SELECT * FROM personality_adjustments WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
}

export function saveGrowthDiary(userId, month, year, content) {
  return getDB().prepare('INSERT INTO growth_diaries (user_id, month, year, content) VALUES (?, ?, ?, ?)').run(userId, month, year, content);
}

export function getGrowthDiaries(userId = 'default', limit = 6) {
  return getDB().prepare('SELECT * FROM growth_diaries WHERE user_id = ? ORDER BY year DESC, month DESC LIMIT ?').all(userId, limit);
}

export function resetPersonalityToInitial(userId = 'default') {
  getDB().prepare(`UPDATE personality_state SET
    outgoing = 30, empathy_level = 70, complaint_level = 60, positive_attitude = 40,
    sharing_tendency = 50, positive_share_ratio = 60, private_share_ratio = 30, topic_preference = 50,
    night_owl = 90, exercise_enthusiasm = 10, spicy_tolerance = 80, work_motivation = 20,
    user_proactivity = 60,
    updated_at = datetime('now') WHERE user_id = ?`).run(userId);
}

export function updateMilestoneSnapshots(userId, snapshots) {
  getDB().prepare('UPDATE personality_state SET milestone_snapshots = ? WHERE user_id = ?').run(JSON.stringify(snapshots), userId);
}

// --- v2.0 Memory Ripples Helpers ---

export function setFact(userId, category, key, value, confirmed = false) {
  const stmt = getDB().prepare(`INSERT INTO fact_memories (user_id, category, key, value, confirmed, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, category, key) DO UPDATE SET value = ?, confirmed = ?, updated_at = datetime('now')`);
  return stmt.run(userId, category, key, value, confirmed ? 1 : 0, value, confirmed ? 1 : 0);
}

export function getFact(userId, category, key) {
  return getDB().prepare('SELECT * FROM fact_memories WHERE user_id = ? AND category = ? AND key = ?').get(userId, category, key);
}

export function deleteFact(userId, category, key) {
  return getDB().prepare('DELETE FROM fact_memories WHERE user_id = ? AND category = ? AND key = ?').run(userId, category, key);
}

export function getFactsByCategory(userId, category) {
  return getDB().prepare('SELECT * FROM fact_memories WHERE user_id = ? AND category = ? ORDER BY confidence DESC').all(userId, category);
}

export function addSharedEvent(userId, eventType, content, tags = [], emotionScore = 0, importance = 50) {
  return getDB().prepare('INSERT INTO shared_events (user_id, event_type, content, tags, emotion_score, importance) VALUES (?, ?, ?, ?, ?, ?)').run(userId, eventType, content, JSON.stringify(tags), emotionScore, importance);
}

export function getRecentSharedEvents(userId, limit = 10) {
  return getDB().prepare('SELECT * FROM shared_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
}

export function getRelevantEvents(userId, limit = 3) {
  return getDB().prepare(`SELECT * FROM shared_events WHERE user_id = ?
    ORDER BY (julianday('now') - julianday(created_at)) ASC, importance DESC, use_count ASC LIMIT ?`).all(userId, limit);
}

export function touchSharedEvent(id) {
  return getDB().prepare("UPDATE shared_events SET last_used_at = datetime('now'), use_count = use_count + 1 WHERE id = ?").run(id);
}

export function deleteSharedEvent(userId, eventId) {
  return getDB().prepare('DELETE FROM shared_events WHERE user_id = ? AND id = ?').run(userId, eventId);
}

export function upsertPreference(userId, topic, score) {
  return getDB().prepare(`INSERT INTO preference_memories (user_id, topic, preference_score, total_interactions)
    VALUES (?, ?, ?, 1) ON CONFLICT(user_id, topic) DO UPDATE SET
    preference_score = preference_score + ?, total_interactions = total_interactions + 1, updated_at = datetime('now')`).run(userId, topic, score, score);
}

export function getTopPreferences(userId, limit = 5) {
  return getDB().prepare('SELECT * FROM preference_memories WHERE user_id = ? ORDER BY preference_score DESC LIMIT ?').all(userId, limit);
}

export function getPositiveTopics(userId, limit = 3) {
  return getDB().prepare('SELECT topic FROM preference_memories WHERE user_id = ? AND preference_score > 0 ORDER BY preference_score DESC LIMIT ?').all(userId, limit);
}

export function addNegativeMemory(userId, topic, reason, severity = 50, expiresAt = null) {
  return getDB().prepare(`INSERT INTO negative_memories (user_id, topic, reason, severity, expires_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, topic) DO UPDATE SET reason = ?, severity = ?, expires_at = ?`).run(userId, topic, reason, severity, expiresAt, reason, severity, expiresAt);
}

export function isNegativeTopic(userId, topic) {
  const row = getDB().prepare("SELECT id FROM negative_memories WHERE user_id = ? AND topic = ? AND (expires_at IS NULL OR expires_at > datetime('now'))").get(userId, topic);
  return !!row;
}

export function removeNegativeMemory(userId, topic) {
  return getDB().prepare('DELETE FROM negative_memories WHERE user_id = ? AND topic = ?').run(userId, topic);
}

export function addToValidationQueue(userId, memoryType, data) {
  return getDB().prepare('INSERT INTO memory_validation_queue (user_id, memory_type, data) VALUES (?, ?, ?)').run(userId, memoryType, JSON.stringify(data));
}

export function getPendingValidations(userId) {
  return getDB().prepare("SELECT * FROM memory_validation_queue WHERE user_id = ? AND expires_at > datetime('now')").all(userId);
}

export function validateAndPromote(userId, key, value) {
  const row = getDB().prepare("SELECT * FROM memory_validation_queue WHERE user_id = ? AND json_extract(data, '$.key') = ? AND json_extract(data, '$.value') = ? AND expires_at > datetime('now')").get(userId, key, value);
  if (row) {
    const data = JSON.parse(row.data);
    setFact(userId, data.category, data.key, data.value, true);
    getDB().prepare('DELETE FROM memory_validation_queue WHERE id = ?').run(row.id);
    return true;
  }
  return false;
}

export function cleanExpiredValidations() {
  return getDB().prepare("DELETE FROM memory_validation_queue WHERE expires_at < datetime('now')").run();
}

export function addCollectionTask(userId, category, key, priority = 50) {
  return getDB().prepare(`INSERT INTO collection_tasks (user_id, target_category, target_key, priority)
    VALUES (?, ?, ?, ?) ON CONFLICT(user_id, target_category, target_key) DO UPDATE SET priority = ?`).run(userId, category, key, priority, priority);
}

export function getNextCollectionTask(userId) {
  return getDB().prepare("SELECT * FROM collection_tasks WHERE user_id = ? AND status = 'pending' ORDER BY priority DESC, attempt_count ASC LIMIT 1").get(userId);
}

export function updateCollectionTask(taskId, status, attemptCount = null) {
  if (attemptCount !== null) {
    return getDB().prepare('UPDATE collection_tasks SET status = ?, attempt_count = ? WHERE id = ?').run(status, attemptCount, taskId);
  }
  return getDB().prepare('UPDATE collection_tasks SET status = ?, completed_at = datetime(\'now\') WHERE id = ?').run(status, taskId);
}

export function clearAllMemories(userId) {
  getDB().prepare('DELETE FROM fact_memories WHERE user_id = ?').run(userId);
  getDB().prepare('DELETE FROM shared_events WHERE user_id = ?').run(userId);
  getDB().prepare('DELETE FROM preference_memories WHERE user_id = ?').run(userId);
  getDB().prepare('DELETE FROM negative_memories WHERE user_id = ?').run(userId);
  getDB().prepare('DELETE FROM memory_validation_queue WHERE user_id = ?').run(userId);
  getDB().prepare('DELETE FROM collection_tasks WHERE user_id = ?').run(userId);
}

// --- v2.x Emotion Fuse Helpers ---

export function getFuseState(sessionId) {
  const row = getDB().prepare('SELECT * FROM session_fuse_state WHERE session_id = ?').get(sessionId);
  if (!row) {
    getDB().prepare("INSERT INTO session_fuse_state (session_id) VALUES (?)").run(sessionId);
    return getDB().prepare('SELECT * FROM session_fuse_state WHERE session_id = ?').get(sessionId);
  }
  return row;
}

export function setFuseLevel(sessionId, level, reason = null) {
  return getDB().prepare("UPDATE session_fuse_state SET fuse_level = ?, last_trigger_reason = ?, last_trigger_at = datetime('now'), updated_at = datetime('now') WHERE session_id = ?").run(level, reason, sessionId);
}

export function incrementNegativeStreak(sessionId) {
  return getDB().prepare("UPDATE session_fuse_state SET negative_streak = negative_streak + 1, updated_at = datetime('now') WHERE session_id = ?").run(sessionId);
}

export function resetNegativeStreak(sessionId) {
  return getDB().prepare("UPDATE session_fuse_state SET negative_streak = 0, updated_at = datetime('now') WHERE session_id = ?").run(sessionId);
}

export function incrementNormalRounds(sessionId) {
  return getDB().prepare("UPDATE session_fuse_state SET consecutive_normal_rounds = consecutive_normal_rounds + 1, updated_at = datetime('now') WHERE session_id = ?").run(sessionId);
}

export function resetNormalRounds(sessionId) {
  return getDB().prepare("UPDATE session_fuse_state SET consecutive_normal_rounds = 0, updated_at = datetime('now') WHERE session_id = ?").run(sessionId);
}

export function setIsLocked(sessionId, locked = true) {
  return getDB().prepare("UPDATE session_fuse_state SET is_locked = ?, updated_at = datetime('now') WHERE session_id = ?").run(locked ? 1 : 0, sessionId);
}

export function addFuseLog(sessionId, userId, fuseLevel, emotionScore, emotionLabel, triggerReason, ruleId, userMessage, aiResponse, context) {
  return getDB().prepare(`INSERT INTO fuse_logs (session_id, user_id, fuse_level, emotion_score, emotion_label, trigger_reason, rule_id, user_message, ai_response, context)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(sessionId, userId, fuseLevel, emotionScore, emotionLabel, triggerReason, ruleId, userMessage, aiResponse, JSON.stringify(context));
}

export function getFuseLogs(sessionId, limit = 20) {
  return getDB().prepare('SELECT * FROM fuse_logs WHERE session_id = ? ORDER BY created_at DESC LIMIT ?').all(sessionId, limit);
}

export function getFuseLogsByLevel(level, limit = 50) {
  return getDB().prepare('SELECT * FROM fuse_logs WHERE fuse_level >= ? ORDER BY created_at DESC LIMIT ?').all(level, limit);
}

export function resetFuseState(sessionId) {
  return getDB().prepare("UPDATE session_fuse_state SET fuse_level = 0, negative_streak = 0, consecutive_normal_rounds = 0, is_locked = 0, last_trigger_reason = NULL, last_trigger_at = NULL, updated_at = datetime('now') WHERE session_id = ?").run(sessionId);
}
