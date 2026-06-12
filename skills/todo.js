/**
 * 待办事项子技能
 *
 * 管理用户每日任务清单，配合定时提醒使用。
 */

const store = new Map(); // 简单内存存储（实际项目应接入 DB）

/**
 * 获取今日待办
 */
export function getTodos() {
  const today = new Date().toISOString().slice(0, 10);
  return store.get(today) || [];
}

/**
 * 添加待办
 */
export function addTodo(text, priority = 'normal') {
  const today = new Date().toISOString().slice(0, 10);
  const list = store.get(today) || [];
  list.push({
    id: Date.now(),
    text,
    priority,
    done: false,
    created_at: new Date().toISOString(),
  });
  store.set(today, list);
  return list;
}

/**
 * 标记完成
 */
export function completeTodo(id) {
  const today = new Date().toISOString().slice(0, 10);
  const list = store.get(today) || [];
  const item = list.find((t) => t.id === id);
  if (item) item.done = true;
  store.set(today, list);
  return item;
}

/**
 * 获取待办摘要（用于主动提醒）
 */
export function getTodoSummary() {
  const todos = getTodos();
  const pending = todos.filter((t) => !t.done);
  if (pending.length === 0) return null;

  const high = pending.filter((t) => t.priority === 'high');
  if (high.length > 0) {
    return `还有 ${pending.length} 件事没做，其中 ${high.length} 件优先。`;
  }
  return `还有 ${pending.length} 件小事没打勾，不急 ~`;
}

export default { getTodos, addTodo, completeTodo, getTodoSummary };
