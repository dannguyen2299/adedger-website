'use strict';
const assert=require('node:assert/strict');
const C=require('../core.js');
assert.equal(C.monday('2026-11-01'),'2026-10-26');
assert.equal(C.monday('2026-11-02'),'2026-11-02');
assert.equal(C.addDays('2026-10-26',7),'2026-11-02');
assert.equal(C.planned({start_date:'2026-10-28',end_date:'2026-10-30',daily_budget:100000,status:'ACTIVE'},'2026-10-26'),300000);
assert.equal(C.planned({start_date:'2026-11-04',end_date:'',daily_budget:100000,status:'ACTIVE'},'2026-11-02'),500000);
assert.equal(C.planned({start_date:'2026-10-26',daily_budget:100000,status:'DRAFT'},'2026-10-26'),0);
const entities={
 clients:[{id:'A',opening_balance:'200000'}],
 campaigns:[{id:'C',client_id:'A',daily_budget:'100000',start_date:'2026-10-26',end_date:'',status:'ACTIVE'}],
 expenses:[{id:'E1',campaign_id:'C',date:'2026-10-27',amount:'500000'},{id:'E2',campaign_id:'C',date:'2026-11-02',amount:'150000'}],
 payments:[{id:'P1',client_id:'A',week_start:'2026-10-26',type:'RECEIVE',amount:'600000'},{id:'P2',client_id:'A',week_start:'2026-10-26',type:'REFUND',amount:'100000'},{id:'P3',client_id:'A',week_start:'2026-11-02',type:'RECEIVE',amount:'500000'}],
 closings:[]
};
const last=C.calc(entities,'A','2026-10-26');
assert.equal(last.planned,700000);
assert.equal(last.spent,500000);
assert.equal(last.paid,500000);
assert.equal(last.opening,200000);
assert.equal(last.ending,200000);
const next=C.calc(entities,'A','2026-11-02');
assert.equal(next.opening,200000);
assert.equal(next.spent,150000);
assert.equal(next.paid,500000);
assert.equal(next.ending,550000);
entities.closings=[{id:'X',client_id:'A',week_start:'2026-10-26',status:'CONFIRMED',planned:'650000',spent:'500000',paid:'500000',opening:'200000',ending:'200000'}];
assert.equal(C.calc(entities,'A','2026-10-26').planned,650000);
console.log('OK: 13 phép kiểm tra về ngày, ngân sách và đối soát.');
