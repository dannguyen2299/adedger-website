/**
 * AdLedger API — Google Apps Script V8 (bound vào Google Sheet).
 * Dùng duy nhất doPost(text/plain JSON) để chạy từ GitHub Pages mà không có CORS preflight.
 * KHÔNG chia sẻ quyền sửa Google Sheet. Mọi lệnh bắt buộc có phiên xác thực.
 */
const ADL = {
  VERSION: '2.0.0', SESSION_HOURS: 24,
  FIELDS: {
    clients: ['id','name','contact','phone','opening_balance','note','active','created_at','updated_at','created_by'],
    platforms: ['id','name','active','created_at','updated_at','created_by'],
    accounts: ['id','name','client_id','platform_id','owner','active','created_at','updated_at','created_by'],
    campaigns: ['id','name','client_id','platform_id','account_id','daily_budget','start_date','end_date','status','created_at','updated_at','created_by'],
    expenses: ['id','campaign_id','date','amount','note','created_at','updated_at','created_by'],
    payments: ['id','client_id','week_start','date','type','amount','method','reference','note','created_at','updated_at','created_by','status','customer_confirmed_at','admin_confirmed_at','requested_by','confirmed_by'],
    closings: ['id','client_id','week_start','status','planned','spent','paid','opening','ending','closed_at','created_at','updated_at','created_by']
  },
  INTERNAL: {
    Users: ['email','name','role','active','client_id'],
    PaymentConfig: ['key','value'],
    Sessions: ['token_hash','email','expires_at','created_at'],
    AuditLogs: ['at','email','operation','entity','record_id','before_json','after_json']
  }
};

function setupAdLedger() {
  const ss = spreadsheet_();
  Object.keys(ADL.FIELDS).forEach(key => ensureSheet_(ss, key, ADL.FIELDS[key]));
  Object.keys(ADL.INTERNAL).forEach(key => ensureSheet_(ss, key, ADL.INTERNAL[key]));
  const owner = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  const userSheet = ss.getSheetByName('Users');
  const users = sheetRows_(userSheet);
  if (owner && !users.some(u => u.email === owner)) {
    userSheet.appendRow(textRow_([owner, 'Chủ hệ thống', 'ADMIN', 'TRUE', '']));
  }
  const platSheet = ss.getSheetByName('platforms');
  if (platSheet.getLastRow() === 1) {
    ['Facebook Ads','Google Shopping','ChatGPT Ads','TikTok Ads','Zalo Ads','Google Search Ads'].forEach(name => {
      const timestamp = new Date().toISOString();
      appendRecord_(platSheet, ADL.FIELDS.platforms, {id:Utilities.getUuid(),name:name,active:'TRUE',created_at:timestamp,updated_at:timestamp,created_by:owner});
    });
  }
  ss.setSpreadsheetTimeZone('Asia/Ho_Chi_Minh');
  Logger.log('Setup hoàn tất. Chủ hệ thống: ' + (owner || '(không đọc được email — nhập thủ công vào tab Users)'));
  Logger.log('Nhớ đặt Script Properties GOOGLE_CLIENT_ID trước khi deploy.');
}

function doGet() {
  return output_({ok:true,data:{name:'AdLedger API',version:ADL.VERSION,message:'Sử dụng POST đã xác thực.'}});
}
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw appError_('INVALID','Body trống');
    if (e.postData.contents.length > 450000) throw appError_('INVALID','Dữ liệu gửi vượt giới hạn');
    const req = JSON.parse(e.postData.contents);
    if (req.action !== 'uploadPaymentQr' && e.postData.contents.length > 150000) throw appError_('INVALID','Dữ liệu gửi vượt giới hạn');
    let result;
    if (req.action === 'login') result = login_(req.idToken);
    else {
      const user = authenticate_(req.token);
      if (req.action === 'bootstrap') result = bootstrap_(user);
      else if (req.action === 'mutate') result = mutate_(user,req);
      else if (req.action === 'logout') result = logout_(req.token);
      else if (req.action === 'requestPayment') result = requestPayment_(user,req);
      else if (req.action === 'confirmPayment') result = confirmPayment_(user,req);
      else if (req.action === 'rejectPayment') result = rejectPayment_(user,req);
      else if (req.action === 'manageUser') result = manageUser_(user,req);
      else if (req.action === 'savePaymentConfig') result = savePaymentConfig_(user,req);
      else if (req.action === 'uploadPaymentQr') result = uploadPaymentQr_(user,req);
      else throw appError_('INVALID','Hành động không hợp lệ');
    }
    return output_({ok:true,data:result});
  } catch (err) {
    console.error('AdLedger API error: ' + String(err && err.stack || err));
    return output_({ok:false,code:err.code||'ERROR',message:err.publicMessage||'Có lỗi khi xử lý dữ liệu. Vui lòng thử lại.'});
  }
}
function output_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function appError_(code,message) { const err = new Error(message);err.code=code;err.publicMessage=message;return err; }
function spreadsheet_() {
  const externalId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const ss = externalId ? SpreadsheetApp.openById(externalId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw appError_('SETUP','Không tìm thấy Sheet. Dùng Apps Script mở từ Google Sheets hoặc đặt SPREADSHEET_ID.');
  return ss;
}
function ensureSheet_(ss,name,headers){
  let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);
  if(sh.getLastRow()===0){sh.getRange(1,1,1,headers.length).setValues([headers]);sh.setFrozenRows(1);sh.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#192c49').setFontColor('#ffffff');}
  // Nâng cấp V1 -> V2: chỉ được bổ sung cột mới ở cuối, không sửa dữ liệu cũ.
  const width=sh.getLastColumn();
  const existing=sh.getRange(1,1,1,width).getDisplayValues()[0];
  if(existing.length>headers.length || existing.some((h,i)=>headers[i]!==h))throw appError_('SETUP','Cấu trúc cột tab '+name+' không đúng. Không chỉnh tiêu đề trực tiếp.');
  if(width<headers.length){sh.getRange(1,width+1,1,headers.length-width).setValues([headers.slice(width)]);sh.getRange(1,width+1,1,headers.length-width).setFontWeight('bold').setBackground('#192c49').setFontColor('#ffffff');}
  return sh;
}
// Đọc giá trị thô (không phụ thuộc định dạng hiển thị/locale của Sheet) rồi chuẩn hóa về chuỗi.
function cellText_(v,tz){
  if(v instanceof Date){
    const time=Utilities.formatDate(v,tz,'HH:mm:ss');
    return time==='00:00:00'?Utilities.formatDate(v,tz,'yyyy-MM-dd'):v.toISOString();
  }
  if(v===true||v===false)return v?'TRUE':'FALSE';
  return v==null?'':String(v);
}
function sheetMatrix_(sh){
  if(sh.getLastRow()<1)return [];
  let tz='Asia/Ho_Chi_Minh';try{tz=sh.getParent().getSpreadsheetTimeZone()||tz;}catch(err){}
  return sh.getRange(1,1,sh.getLastRow(),sh.getLastColumn()).getValues().map(row=>row.map(v=>cellText_(v,tz)));
}
function sheetRows_(sh){
  if(sh.getLastRow()<2)return [];
  const values=sheetMatrix_(sh);const keys=values[0];
  return values.slice(1).filter(row=>row.some(x=>x!=='')).map(row=>Object.fromEntries(keys.map((k,i)=>[k,row[i]||''])));
}
function appendRecord_(sh,keys,record){sh.appendRow(keys.map(k=>asCell_(record[k],k)));}
const MONEY_KEYS_={opening_balance:1,daily_budget:1,amount:1,planned:1,spent:1,paid:1,opening:1,ending:1};
function asCell_(value,key){
  const s=String(value==null?'':value);
  if(s==='')return '';
  // Chỉ cột tiền được ghi dạng số (để SUM được). Mọi cột khác ghi dạng chữ bằng dấu ' ở đầu:
  // giữ số 0 đầu của SĐT/số tài khoản, không để Sheets tự đổi ngày/giờ, và chặn formula injection.
  if(key && MONEY_KEYS_[key] && /^-?\d+(\.\d+)?$/.test(s))return Number(s);
  return "'"+s;
}
function textRow_(values){return values.map(v=>asCell_(v));}
function sha256_(token){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token,Utilities.Charset.UTF_8).map(b=>('0'+(b<0?b+256:b).toString(16)).slice(-2)).join('');}
function verifyGoogle_(idToken){
  const clientId=PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if(!clientId)throw appError_('SETUP','Chưa cấu hình GOOGLE_CLIENT_ID trong Script Properties.');
  if(!idToken || String(idToken).length>7000)throw appError_('AUTH','Thiếu Google ID Token');
  const url='https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(idToken);
  const res=UrlFetchApp.fetch(url,{muteHttpExceptions:true});
  if(res.getResponseCode()!==200)throw appError_('AUTH','Không xác minh được tài khoản Google.');
  const info=JSON.parse(res.getContentText());
  if(info.aud!==clientId || !['accounts.google.com','https://accounts.google.com'].includes(info.iss) || String(info.email_verified)!=='true' || Number(info.exp)*1000<Date.now())throw appError_('AUTH','Google ID Token không hợp lệ.');
  return String(info.email||'').trim().toLowerCase();
}
function user_(email){
  // Chấp nhận dữ liệu nhập tay trong tab Users: thừa khoảng trắng, chữ thường, ô checkbox.
  const u=sheetRows_(spreadsheet_().getSheetByName('Users')).map(x=>({...x,email:String(x.email).trim().toLowerCase(),role:String(x.role).trim().toUpperCase(),active:String(x.active).trim().toUpperCase(),client_id:String(x.client_id||'').trim()})).find(x=>x.email===email && x.active==='TRUE');
  return u||null;
}
function pruneSessions_(){
  const sh=spreadsheet_().getSheetByName('Sessions'),values=sheetMatrix_(sh),now=Date.now();
  for(let i=values.length-1;i>=1;i--){const exp=Date.parse(values[i][2]);if(!exp||exp<now)sh.deleteRow(i+1);}
}
function login_(idToken){
  const email=verifyGoogle_(idToken);
  const user=user_(email);
  if(!user)throw appError_('NOT_ALLOWED','Tài khoản này chưa được cấp quyền truy cập.');
  if(!['ADMIN','EDITOR','VIEWER','CLIENT'].includes(user.role))throw appError_('NOT_ALLOWED','Vai trò người dùng không hợp lệ.');
  const token=Utilities.getUuid()+'.'+Utilities.getUuid()+'.'+Utilities.getUuid();
  const expires=new Date(Date.now()+ADL.SESSION_HOURS*3600000).toISOString();
  try{pruneSessions_();}catch(err){console.warn('Không dọn được phiên cũ: '+err);}
  spreadsheet_().getSheetByName('Sessions').appendRow(textRow_([sha256_(token),email,expires,new Date().toISOString()]));
  return {session:token,expires:expires,me:{email:user.email,name:user.name,role:user.role,client_id:user.client_id||''}};
}
function authenticate_(token){
  if(!token||String(token).length>200)throw appError_('AUTH','Chưa đăng nhập hoặc phiên không hợp lệ.');
  const hash=sha256_(token);
  const session=sheetRows_(spreadsheet_().getSheetByName('Sessions')).find(s=>s.token_hash===hash);
  const exp=session?Date.parse(session.expires_at):NaN;
  if(!session || !exp || exp<Date.now())throw appError_('AUTH','Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  const u=user_(session.email.toLowerCase());if(!u)throw appError_('NOT_ALLOWED','Tài khoản của bạn đã bị khóa hoặc bị xóa.');
  if(u.role==='CLIENT' && (!u.client_id || !find_('clients',u.client_id)))throw appError_('NOT_ALLOWED','Tài khoản khách chưa được gắn khách hàng hợp lệ.');
  return {email:u.email,name:u.name,role:u.role,client_id:u.client_id||''};
}
function bootstrap_(user){
  const ss=spreadsheet_(),entities={};
  Object.keys(ADL.FIELDS).forEach(k=>{entities[k]=sheetRows_(ss.getSheetByName(k));});
  let users=[];
  if(user.role==='CLIENT'){
    // LỌC TRÊN SERVER, tuyệt đối không gửi dữ liệu khách khác về browser.
    const id=user.client_id;
    entities.clients=entities.clients.filter(x=>x.id===id);
    entities.accounts=entities.accounts.filter(x=>x.client_id===id);
    entities.campaigns=entities.campaigns.filter(x=>x.client_id===id);
    const ids=new Set(entities.campaigns.map(x=>x.id));
    entities.expenses=entities.expenses.filter(x=>ids.has(x.campaign_id));
    entities.payments=entities.payments.filter(x=>x.client_id===id);
    entities.closings=entities.closings.filter(x=>x.client_id===id);
    const platformIds=new Set(entities.campaigns.map(x=>x.platform_id));
    entities.platforms=entities.platforms.filter(x=>platformIds.has(x.id));
  }
  if(user.role==='ADMIN')users=sheetRows_(ss.getSheetByName('Users'));
  return {me:user,entities:entities,users:users,paymentConfig:paymentConfig_(),server_time:new Date().toISOString()};
}
function logout_(token){
  const sh=spreadsheet_().getSheetByName('Sessions'),hash=sha256_(token);
  const values=sheetMatrix_(sh);
  for(let i=values.length-1;i>=1;i--)if(values[i][0]===hash){sh.deleteRow(i+1);break;}
  return {message:'Đã đăng xuất'};
}
function requireRole_(user,roles){if(!roles.includes(user.role))throw appError_('FORBIDDEN','Bạn không có quyền thực hiện thao tác này.');}
function isDate_(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return false;const d=new Date(s+'T12:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===s;}
function monday_(s){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
function addDays_(s,n){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function num_(v){return Number(v)||0;}
function rows_(key){return sheetRows_(spreadsheet_().getSheetByName(key));}
function find_(key,id){return rows_(key).find(x=>x.id===id)||null;}
function exists_(key,id){return !!find_(key,id);}
function periodClosed_(clientId,date){const week=monday_(date);return rows_('closings').some(x=>x.client_id===clientId && x.week_start===week && x.status==='CONFIRMED');}
function closedThisOrLater_(clientId,date){const week=monday_(date);return rows_('closings').some(x=>x.client_id===clientId && x.week_start>=week && x.status==='CONFIRMED');}
function campaignTouchesWeek_(campaign,week){return campaign.start_date<=addDays_(week,6) && (!campaign.end_date || campaign.end_date>=week);}
function validateSignedMoney_(value,label){if(!/^-?\d+(\.0+)?$/.test(String(value)) || Math.abs(num_(value))>1000000000000)throw appError_('INVALID',label+' phải là số nguyên VND trong khoảng ±1.000 tỷ.');}
function validateMoney_(value,label){if(!/^\d+(\.0+)?$/.test(String(value)) || num_(value)>1000000000000)throw appError_('INVALID',label+' phải là số nguyên VND từ 0 đến 1.000 tỷ.');}
function validate_(entity,rec,old){
  const needed={clients:['name'],platforms:['name'],accounts:['name','client_id','platform_id','owner'],campaigns:['name','client_id','platform_id','account_id','daily_budget','start_date','status'],expenses:['campaign_id','date','amount'],payments:['client_id','week_start','date','type','amount'],closings:['client_id','week_start','status']};
  (needed[entity]||[]).forEach(key=>{if(!String(rec[key]||'').trim() && String(rec[key])!=='0')throw appError_('INVALID','Thiếu trường '+key)});
  if(entity==='clients'){validateSignedMoney_(rec.opening_balance,'Số dư ban đầu');}
  if(entity==='accounts'){
    if(!exists_('clients',rec.client_id)||!exists_('platforms',rec.platform_id))throw appError_('INVALID','Khách hàng hoặc nền tảng không tồn tại.');
    if(!['OWN','CLIENT','OTHER'].includes(rec.owner))throw appError_('INVALID','Chủ tài khoản không hợp lệ');
    if(old && (old.client_id!==rec.client_id || old.platform_id!==rec.platform_id) && rows_('campaigns').some(c=>c.account_id===old.id))throw appError_('LOCKED','Không chuyển tài khoản đã gắn chiến dịch sang khách hàng hoặc nền tảng khác.');
  }
  if(entity==='campaigns'){
    const a=find_('accounts',rec.account_id);
    if(!a||a.client_id!==rec.client_id||a.platform_id!==rec.platform_id)throw appError_('INVALID','Tài khoản quảng cáo không khớp với khách hàng và nền tảng.');
    validateMoney_(rec.daily_budget,'Ngân sách/ngày');
    if(!isDate_(rec.start_date)||(rec.end_date&&(!isDate_(rec.end_date)||rec.end_date<rec.start_date)))throw appError_('INVALID','Ngày chiến dịch không hợp lệ.');
    if(!['ACTIVE','PAUSED','ENDED','DRAFT'].includes(rec.status))throw appError_('INVALID','Trạng thái chiến dịch không hợp lệ');
    if(old){
      if(old.client_id!==rec.client_id && rows_('expenses').some(e=>e.campaign_id===rec.id))throw appError_('LOCKED','Không đổi khách hàng của chiến dịch đã phát sinh chi phí.');
      const changed=['daily_budget','start_date','end_date','client_id','status','platform_id','account_id'].some(k=>String(old[k]||'')!==String(rec[k]||''));
      if((old.platform_id!==rec.platform_id||old.account_id!==rec.account_id) && rows_('expenses').some(e=>e.campaign_id===rec.id))throw appError_('LOCKED','Không đổi tài khoản hoặc nền tảng của chiến dịch đã phát sinh chi phí.');
      if(changed&&rows_('closings').some(c=>c.status==='CONFIRMED' && (c.client_id===old.client_id && campaignTouchesWeek_(old,c.week_start) || c.client_id===rec.client_id && campaignTouchesWeek_(rec,c.week_start))))throw appError_('LOCKED','Chiến dịch thuộc kỳ đã chốt. Hãy mở kỳ liên quan trước khi sửa.');
    } else if(rows_('closings').some(c=>c.client_id===rec.client_id && c.status==='CONFIRMED' && campaignTouchesWeek_(rec,c.week_start))) {
      throw appError_('LOCKED','Không tạo chiến dịch hồi tố vào kỳ đã chốt.');
    }
  }
  if(entity==='expenses'){
    if(!isDate_(rec.date))throw appError_('INVALID','Ngày chi phí không hợp lệ.');
    validateMoney_(rec.amount,'Chi phí');
    const cp=find_('campaigns',rec.campaign_id);if(!cp)throw appError_('INVALID','Chiến dịch không tồn tại.');
    if(closedThisOrLater_(cp.client_id,rec.date))throw appError_('LOCKED','Kỳ này hoặc kỳ sau đã chốt. Hãy mở lại các kỳ liên quan trước khi chỉnh sửa.');
    if(old){const oldCp=find_('campaigns',old.campaign_id);if(oldCp&&closedThisOrLater_(oldCp.client_id,old.date))throw appError_('LOCKED','Kỳ đối soát trước khi sửa đã chốt.');}
  }
  if(entity==='payments'){
    if(!exists_('clients',rec.client_id))throw appError_('INVALID','Khách hàng không tồn tại.');
    if(!isDate_(rec.date)||!isDate_(rec.week_start)||rec.week_start!==monday_(rec.week_start))throw appError_('INVALID','Ngày hoặc tuần đối soát không hợp lệ.');
    validateMoney_(rec.amount,'Số tiền');
    if(!['RECEIVE','REFUND'].includes(rec.type))throw appError_('INVALID','Loại thanh toán không hợp lệ.');
    if(closedThisOrLater_(rec.client_id,rec.week_start) || old && closedThisOrLater_(old.client_id,old.week_start))throw appError_('LOCKED','Kỳ đối soát đã chốt. Chỉ có thể sửa sau khi mở lại kỳ.');
  }
  if(entity==='closings'){
    if(!exists_('clients',rec.client_id)||!isDate_(rec.week_start)||rec.week_start!==monday_(rec.week_start))throw appError_('INVALID','Khách hàng hoặc kỳ đối soát không hợp lệ.');
    if(!['OPEN','CONFIRMED'].includes(rec.status))throw appError_('INVALID','Trạng thái chốt kỳ không hợp lệ.');
    if(rec.status==='CONFIRMED'){
      const today=Utilities.formatDate(new Date(),'Asia/Ho_Chi_Minh','yyyy-MM-dd');
      if(today<addDays_(rec.week_start,7))throw appError_('INVALID','Chỉ được chốt sau khi kỳ kết thúc, từ thứ Hai tuần kế tiếp.');
    }
  }
}
function mutate_(user,req){
  const entity=String(req.entity||''),op=String(req.op||'');
  if(!Object.prototype.hasOwnProperty.call(ADL.FIELDS,entity))throw appError_('INVALID','Danh mục không được hỗ trợ.');
  if(!['save','delete'].includes(op))throw appError_('INVALID','Thao tác không hợp lệ.');
  requireRole_(user,entity==='expenses'?['ADMIN','EDITOR']:['ADMIN']);
  if(entity==='payments' && op==='delete')throw appError_('INVALID','Không xóa giao dịch thanh toán. Hãy từ chối yêu cầu đang chờ hoặc ghi bút toán hoàn tiền.');
  if(entity==='closings' && op==='delete')throw appError_('INVALID','Không xóa lịch sử chốt kỳ.');
  const input=req.record||{};
  if(!input.id || typeof input.id!=='string' || input.id.length>120)throw appError_('INVALID','ID đối tượng không hợp lệ.');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw appError_('BUSY','Hệ thống đang ghi dữ liệu, vui lòng thử lại.');
  try {
    const ss=spreadsheet_(),sh=ss.getSheetByName(entity),keys=ADL.FIELDS[entity];
    const values=sheetMatrix_(sh);
    const index=values.findIndex((r,i)=>i>0&&r[0]===input.id),old=index>=0?Object.fromEntries(keys.map((k,i)=>[k,values[index][i]||''])):null;
    if(op==='delete'){
      if(!old)throw appError_('NOT_FOUND','Không tìm thấy dữ liệu để xóa');
      blockDelete_(entity,old);
      if(entity==='expenses'){const campaign=find_('campaigns',old.campaign_id);if(campaign&&closedThisOrLater_(campaign.client_id,old.date))throw appError_('LOCKED','Kỳ đối soát đã chốt.');}
      if(entity==='payments'&&closedThisOrLater_(old.client_id,old.week_start))throw appError_('LOCKED','Kỳ đối soát đã chốt.');
      sh.deleteRow(index+1);audit_(user,'delete',entity,old.id,old,null);return {deleted:old.id};
    }
    if(old===null && rows_(entity).some(x=>x.id===input.id))throw appError_('DUPLICATE','Trùng mã dữ liệu');
    const rec={...old};keys.forEach(k=>{if(Object.prototype.hasOwnProperty.call(input,k)&&!['created_at','updated_at','created_by','closed_at','planned','spent','paid','opening','ending'].includes(k)){const value=input[k];rec[k]=String(value==null?'':value).trim().slice(0,k==='note'?2000:500);}});
    if(!old)rec.id=input.id;
    if(entity==='payments'){
      if(old && !isConfirmedPayment_(old))throw appError_('LOCKED','Yêu cầu chuyển khoản đang xử lý chỉ được xác nhận hoặc từ chối bằng nút chuyên dụng.');
      if(old && ['status','customer_confirmed_at','admin_confirmed_at','requested_by','confirmed_by'].some(k=>Object.prototype.hasOwnProperty.call(input,k)&&String(input[k])!==String(old[k]||'')))throw appError_('INVALID','Không được sửa lịch sử trạng thái xác nhận.');
      if(isDate_(rec.week_start))rec.week_start=monday_(rec.week_start);
      if(!old){rec.status='CONFIRMED';rec.customer_confirmed_at='';rec.admin_confirmed_at=new Date().toISOString();rec.requested_by=user.email;rec.confirmed_by=user.email;}
    }
    validate_(entity,rec,old);
    const now=new Date().toISOString();
    if(entity==='clients' && old && String(old.opening_balance)!==String(rec.opening_balance) && rows_('closings').some(x=>x.client_id===rec.id&&x.status==='CONFIRMED'))throw appError_('LOCKED','Đã có kỳ chốt, không thể sửa số dư ban đầu.');
    if(entity==='closings'){
      const clash=rows_('closings').find(x=>x.client_id===rec.client_id&&x.week_start===rec.week_start&&x.id!==rec.id);
      if(clash)throw appError_('DUPLICATE','Khách hàng này đã có bản ghi chốt kỳ.');
      if(rec.status==='CONFIRMED'){
        const calc=periodCalcServer_(rec.client_id,rec.week_start);
        ['planned','spent','paid','opening','ending'].forEach(k=>rec[k]=String(calc[k]));
        rec.closed_at=now;
      } else rec.closed_at='';
    }
    rec.created_at=old?old.created_at:now;rec.updated_at=now;rec.created_by=old?old.created_by:user.email;
    if(index>=0)sh.getRange(index+1,1,1,keys.length).setValues([keys.map(k=>asCell_(rec[k],k))]);
    else appendRecord_(sh,keys,rec);
    audit_(user,old?'update':'create',entity,rec.id,old,rec);
    return {record:rec};
  } finally {lock.releaseLock()}
}
function blockDelete_(entity,old){
  const links={clients:[['accounts','client_id'],['campaigns','client_id'],['payments','client_id'],['closings','client_id']],platforms:[['accounts','platform_id'],['campaigns','platform_id']],accounts:[['campaigns','account_id']],campaigns:[['expenses','campaign_id']]};
  for(const link of links[entity]||[])if(rows_(link[0]).some(x=>x[link[1]]===old.id))throw appError_('REFERENCED','Dữ liệu đã được sử dụng. Vui lòng chuyển trạng thái tạm ẩn thay vì xóa.');
  if(entity==='campaigns' && rows_('closings').some(c=>c.client_id===old.client_id && c.status==='CONFIRMED' && campaignTouchesWeek_(old,c.week_start)))throw appError_('LOCKED','Không xóa chiến dịch thuộc kỳ đã chốt.');
}
function plannedServer_(c,week){
  if(c.status==='DRAFT')return 0;
  const from=String(c.start_date)>week?String(c.start_date):week;
  const end=addDays_(week,6);
  const until=c.end_date && c.end_date<end?c.end_date:end;
  if(!isDate_(from)||from>until)return 0;
  return (Math.round((new Date(until+'T12:00:00Z')-new Date(from+'T12:00:00Z'))/86400000)+1)*num_(c.daily_budget);
}
function periodCalcServer_(clientId,week){
  const clients=rows_('clients'),campaigns=rows_('campaigns'),expenses=rows_('expenses'),payments=rows_('payments');
  const client=clients.find(x=>x.id===clientId);
  const cps=campaigns.filter(x=>x.client_id===clientId),ids=new Set(cps.map(x=>x.id)),next=addDays_(week,7);
  const spend=expenses.filter(x=>ids.has(x.campaign_id));
  const paid=payments.filter(x=>x.client_id===clientId && isConfirmedPayment_(x));
  const sumSpend=x=>x.reduce((s,e)=>s+num_(e.amount),0);
  const sumPaid=x=>x.reduce((s,p)=>s+(p.type==='REFUND'?-1:1)*num_(p.amount),0);
  const opening=num_(client.opening_balance)+sumPaid(paid.filter(x=>x.week_start<week))-sumSpend(spend.filter(x=>x.date<week));
  const result={planned:cps.reduce((s,c)=>s+plannedServer_(c,week),0),spent:sumSpend(spend.filter(x=>x.date>=week&&x.date<next)),paid:sumPaid(paid.filter(x=>x.week_start===week)),opening:opening};
  result.ending=result.opening+result.paid-result.spent;
  return result;
}
function audit_(user,operation,entity,recordId,before,after){
  const sh=spreadsheet_().getSheetByName('AuditLogs');
  const trunc=x=>JSON.stringify(x||{}).slice(0,25000);
  sh.appendRow(textRow_([new Date().toISOString(),user.email,operation,entity,recordId,trunc(before),trunc(after)]));
}

/** Dùng thủ công trong Script Editor nếu cần thu hồi toàn bộ phiên đăng nhập. */
function revokeAllSessions(){const sh=spreadsheet_().getSheetByName('Sessions');if(sh.getLastRow()>1)sh.deleteRows(2,sh.getLastRow()-1);}

/** Quy trình thanh toán hai bước: khách tự báo đã chuyển, ADMIN kiểm tra ngân hàng mới xác nhận đã nhận. */
function isConfirmedPayment_(p){return !p.status || p.status==='CONFIRMED';} // Giao dịch V1 là đã nhận.
function requestPayment_(user,req){
  requireRole_(user,['CLIENT','ADMIN']);
  const r=req.record||{};
  const clientId=user.role==='CLIENT'?user.client_id:String(r.client_id||'');
  if(user.role==='CLIENT' && r.client_id && r.client_id!==clientId)throw appError_('FORBIDDEN','Không được xác nhận thay khách hàng khác.');
  if(!exists_('clients',clientId))throw appError_('INVALID','Khách hàng không hợp lệ.');
  const amount=String(r.amount||'');validateMoney_(amount,'Số tiền');if(num_(amount)<=0)throw appError_('INVALID','Số tiền phải lớn hơn 0.');
  const date=String(r.date||'');
  if(!isDate_(date)||!isDate_(String(r.week_start||'')))throw appError_('INVALID','Ngày thanh toán không hợp lệ.');
  const week=monday_(String(r.week_start));
  if(date>Utilities.formatDate(new Date(),'Asia/Ho_Chi_Minh','yyyy-MM-dd'))throw appError_('INVALID','Không thể xác nhận chuyển khoản trong tương lai.');
  const reference=String(r.reference||'').trim().slice(0,120),note=String(r.note||'').trim().slice(0,1200);
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw appError_('BUSY','Hệ thống đang bận, vui lòng thử lại.');
  try{
    if(reference && rows_('payments').some(x=>x.client_id===clientId&&x.reference===reference&&x.amount===amount&&x.date===date&&x.status!=='REJECTED'))throw appError_('DUPLICATE','Mã giao dịch này đã được khách xác nhận trước đó.');
    const now=new Date().toISOString();
    const record={id:Utilities.getUuid(),client_id:clientId,week_start:week,date:date,type:'RECEIVE',amount:amount,method:'BANK',reference:reference,note:note,created_at:now,updated_at:now,created_by:user.email,status:'PENDING',customer_confirmed_at:now,admin_confirmed_at:'',requested_by:user.email,confirmed_by:''};
    appendRecord_(spreadsheet_().getSheetByName('payments'),ADL.FIELDS.payments,record);
    audit_(user,'customer-confirmed-transfer','payments',record.id,null,record);
    return {record:record};
  }finally{lock.releaseLock();}
}
function transitionPayment_(user,req,target){
  requireRole_(user,['ADMIN']);
  const id=String(req.id||'');if(!id)throw appError_('INVALID','Thiếu mã thanh toán.');
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw appError_('BUSY','Hệ thống đang bận, vui lòng thử lại.');
  try{
    const sh=spreadsheet_().getSheetByName('payments'),rows=sheetRows_(sh);
    const index=rows.findIndex(x=>x.id===id);if(index<0)throw appError_('NOT_FOUND','Không tìm thấy giao dịch.');
    const old=rows[index];if(old.status!=='PENDING')throw appError_('INVALID','Chỉ xử lý giao dịch đang chờ xác nhận.');
    if(target==='CONFIRMED' && closedThisOrLater_(old.client_id,old.week_start))throw appError_('LOCKED','Kỳ đối soát đã chốt. Admin cần mở lại kỳ liên quan để xác nhận tiền vào số dư.');
    const rec={...old,status:target,updated_at:new Date().toISOString(),admin_confirmed_at:target==='CONFIRMED'?new Date().toISOString():'',confirmed_by:target==='CONFIRMED'?user.email:''};
    sh.getRange(index+2,1,1,ADL.FIELDS.payments.length).setValues([ADL.FIELDS.payments.map(k=>asCell_(rec[k],k))]);
    audit_(user,target==='CONFIRMED'?'admin-received':'admin-rejected','payments',rec.id,old,rec);
    return {record:rec};
  }finally{lock.releaseLock();}
}
function confirmPayment_(user,req){return transitionPayment_(user,req,'CONFIRMED');}
function rejectPayment_(user,req){return transitionPayment_(user,req,'REJECTED');}
function manageUser_(user,req){
  requireRole_(user,['ADMIN']);
  const input=req.record||{},email=String(input.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200)throw appError_('INVALID','Email Google không hợp lệ.');
  const role=String(input.role||'CLIENT').toUpperCase(),active=String(input.active||'TRUE').toUpperCase();
  if(!['CLIENT','ADMIN','EDITOR','VIEWER'].includes(role)||!['TRUE','FALSE'].includes(active))throw appError_('INVALID','Vai trò hoặc trạng thái không hợp lệ.');
  const clientId=role==='CLIENT'?String(input.client_id||''):'';
  if(role==='CLIENT'&&!exists_('clients',clientId))throw appError_('INVALID','Phải chọn khách hàng được phép xem.');
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw appError_('BUSY','Hệ thống đang bận.');
  try{
    const sh=spreadsheet_().getSheetByName('Users'),users=sheetRows_(sh),idx=users.findIndex(x=>String(x.email).trim().toLowerCase()===email),old=idx>=0?users[idx]:null;
    if(email===user.email && (role!=='ADMIN'||active!=='TRUE'))throw appError_('INVALID','Không thể tự khóa hoặc hạ quyền Admin đang đăng nhập.');
    const rec={email:email,name:String(input.name||'').trim().slice(0,120),role:role,active:active,client_id:clientId};
    const keys=ADL.INTERNAL.Users;
    if(idx>=0)sh.getRange(idx+2,1,1,keys.length).setValues([textRow_(keys.map(k=>rec[k]))]);
    else appendRecord_(sh,keys,rec);
    audit_(user,old?'user-update':'user-create','Users',email,old,rec);
    return {record:rec};
  }finally{lock.releaseLock();}
}
function configRow_(key){return sheetRows_(spreadsheet_().getSheetByName('PaymentConfig')).find(x=>x.key===key)||null;}
function paymentConfig_(){
  const data=Object.fromEntries(rowsConfig_().map(x=>[x.key,x.value]));
  const conf={bank_name:data.bank_name||'',account_name:data.account_name||'',account_number:data.account_number||'',transfer_note:data.transfer_note||'',qr_image:''};
  const fileId=data.qr_file_id;
  if(fileId){try{const blob=DriveApp.getFileById(fileId).getBlob();if(blob.getBytes().length<=300000 && /^image\/(png|jpeg|webp)$/.test(blob.getContentType()))conf.qr_image='data:'+blob.getContentType()+';base64,'+Utilities.base64Encode(blob.getBytes());}catch(err){console.error('Không đọc được ảnh QR: '+err);}}
  return conf;
}
function rowsConfig_(){return sheetRows_(spreadsheet_().getSheetByName('PaymentConfig'));}
function putConfig_(key,value){const sh=spreadsheet_().getSheetByName('PaymentConfig'),data=rowsConfig_(),idx=data.findIndex(x=>x.key===key);if(idx>=0)sh.getRange(idx+2,1,1,2).setValues([textRow_([key,value])]);else sh.appendRow(textRow_([key,value]));}
function savePaymentConfig_(user,req){
  requireRole_(user,['ADMIN']);const input=req.record||{};
  const fields=['bank_name','account_name','account_number','transfer_note'];
  const next={};fields.forEach(k=>next[k]=String(input[k]||'').trim().slice(0,k==='transfer_note'?200:100));
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw appError_('BUSY','Hệ thống đang bận.');
  try{fields.forEach(k=>putConfig_(k,next[k]));audit_(user,'payment-config','PaymentConfig','bank',null,next);return {paymentConfig:paymentConfig_()};}
  finally{lock.releaseLock();}
}
function uploadPaymentQr_(user,req){
  requireRole_(user,['ADMIN']);
  const mime=String(req.mime||''),base64=String(req.base64||'');
  if(!['image/png','image/jpeg','image/webp'].includes(mime)||base64.length>400000||base64.length<40||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw appError_('INVALID','Ảnh QR không hợp lệ hoặc vượt 300KB.');
  const bytes=Utilities.base64Decode(base64);if(bytes.length>300000)throw appError_('INVALID','Ảnh QR vượt 300KB.');
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw appError_('BUSY','Hệ thống đang bận.');
  try{
    const oldId=configRow_('qr_file_id')?.value;
    const blob=Utilities.newBlob(bytes,mime,'adledger-payment-qr.'+mime.slice(6));
    const file=DriveApp.createFile(blob);putConfig_('qr_file_id',file.getId());
    if(oldId){try{DriveApp.getFileById(oldId).setTrashed(true);}catch(err){console.warn(err);}}
    audit_(user,'payment-qr-upload','PaymentConfig','qr',null,{id:file.getId()});
    return {paymentConfig:paymentConfig_()};
  }finally{lock.releaseLock();}
}
