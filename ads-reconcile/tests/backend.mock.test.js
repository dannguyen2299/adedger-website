/* Test logic Code.gs bằng Sheet giả trong Node — không đụng Google account thật. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const sv=v=>typeof v==='string'&&v.startsWith("'")?v.slice(1):v;
class FakeSheet {
 constructor(name){this.name=name;this.data=[];}
 getLastRow(){return this.data.length;}
 getLastColumn(){return Math.max(0,...this.data.map(x=>x.length));}
 getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn());}
 getRange(r,c,rows,cols){const self=this;return {
  getValues(){const out=[];for(let i=0;i<rows;i++){const line=self.data[r-1+i]||[];out.push(Array.from({length:cols},(_,j)=>line[c-1+j]??''));}return out;},
  getDisplayValues(){const out=[];for(let i=0;i<rows;i++){const line=self.data[r-1+i]||[];out.push(Array.from({length:cols},(_,j)=>String(line[c-1+j]??'')));}return out;},
  setValues(values){values.forEach((line,i)=>{const row=self.data[r-1+i]||[];line.forEach((v,j)=>row[c-1+j]=sv(v));self.data[r-1+i]=row;});return this;},
  setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;}
 };}
 setFrozenRows(){}
 appendRow(values){this.data.push(values.map(sv));}
 deleteRow(r){this.data.splice(r-1,1);}
}
class FakeBook{
 constructor(){this.sheets=new Map()}
 getSheetByName(n){return this.sheets.get(n)||null;}
 insertSheet(n){const sh=new FakeSheet(n);this.sheets.set(n,sh);return sh;}
 setSpreadsheetTimeZone(){}
}
const ss=new FakeBook();let uid=0;
const ctx=vm.createContext({
 console, Logger:{log:()=>{}}, Date, Set, JSON, Object, String, Number, Error, Math,
 SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='GOOGLE_CLIENT_ID'?'fake-client':null})},
 Session:{getEffectiveUser:()=>({getEmail:()=> 'owner@example.com'})},
 Utilities:{getUuid:()=>String(++uid)+'-uuid',formatDate:()=> '2026-11-01'},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../apps-script/Code.gs'),'utf8'),ctx);
const call=(name,...args)=>vm.runInContext(name,ctx)(...args);
call('setupAdLedger');
assert.equal(ss.getSheetByName('Users').getLastRow(),2);
const user={email:'owner@example.com',role:'ADMIN',name:'Chủ hệ thống'};
const put=(entity,record)=>call('mutate_',user,{entity,op:'save',record});
put('clients',{id:'A',name:'Khách A',opening_balance:'0',active:'TRUE'});
const pf=call('rows_','platforms')[0];
put('accounts',{id:'ACC',name:'Via',client_id:'A',platform_id:pf.id,owner:'OWN',active:'TRUE'});
put('campaigns',{id:'CAM',name:'Campaign',client_id:'A',platform_id:pf.id,account_id:'ACC',daily_budget:'100000',start_date:'2026-10-19',end_date:'2026-10-25',status:'ACTIVE'});
put('expenses',{id:'EX',campaign_id:'CAM',date:'2026-10-20',amount:'500000',note:'Đã chạy'});
put('payments',{id:'PAY',client_id:'A',week_start:'2026-10-19',date:'2026-10-26',type:'RECEIVE',amount:'700000',method:'BANK'});
const before=call('periodCalcServer_','A','2026-10-19');
assert.equal(before.planned,700000);
assert.equal(before.spent,500000);
assert.equal(before.paid,700000);
assert.equal(before.ending,200000);
put('closings',{id:'CLOSE',client_id:'A',week_start:'2026-10-19',status:'CONFIRMED'});
const close=call('find_','closings','CLOSE');
assert.equal(close.ending,'200000');
assert.equal(close.status,'CONFIRMED');
assert.throws(()=>put('expenses',{id:'EX',campaign_id:'CAM',date:'2026-10-20',amount:'800000'}),/Kỳ này hoặc kỳ sau đã chốt/);
assert.throws(()=>put('payments',{id:'NEW',client_id:'A',week_start:'2026-10-19',date:'2026-10-27',type:'RECEIVE',amount:'1'}),/Kỳ đối soát đã chốt/);
assert.throws(()=>put('campaigns',{id:'CAM',name:'Campaign',client_id:'A',platform_id:pf.id,account_id:'ACC',daily_budget:'200000',start_date:'2026-10-19',end_date:'2026-10-25',status:'ACTIVE'}),/lệch ngân sách của kỳ đã chốt/);
put('campaigns',{id:'FUTURE',name:'New campaign',client_id:'A',platform_id:pf.id,account_id:'ACC',daily_budget:'100000',start_date:'2026-11-02',end_date:'',status:'ACTIVE'});
assert.equal(call('rows_','campaigns').length,2);
put('closings',{id:'CLOSE',client_id:'A',week_start:'2026-10-19',status:'OPEN'});
put('expenses',{id:'EX',campaign_id:'CAM',date:'2026-10-20',amount:'600000'});
assert.equal(call('periodCalcServer_','A','2026-10-19').ending,100000);
// Cột chữ không bị Sheets đổi kiểu: giữ số 0 đầu SĐT, ngày dạng chuỗi; cột tiền ghi dạng số.
put('clients',{id:'B',name:'Khách B',phone:'0912345678',opening_balance:'-150000',active:'TRUE'});
const rawB=ss.getSheetByName('clients').data.find(r=>r[0]==='B');
assert.equal(rawB[3],'0912345678');assert.equal(rawB[4],-150000);
assert.equal(call('find_','clients','B').phone,'0912345678');
assert.equal(typeof ss.getSheetByName('expenses').data[1][2],'string');
// Tab Users nhập tay: chữ thường, khoảng trắng, checkbox TRUE (boolean).
ss.getSheetByName('Users').data.push([' Khach@Example.com ','Khách','client',true,'B']);
const u=call('user_','khach@example.com');
assert.equal(u.role,'CLIENT');assert.equal(u.client_id,'B');
// Chiến dịch chạy dài: sau khi chốt tuần đầu vẫn kết thúc / tạm dừng được; đổi ngân sách hoặc dời ngày vào kỳ đã chốt thì bị chặn.
put('clients',{id:'C',name:'Khách C',opening_balance:'0',active:'TRUE'});
put('accounts',{id:'ACCC',name:'Via C',client_id:'C',platform_id:pf.id,owner:'OWN',active:'TRUE'});
const L={id:'LONG',name:'Long',client_id:'C',platform_id:pf.id,account_id:'ACCC',daily_budget:'100000',start_date:'2026-10-19',end_date:'',status:'ACTIVE'};
put('campaigns',L);put('closings',{id:'CLC',client_id:'C',week_start:'2026-10-19',status:'CONFIRMED'});
put('campaigns',{...L,status:'PAUSED'});
put('campaigns',{...L,status:'PAUSED',end_date:'2026-11-08'});
assert.throws(()=>put('campaigns',{...L,daily_budget:'200000'}),/lệch ngân sách của kỳ đã chốt/);
assert.throws(()=>put('campaigns',{...L,start_date:'2026-10-22'}),/lệch ngân sách của kỳ đã chốt/);
assert.throws(()=>put('campaigns',{id:'RETRO',name:'Retro',client_id:'C',platform_id:pf.id,account_id:'ACCC',daily_budget:'1',start_date:'2026-10-20',end_date:'',status:'ACTIVE'}),/hồi tố/);
assert.throws(()=>put('expenses',{id:'TYPO',campaign_id:'LONG',date:'2027-10-20',amount:'1000'}),/ngoài thời gian chạy/);
// Không xóa khách hàng còn tài khoản đăng nhập.
assert.throws(()=>call('mutate_',user,{entity:'clients',op:'delete',record:{id:'B'}}),/tài khoản đăng nhập/);
console.log('OK: Backend fake Sheets CRUD, xác minh số liệu, khóa/mở kỳ và ngăn sửa hồi tố.');
