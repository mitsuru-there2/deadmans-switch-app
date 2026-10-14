const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, "..");
const z = require('zod');
const defer = () => { let resolve; const promise = new Promise(r => resolve=r); return {promise,resolve}; };
function loader(mocks, globals={}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root,file);
    if (cache.has(file)) return cache.get(file).exports;
    let source = fs.readFileSync(file,'utf8');
    if (file.endsWith('/app/message/[id].tsx')) source += '\nexport { Editor };\n';
    const code = ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
    const module = {exports:{}}; cache.set(file,module);
    const req = name => {
      if (Object.hasOwn(mocks,name)) return mocks[name];
      if (name.startsWith('.')) {
        let target = path.resolve(path.dirname(file),name);
        if (!fs.existsSync(target)) target += fs.existsSync(target+'.ts')?'.ts':'.tsx';
        return load(target);
      }
      return require(name);
    };
    vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{console,Response,AbortSignal,URL,Date,Promise,...globals},{filename:file})(req,module,module.exports);
    return module.exports;
  }
  return load;
}
async function checkinWhileBackground() {
  const listeners=[]; const AppState = {currentState:'active',addEventListener(type, fn){listeners.push(fn);return {remove(){}}}};
  const renewal = defer(); const started = defer(); const sent=[];
  let saved = JSON.stringify({origin:'https://mock.invalid',pending:false,session:{token:'x'.repeat(40),expiresAt:Date.now()+86400000,userId:'mock-u'}});
  const load = loader({
    'react-native':{AppState,Platform:{OS:'ios'}},
    './config':{apiUrl:'https://mock.invalid',mode:'api'},
    '../api/config':{apiUrl:'https://mock.invalid',mode:'api'},
    '../storage/vault':{},
    'expo-secure-store':{getItemAsync:async()=>saved,setItemAsync:async(k,v)=>{saved=v},WHEN_UNLOCKED_THIS_DEVICE_ONLY:1},
    'deadmans-switch-api/client':{createApiClient:require('hono/client').hc},
    'deadmans-switch-api/responses':{},
  },{fetch:async(input,init)=>{
    const url=String(input);
    if(url.endsWith('/auth/device-session')) { started.resolve(); await renewal.promise; return Response.json({token:'y'.repeat(40),expiresAt:Date.now()+180*86400000}); }
    sent.push({url,state:AppState.currentState}); return Response.json({state:'active'});
  }});
  const {foregroundCheckIn}=load('src/services/checkin.ts');
  const authority=load('src/services/foreground.ts').foregroundAuthority; authority.completeUnlock(authority.beginUnlock());
  const a=foregroundCheckIn('button');
  const b=foregroundCheckIn('button');
  assert.equal(a,b,'simultaneous check-ins coalesce');
  await started.promise;
  AppState.currentState='background'; listeners.forEach(fn=>fn('background'));
  renewal.resolve(); await assert.rejects(a, /STALE_CHECKIN_INTENT/);
  assert.equal(sent.length,0);
}
function editorHarness(gateway) {
  const states=[]; let cursor=0,prevent=false, form;
  const drafts=new Map();
  const jsx=(type,props)=>({type,props:props||{}});
  const ui=new Proxy({},{get:(_,p)=>p});
  const load=loader({
    'react':{useRef(initial){const i=cursor++;return states[i]??=( {current:initial} )},useState(initial){const i=cursor++; if(!(i in states))states[i]=initial; return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}];}},
    'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
    'react-native':{Platform:{OS:'ios'},Alert:{},View:'View'},
    'expo-router':{router:{}},
    '@tanstack/react-query':{useQueryClient:()=>({invalidateQueries:async()=>{}})},
    '@tanstack/react-form':{useForm({defaultValues}){return form??={state:{values:{...defaultValues}},setFieldValue(k,v){this.state.values[k]=v},Field:'Field'};}},
    'expo-router/react-navigation':{useNavigation:()=>({}),usePreventRemove:v=>{prevent=v}},
    '../../src/components/ui':ui,
    '../../src/services/data':{},
    '../../src/api/adapter':{gateway},
    '../../src/api/config':{mode:'api'},
    '../../src/storage/vault':{storageDescription:'mock storage'},
    '../../src/storage/drafts':{saveDraft:async(s,d)=>drafts.set(d.recipientId,{...d}),deleteDraft:async(s,id)=>drafts.delete(id)},
  });
  const {Editor}=load('app/message/[id].tsx');
  let props={recipient:{id:'r',name:'Mock',email:'mock@example.invalid',status:'pending'},local:null,saved:{title:'Title',body:'Original'},version:5,scope:'mock',canEdit:true};
  let nodes=[];
  function render(p={}) {props={...props,...p};cursor=0;nodes=[]; const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;nodes.push(n);walk(n.props?.children)};walk(Editor(props));}
  function find(type,label) {const n=nodes.find(n=>n.type===type&&(label===undefined||n.props.label===label||n.props.title===label));assert.ok(n,type+':'+label);return n.props;}
  return {render,find,drafts,get form(){return form},get prevent(){return prevent}};
}
async function templateDuringSave() {
  const save=defer(); const started=defer(); let server;
  const h=editorHarness({saveMessage:async(id,value)=>{server={...value};started.resolve();await save.promise;return {version:6}},me:async()=>({switch:{version:6}})});
  h.render();h.find('Action','お願いを追加する').onPress();h.render();h.find('Row').onPress();h.render();h.find('Input').onChangeText('Additional final wishes');h.render();
  h.find('Action','サーバーに保存').onPress();await started.promise;h.render();
  const add=h.find('Action','伝言に追加して自由編集');assert.equal(add.disabled,true);add.onPress();h.render();
  assert.equal(h.form.state.values.body,'Original');
  save.resolve();await new Promise(r=>setImmediate(r));h.render({version:6});
  assert.equal(h.prevent,false);assert.equal(h.drafts.size,0);assert.equal(server.body,'Original');
}
async function adoptsOtherWriterVersion() {
  let serverVersion=5,server={title:'Title',body:'Original'};let first=true;const writes=[];
  const h=editorHarness({saveMessage:async(id,value,version)=>{assert.equal(version,serverVersion);writes.push(version);server={...value};serverVersion++;return {version:serverVersion}},me:async()=>{if(first){first=false;server={title:'Other client',body:'Other client private update'};serverVersion++;}return {switch:{version:serverVersion}};}});
  h.render();h.find('Action','サーバーに保存').onPress();await new Promise(r=>setImmediate(r));
  server={title:'Other client',body:'Other client private update'};serverVersion=7;
  h.render({version:serverVersion,saved:{...server}});
  assert.equal(h.find('Action','サーバーに保存').disabled,true);
  h.find('Action','サーバーに保存').onPress();await new Promise(r=>setImmediate(r));
  assert.deepEqual(writes,[5]);assert.equal(server.body,'Other client private update');
}
async function staleUnlockAfterRelock() {
  const states=[];let cursor=0, effect=false, calls=0;const listeners=[];
  const me=defer();const started=defer();
  const AppState={currentState:'active',addEventListener(type,fn){listeners.push(fn);return {remove(){}}}};
  const jsx=(type,props)=>({type,props:props||{}});
  const load=loader({
    'react':{useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=v]},useEffect(fn){if(!effect){effect=true;fn()}}},
    'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{AppState,Platform:{OS:'ios'},View:'View',StyleSheet:{absoluteFill:{}}},
    '@tanstack/react-query':{useQueryClient:()=>({setQueryData(){},invalidateQueries:async()=>{}})},
    'expo-screen-capture':{usePreventScreenCapture(){}},
    '../api/config':{mode:'api'},
    '../billing/service':{suppressBillingCheckIn:()=>false},
    '../api/adapter':{gateway:{me:async()=>{started.resolve();return me.promise}}},
    '../services/checkin':{foregroundCheckIn:async()=>{calls++}},
    '../services/privacy':{unlock:async()=>true},
    './ui':{usePalette:()=>({}),Action:'Action',Body:'Body',Notice:'Notice',Title:'Title'}
  });
  const {PrivacyGate}=load('src/components/PrivacyGate.tsx');
  function render(){cursor=0;return PrivacyGate({children:'private-content'})}
  function findAction(n){if(Array.isArray(n)){for(const c of n){const a=findAction(c);if(a)return a;}}else if(n&&typeof n==='object'){if(n.type==='Action')return n.props;return findAction(n.props?.children)}}
  const pending=findAction(render()).onPress();await started.promise;
  assert.equal(states[0],true);
  AppState.currentState='background';listeners.forEach(fn=>fn('background'));
  AppState.currentState='active';listeners.forEach(fn=>fn('active'));
  assert.equal(states[0],false);
  me.resolve({switch:{entitlement:{status:'active',validUntil:Date.now()+86400000}}});await pending;
  assert.equal(states[0],false);assert.equal(calls,0);
}
module.exports={checkinWhileBackground,templateDuringSave,adoptsOtherWriterVersion,staleUnlockAfterRelock};
