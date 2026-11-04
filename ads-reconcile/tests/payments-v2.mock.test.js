/* Luồng V2: khách tự báo đã chuyển; CHỈ admin xác nhận nhận tiền. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const sv=v=>typeof v==='string'&&v.startsWith("'")?v.slice(1):v;
class Sheet{
 constructor(){this.rows=[];} getLastRow(){return this.rows.length;} getLastColumn(){return Math.max(0,...this.rows.map(x=>x.length));}
 getRange(r,c,h,w){const sh=this;return {getValues(){return Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>sh.rows[r-1+i]?.[c-1+j]??''));},getDisplayValues(){return Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>String(sh.rows[r-1+i]?.[c-1+j]??'')));},setValues(values){values.forEach((row,i)=>{sh.rows[r-1+i]??=[];row.forEach((v,j)=>sh.rows[r-1+i][c-1+j]=sv(v));});return this;},setFontWeight(){return this;},setFontColor(){return this;},setBackground(){return this;}};}
 appendRow(r){this.rows.push(r.map(sv))} deleteRow(index){this.rows.splice(index-1,1)} setFrozenRows(){} getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn())}
}
class Book{constructor(){this.tables=new Map;}getSheetByName(k){return this.tables.get(k)||null;}insertSheet(k){const sh=new Sheet;this.tables.set(k,sh);return sh;}setSpreadsheetTimeZone(){}}
const book=new Book;let i=0;
const ctx=vm.createContext({console,Logger:{log(){}},Date,JSON,String,Math,Set,Object,Number,Error,
 SpreadsheetApp:{getActiveSpreadsheet:()=>book},PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},
 Session:{getEffectiveUser:()=>({getEmail:()=> 'admin@example.com'})},
 Utilities:{getUuid:()=>String(++i)+'-id',formatDate:()=> '2026-11-01'},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8'),ctx);
const call=(name,...args)=>vm.runInContext(name,ctx)(...args);
call('setupAdLedger');
const admin={email:'admin@example.com',role:'ADMIN'};
const cust={email:'customer@example.com',role:'CLIENT',client_id:'c1'};
const other={email:'other@example.com',role:'CLIENT',client_id:'c2'};
const mutate=(entity,record,user=admin)=>call('mutate_',user,{entity,op:'save',record});
mutate('clients',{id:'c1',name:'A',opening_balance:'0',active:'TRUE'});
mutate('clients',{id:'c2',name:'B',opening_balance:'0',active:'TRUE'});
const platform=call('rows_','platforms')[0];
mutate('accounts',{id:'a1',name:'account A',client_id:'c1',platform_id:platform.id,owner:'OWN',active:'TRUE'});
mutate('campaigns',{id:'ca1',name:'ads A',client_id:'c1',platform_id:platform.id,account_id:'a1',daily_budget:'100000',start_date:'2026-10-19',status:'ACTIVE'});
mutate('expenses',{id:'e1',campaign_id:'ca1',date:'2026-10-20',amount:'250000'});
const record={client_id:'c1',date:'2026-10-21',week_start:'2026-10-19',amount:'300000',reference:'BANK001'};
assert.throws(()=>call('requestPayment_',other,{record}),/Không được xác nhận thay khách hàng khác/);
const pending=call('requestPayment_',cust,{record}).record;
assert.equal(pending.status,'PENDING');
assert.equal(call('periodCalcServer_','c1','2026-10-19').paid,0,'Khách tự báo chuyển tiền không tính vào doanh thu');
assert.throws(()=>call('confirmPayment_',cust,{id:pending.id}),/quyền/);
assert.throws(()=>mutate('payments',{id:pending.id,amount:'999999'}),/chỉ được xác nhận hoặc từ chối/);
call('confirmPayment_',admin,{id:pending.id});
assert.equal(call('periodCalcServer_','c1','2026-10-19').paid,300000);
assert.equal(call('periodCalcServer_','c1','2026-10-19').ending,50000);
assert.throws(()=>call('confirmPayment_',admin,{id:pending.id}),/Chỉ xử lý/);
const second=call('requestPayment_',cust,{record:{...record,reference:'BANK002',amount:'45000'}}).record;
call('rejectPayment_',admin,{id:second.id});
assert.equal(call('periodCalcServer_','c1','2026-10-19').paid,300000,'Từ chối không làm tăng tiền đã nhận');
mutate('payments',{id:'legacy',client_id:'c1',week_start:'2026-10-19',date:'2026-10-22',type:'RECEIVE',amount:'20000',method:'BANK'});
assert.equal(call('periodCalcServer_','c1','2026-10-19').paid,320000,'Admin ghi thực nhận được tính ngay');
call('manageUser_',admin,{record:{email:cust.email,name:'Khách A',role:'CLIENT',client_id:'c1',active:'TRUE'}});
const boot=call('bootstrap_',cust);
assert.equal(boot.entities.clients.length,1);
assert.equal(boot.entities.clients[0].id,'c1');
assert.equal(boot.entities.campaigns.length,1);
assert.equal(boot.entities.accounts.length,1);
assert.equal(boot.entities.payments.length,3);
assert.equal(boot.users.length,0);
assert.equal(call('bootstrap_',admin).entities.clients.length,2);
assert.throws(()=>call('manageUser_',admin,{record:{email:admin.email,role:'CLIENT',client_id:'c1',active:'TRUE'}}),/Không thể tự khóa/);
assert.throws(()=>mutate('clients',{id:'c3',name:'hack',opening_balance:'0'},cust),/quyền/);
console.log('OK V2: báo đã chuyển, admin xác nhận, không double-count, từ chối, legacy, cô lập dữ liệu khách và phân quyền.');
