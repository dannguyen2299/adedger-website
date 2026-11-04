/* Tính toán độc lập, dùng được trên browser lẫn Node.js để kiểm thử. */
(function (root) {
  'use strict';
  const toDate = (s) => new Date(String(s).slice(0,10) + 'T12:00:00Z');
  const iso = (d) => d.toISOString().slice(0,10);
  function addDays(date, days) { const d = toDate(date); d.setUTCDate(d.getUTCDate() + days); return iso(d); }
  function monday(date) { const d = toDate(date); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); }
  const num = (v) => Number(v) || 0;
  const isYes = (v) => v === true || String(v).toUpperCase() === 'TRUE';
  function planned(campaign, week) {
    if (campaign.status === 'DRAFT') return 0;
    const end = addDays(week, 6);
    const from = campaign.start_date > week ? campaign.start_date : week;
    const until = campaign.end_date && campaign.end_date < end ? campaign.end_date : end;
    if (!from || from > until) return 0;
    const days = Math.round((toDate(until) - toDate(from)) / 86400000) + 1;
    return days * num(campaign.daily_budget);
  }
  function calc(data, clientId, week) {
    const campaignById = Object.fromEntries((data.campaigns || []).map(x => [x.id, x]));
    const expenses = (data.expenses || []).filter(x => campaignById[x.campaign_id]?.client_id === clientId);
    const payments = (data.payments || []).filter(x => x.client_id === clientId && (!x.status || x.status === 'CONFIRMED'));
    const client = (data.clients || []).find(x => x.id === clientId) || {};
    const next = addDays(week, 7);
    const spent = expenses.filter(x => x.date >= week && x.date < next).reduce((s,x) => s + num(x.amount), 0);
    const paid = payments.filter(x => x.week_start === week).reduce((s,x) => s + (x.type === 'REFUND' ? -1 : 1) * num(x.amount), 0);
    const priorSpent = expenses.filter(x => x.date < week).reduce((s,x) => s + num(x.amount), 0);
    const priorPaid = payments.filter(x => x.week_start < week).reduce((s,x) => s + (x.type === 'REFUND' ? -1 : 1) * num(x.amount), 0);
    const opening = num(client.opening_balance) + priorPaid - priorSpent;
    const budget = (data.campaigns || []).filter(x => x.client_id === clientId).reduce((s,x) => s + planned(x,week), 0);
    const closing = (data.closings || []).find(x => x.client_id === clientId && x.week_start === week && x.status === 'CONFIRMED');
    if (closing) return {clientId, week, planned:num(closing.planned),spent:num(closing.spent),paid:num(closing.paid),opening:num(closing.opening),ending:num(closing.ending),status:'CONFIRMED',closing};
    return {clientId,week,planned:budget,spent,paid,opening,ending:opening + paid - spent,status:'OPEN',closing:null};
  }
  function total(rows, key) { return rows.reduce((s,r) => s + num(r[key]),0); }
  const core = {addDays,monday,num,isYes,planned,calc,total};
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  root.AdLedgerCore = core;
})(typeof window !== 'undefined' ? window : globalThis);
