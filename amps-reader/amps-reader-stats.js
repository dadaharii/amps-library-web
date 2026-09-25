/* AMPS Reader — reading statistics & goals */
(function () {
  "use strict";

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function ensure(stats) {
    if (!stats) stats = { daily: {}, chaptersOpened: {}, totalMinutes: 0, goalMinutes: 20 };
    if (!stats.daily) stats.daily = {};
    if (!stats.chaptersOpened) stats.chaptersOpened = {};
    return stats;
  }

  function recordSession(stats, minutes, bookId, chapterId) {
    stats = ensure(stats);
    const day = todayKey();
    if (!stats.daily[day]) stats.daily[day] = { minutes: 0, chapters: [] };
    stats.daily[day].minutes += minutes;
    stats.totalMinutes = (stats.totalMinutes || 0) + minutes;
    const key = bookId + ":" + chapterId;
    if (!stats.daily[day].chapters.includes(key)) stats.daily[day].chapters.push(key);
    if (!stats.chaptersOpened[key]) stats.chaptersOpened[key] = 0;
    stats.chaptersOpened[key] += 1;
    return stats;
  }

  function streak(stats) {
    stats = ensure(stats);
    let s = 0;
    const d = new Date();
    for (let i = 0; i < 400; i++) {
      const k = d.toISOString().slice(0, 10);
      if (stats.daily[k]?.minutes > 0) s += 1;
      else if (i > 0) break;
      d.setDate(d.getDate() - 1);
    }
    return s;
  }

  function todayMinutes(stats) {
    return ensure(stats).daily[todayKey()]?.minutes || 0;
  }

  function pathProgress(stats, pathId, bookIds, progress) {
    let read = 0;
    let total = 0;
    bookIds.forEach(bid => {
      Object.keys(progress || {}).forEach(() => {});
      const chKey = progress?.[bid]?.chapterId;
      if (chKey) read += 1;
      total += 1;
    });
    if (!stats.pathProgress) stats.pathProgress = {};
    const pct = total ? Math.round((read / total) * 100) : 0;
    stats.pathProgress[pathId] = { read, total, pct, updated: Date.now() };
    return stats.pathProgress[pathId];
  }

  function markPathChapter(stats, pathId, bookId, chapterId) {
    if (!stats.pathChapters) stats.pathChapters = {};
    if (!stats.pathChapters[pathId]) stats.pathChapters[pathId] = [];
    const k = bookId + ":" + chapterId;
    if (!stats.pathChapters[pathId].includes(k)) stats.pathChapters[pathId].push(k);
    return stats.pathChapters[pathId].length;
  }

  window.AmpsStats = {
    ensure, recordSession, streak, todayMinutes, pathProgress, markPathChapter, todayKey,
  };
})();
