/* Smoke test UI without browser: render Admin and Customer demo with minimal DOM. */
'use strict';
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const all={};
class Element {
 constructor(id){this.id=id;this._html='';this.value='';this.options=[];this.listeners={};this.dataset={};this.disabled=false;this.classList={add:()=>{},remove:()=>{},toggle:()=>{},contains:()=>false};}
 set innerHTML(s){this._html=String(s);this.options=[...this._html.matchAll(/<option value="([^"]*)"/g)].map(x=>({value:x[1]}));} get innerHTML(){return this._html;}
 addEventListener(event,fn){this.listeners[event]=fn;} querySelectorAll(){return [];} reset(){} click(){}
}
const get=id=>all[id]??(all[id]=new Element(id));
const context=vm.createContext({console,Date,Intl,Math,Set,Map,Number,Object,String,JSON,setTimeout:()=>{},location:{search:''},navigator:{},localStorage:{_data:{},getItem(k){return this._data[k]||null},setItem(k,v){this._data[k]=v},removeItem(k){delete this._data[k]}},document:{getElementById:get,querySelectorAll:()=>[],addEventListener:()=>{}},window:{ADLEDGER_CONFIG:{},crypto:{randomUUID:()=>String(Math.random())}}});
for(const file of ['core.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../'+file),'utf8'),context,{filename:file});
function navigate(page){get('mainNav').listeners.click({target:{closest:()=>({dataset:{page}})}})}
setImmediate(()=>{
 assert.match(get('view').innerHTML,/Ngân sách dự kiến/);
 navigate('payments');assert.match(get('headingAction').innerHTML,/Ghi khoản đã nhận/);
 get('demoRoleBtn').listeners.click();

 navigate('payments');
 const rendered=get('view').innerHTML;
 assert.match(get('headingAction').innerHTML,/Xác nhận đã thanh toán/);
 assert.match(rendered,/Chưa cấu hình mã QR/);
 assert.doesNotMatch(rendered,/Ghi khoản đã nhận/);
 get('demoRoleBtn').listeners.click();
 navigate('users');assert.match(get('view').innerHTML,/Tài khoản được cấp quyền/);
 navigate('settings');assert.match(get('view').innerHTML,/Tài khoản nhận thanh toán/);
 console.log('OK UI: Admin, chuyển vai khách, thanh toán khách, danh sách Users, cấu hình QR.');
});
