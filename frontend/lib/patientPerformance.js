const outcomes = ['independent', 'supported', 'difficulty', 'uncertain'];
function reviewSeries(summary, range, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - Number(range) + 1);
  const start = range === 'all' ? '' : cutoff.toISOString().slice(0, 10);
  const days = (summary.review_timeline || []).filter(day => !start || day.date >= start);
  return { days, max: Math.max(1, ...days.map(day => outcomes.reduce((sum, name) => sum + (day.outcomes[name] || 0), 0))) };
}
module.exports = { reviewSeries, outcomes };
