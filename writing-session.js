const ACTIVE_WINDOW_MS = 30_000;
const SESSION_GAP_MS = 30 * 60_000;

const sessionId = () => {
  try { return `ws-${crypto.randomUUID()}`; } catch { return `ws-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; }
};

export class WritingSessionTracker {
  constructor({ capture, context, now = () => Date.now(), visible = () => true, focused = () => true, onEnded = () => {} }) {
    this.capture = capture;
    this.context = context;
    this.now = now;
    this.visible = visible;
    this.focused = focused;
    this.onEnded = onEnded;
    this.session = null;
  }

  start(at = this.now()) {
    this.session = { id: sessionId(), startedAt: at, lastEditAt: at, lastCountedAt: at, activeMs: 0, wordsAdded: 0, wordsRemoved: 0, changed: false, meaningful: false, ended: false };
    return this.session;
  }

  tick(at = this.now()) {
    const session = this.session;
    if (!session || session.ended) return;
    const limit = Math.min(at, session.lastEditAt + ACTIVE_WINDOW_MS);
    if (limit > session.lastCountedAt && this.visible() && this.focused()) session.activeMs += limit - session.lastCountedAt;
    session.lastCountedAt = Math.max(session.lastCountedAt, limit);
    this.qualify();
  }

  recordChange({ beforeWords, afterWords, at = this.now() }) {
    if (!Number.isInteger(beforeWords) || !Number.isInteger(afterWords) || beforeWords < 0 || afterWords < 0) return null;
    if (this.session && at - this.session.lastEditAt >= SESSION_GAP_MS) {
      this.end(at);
      this.session = null;
    }
    const session = this.session || this.start(at);
    this.tick(at);
    session.changed = session.changed || beforeWords !== afterWords || true;
    const delta = afterWords - beforeWords;
    if (delta > 0) session.wordsAdded += delta;
    if (delta < 0) session.wordsRemoved += Math.abs(delta);
    session.lastEditAt = at;
    session.lastCountedAt = at;
    this.qualify();
    return session.id;
  }

  qualify() {
    const session = this.session;
    if (!session || session.ended || session.meaningful || !session.changed) return false;
    const activeSeconds = Math.floor(session.activeMs / 1000);
    if (activeSeconds < 120 && session.wordsAdded < 50) return false;
    session.meaningful = true;
    const context = this.context();
    this.capture("meaningful_writing", { ...context, analytics_session_id: session.id, active_seconds: activeSeconds, words_added: session.wordsAdded, words_removed: session.wordsRemoved }, `${session.id}:meaningful`);
    return true;
  }

  end(at = this.now()) {
    const session = this.session;
    if (!session || session.ended) return false;
    this.tick(at);
    session.ended = true;
    const context = this.context();
    this.capture("writing_session_ended", {
      ...context,
      analytics_session_id: session.id,
      active_seconds: Math.floor(session.activeMs / 1000),
      words_added: session.wordsAdded,
      words_removed: session.wordsRemoved,
      net_word_change: session.wordsAdded - session.wordsRemoved,
      meaningful_writing_reached: session.meaningful,
    }, `${session.id}:ended`);
    this.onEnded(session);
    return true;
  }
}
